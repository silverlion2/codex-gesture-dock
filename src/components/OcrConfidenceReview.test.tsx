// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OcrRegion } from '../lib/localOcr'
import { OcrConfidenceReview } from './OcrConfidenceReview'

const regions: OcrRegion[] = [
  { text: 'Certain', confidence: 96, lineId: 'line-1', x0: 10, y0: 20, x1: 90, y1: 50 },
  { text: 'unc1ear', confidence: 42, lineId: 'line-1', x0: 95, y0: 20, x1: 175, y1: 50 },
  { text: 'maybe', confidence: 71, lineId: 'line-2', x0: 10, y0: 80, x1: 90, y1: 100 },
]

afterEach(cleanup)

describe('OcrConfidenceReview', () => {
  it('shows confidence metrics, source boxes, and a selectable review list', () => {
    render(<OcrConfidenceReview source="data:image/png;base64,test" sourceLabel="sample.png" regions={regions} width={200} height={100} onClose={vi.fn()} />)

    expect(screen.getByRole('region', { name: 'OCR 置信度复核' })).toBeTruthy()
    expect(screen.getByText('3', { selector: '.ocr-confidence-summary strong' })).toBeTruthy()
    expect(screen.getByText('70%', { selector: '.ocr-confidence-summary strong' })).toBeTruthy()
    expect(screen.getByText('42%', { selector: '.ocr-confidence-summary strong' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '复核文字 unc1ear，置信度 42%' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '复核文字 maybe，置信度 71%' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'maybe 71%' }))
    expect(screen.getByRole('button', { name: 'maybe 71%' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('recomputes prompts when the heuristic threshold changes', () => {
    render(<OcrConfidenceReview source="data:image/png;base64,test" sourceLabel="sample.png" regions={regions} width={200} height={100} onClose={vi.fn()} />)

    fireEvent.change(screen.getByRole('slider', { name: 'OCR 置信度提示阈值' }), { target: { value: '50' } })
    expect(screen.getByText('提示阈值 < 50%')).toBeTruthy()
    expect(screen.getByRole('button', { name: '复核文字 unc1ear，置信度 42%' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '复核文字 maybe，置信度 71%' })).toBeNull()
  })

  it('lets users include and correct high-confidence words', () => {
    render(<OcrConfidenceReview source="data:image/png;base64,test" sourceLabel="sample.png" regions={regions} width={200} height={100} onClose={vi.fn()} onApplyCorrections={vi.fn()} />)

    expect(screen.queryByRole('button', { name: '复核文字 Certain，置信度 96%' })).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: '显示全部 OCR 词框' }))
    expect(screen.getByRole('button', { name: '复核文字 Certain，置信度 96%' })).toBeTruthy()
    expect(screen.getByRole('list', { name: '全部 OCR 词框' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Certain 96%' }))
    expect(screen.getByRole('textbox', { name: '校正文字 Certain' })).toBeTruthy()
  })

  it('pages all-word review in stable groups of 100', () => {
    const longResult = Array.from({ length: 101 }, (_, index): OcrRegion => ({
      text: `word-${index}`,
      confidence: 99,
      lineId: `line-${index}`,
      x0: index % 10,
      y0: Math.floor(index / 10),
      x1: index % 10 + 1,
      y1: Math.floor(index / 10) + 1,
    }))
    render(<OcrConfidenceReview source="data:image/png;base64,test" sourceLabel="long.png" regions={longResult} width={20} height={20} onClose={vi.fn()} onApplyCorrections={vi.fn()} />)

    fireEvent.click(screen.getByRole('checkbox', { name: '显示全部 OCR 词框' }))
    expect(screen.getByText('第 1/2 组')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'word-0 99%' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '下一组' }))
    expect(screen.getByText('第 2/2 组')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'word-100 99%' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'word-0 99%' })).toBeNull()
  })

  it('returns without modifying OCR content', async () => {
    const onClose = vi.fn()
    render(<OcrConfidenceReview source="data:image/png;base64,test" sourceLabel="sample.png" regions={regions} width={200} height={100} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: '返回 OCR 文本' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(screen.getByText(/提示框不会修改文字或导出内容/)).toBeTruthy()
  })

  it('records explicit word corrections and applies them only after confirmation', async () => {
    const onApplyCorrections = vi.fn()
    const onClose = vi.fn()
    render(<OcrConfidenceReview source="data:image/png;base64,test" sourceLabel="sample.png" regions={regions} width={200} height={100} onClose={onClose} onApplyCorrections={onApplyCorrections} />)

    const correction = screen.getByRole('textbox', { name: '校正文字 unc1ear' })
    fireEvent.change(correction, { target: { value: 'unclear' } })
    expect(onApplyCorrections).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '记录此词' }))
    fireEvent.click(screen.getByRole('button', { name: '应用 1 项复核' }))

    expect(onApplyCorrections).toHaveBeenCalledWith([{ index: 1, text: 'unclear' }])
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('shows reviewed provenance and lets users explicitly record deletion', async () => {
    const corrected = regions.map((region, index) => index === 1 ? { ...region, text: 'unclear', recognizedText: 'unc1ear', humanReviewed: true } : region)
    const onApplyCorrections = vi.fn()
    render(<OcrConfidenceReview source="data:image/png;base64,test" sourceLabel="sample.png" regions={corrected} width={200} height={100} onClose={vi.fn()} onApplyCorrections={onApplyCorrections} />)

    expect(screen.getByText('已核对', { selector: '.ocr-confidence-list span' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'unclear 已核对' }))
    expect(screen.getByText(/引擎识别：unc1ear · 已人工核对/)).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: '校正文字 unc1ear' }), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '记录此词' }))
    fireEvent.click(screen.getByRole('button', { name: '应用 1 项复核' }))
    expect(onApplyCorrections).toHaveBeenCalledWith([{ index: 1, text: '' }])
  })
})

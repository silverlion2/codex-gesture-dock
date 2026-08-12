// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

  it('returns without modifying OCR content', () => {
    const onClose = vi.fn()
    render(<OcrConfidenceReview source="data:image/png;base64,test" sourceLabel="sample.png" regions={regions} width={200} height={100} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: '返回 OCR 文本' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/提示框不会修改文字或导出内容/)).toBeTruthy()
  })
})

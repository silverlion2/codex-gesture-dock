// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  recognizeLocalFile,
  type LocalOcrRecognizer,
  type OcrLanguage,
} from '../lib/localOcr'
import { OcrToolPanel } from './OcrToolPanel'

const ocrMocks = vi.hoisted(() => ({
  recognizeLocalFile: vi.fn(),
  withLocalOcrSession: vi.fn(),
}))

vi.mock('../lib/localOcr', () => ({
  recognizeLocalFile: ocrMocks.recognizeLocalFile,
  withLocalOcrSession: ocrMocks.withLocalOcrSession,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('OcrToolPanel', () => {
  beforeEach(() => {
    ocrMocks.withLocalOcrSession.mockImplementation(async (
      language: OcrLanguage,
      run: (recognize: LocalOcrRecognizer) => Promise<unknown>,
    ) => run(
      (file, onProgress, signal) => ocrMocks.recognizeLocalFile(
        file,
        language,
        onProgress,
        signal,
      ),
    ))
  })

  it('offers local image and PDF OCR', () => {
    render(<OcrToolPanel mode="ocr" onMessage={vi.fn()} />)

    expect(screen.getByText('导入图像或 PDF')).toBeTruthy()
    expect(screen.getByText('模型与文件均留在本机')).toBeTruthy()
    expect(screen.getByRole('combobox', { name: '识别语言' })).toBeTruthy()
    expect(screen.getByText(/一次选择多个文件/)).toBeTruthy()
  })

  it('processes a local file batch sequentially and keeps per-file results', async () => {
    vi.mocked(recognizeLocalFile)
      .mockResolvedValueOnce({
        text: 'First document',
        pageCount: 1,
        source: 'ocr',
        regions: [{ text: 'F1rst', confidence: 54, lineId: '0-0-0', x0: 10, y0: 20, x1: 70, y1: 45 }],
      })
      .mockResolvedValueOnce({ text: 'Second document', pageCount: 2, source: 'embedded-text' })
    const onMessage = vi.fn()
    const { container } = render(<OcrToolPanel mode="ocr" onMessage={onMessage} />)

    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: {
        files: [
          new File(['first'], 'first.png', { type: 'image/png' }),
          new File(['second'], 'second.pdf', { type: 'application/pdf' }),
        ],
      },
    })

    await waitFor(() => expect(onMessage).toHaveBeenCalledWith('批量 OCR 已完成：成功 2 个，失败 0 个'))
    expect(ocrMocks.withLocalOcrSession).toHaveBeenCalledTimes(1)
    expect(ocrMocks.withLocalOcrSession).toHaveBeenCalledWith('eng+chi_sim', expect.any(Function))
    expect(recognizeLocalFile).toHaveBeenCalledTimes(2)
    expect(screen.getByText('2 / 2 完成')).toBeTruthy()
    expect((screen.getByRole('textbox', { name: '所选文件 OCR 文本' }) as HTMLTextAreaElement).value).toBe('First document')
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:ocr-preview') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    expect(screen.getByRole('button', { name: '版面 JSON' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '版面 CSV' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '置信度复核 1' }))
    expect(screen.getByRole('region', { name: 'OCR 置信度复核' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '返回 OCR 文本' }))
    expect((screen.getByRole('textbox', { name: '所选文件 OCR 文本' }) as HTMLTextAreaElement).value).toBe('First document')
    fireEvent.click(screen.getByRole('button', { name: /second\.pdf/ }))
    expect((screen.getByRole('textbox', { name: '所选文件 OCR 文本' }) as HTMLTextAreaElement).value).toBe('Second document')
    expect(screen.getByRole('button', { name: '导出合并 TXT' })).toBeTruthy()
  })

  it('cancels unfinished batch work while preserving the queue status', async () => {
    vi.mocked(recognizeLocalFile).mockImplementation((_file, _language, _progress, signal) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true })
    }))
    const onMessage = vi.fn()
    const { container } = render(<OcrToolPanel mode="ocr" onMessage={onMessage} />)
    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['first'], 'first.png', { type: 'image/png' })] },
    })

    await waitFor(() => expect(screen.getByRole('button', { name: '取消批次' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '取消批次' }))

    await waitFor(() => expect(onMessage).toHaveBeenCalledWith('已取消批量 OCR；已完成结果仍保留在本机'))
    expect(screen.getByText('取消')).toBeTruthy()
    expect(screen.getByRole('button', { name: '选择新批次' })).toBeTruthy()
  })

  it('leaves the running state after a failed batch under React Strict Mode', async () => {
    vi.mocked(recognizeLocalFile).mockRejectedValue(new Error('Unsupported image'))
    const onMessage = vi.fn()
    const { container } = render(
      <StrictMode><OcrToolPanel mode="ocr" onMessage={onMessage} /></StrictMode>,
    )
    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['bad'], 'bad.svg', { type: 'image/svg+xml' })] },
    })

    await waitFor(() => expect(onMessage).toHaveBeenCalledWith('批量 OCR 已完成：成功 0 个，失败 1 个'))
    expect(screen.getByRole('button', { name: '选择新批次' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '取消批次' })).toBeNull()
    expect(screen.getByText('Unsupported image')).toBeTruthy()
  })

  it('opens a checksum-aware MRZ review from a completed file OCR result', async () => {
    vi.mocked(recognizeLocalFile).mockResolvedValue({
      text: [
        'P<GBRERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
        'L898902C36GBR7408122F1204159ZE184226B<<<<<10',
      ].join('\n'),
      pageCount: 1,
      source: 'ocr',
    })
    const onMessage = vi.fn()
    const { container } = render(<OcrToolPanel mode="ocr" onMessage={onMessage} />)
    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['passport'], 'passport.png', { type: 'image/png' })] },
    })

    await waitFor(() => expect(screen.getByRole('button', { name: '提取 MRZ' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '提取 MRZ' }))

    await waitFor(
      () => expect(screen.getByRole('region', { name: '证件 MRZ 结构化字段' })).toBeTruthy(),
      { timeout: 10_000 },
    )
    expect(screen.getByText('TD3 · 校验位通过')).toBeTruthy()
    expect(screen.getByDisplayValue('L898902C3')).toBeTruthy()
    expect(onMessage).toHaveBeenCalledWith('已提取证件 MRZ 且校验位通过，请对照原证件复核')
  }, 15_000)

  it('turns recognized card text into editable fields', async () => {
    vi.mocked(recognizeLocalFile).mockResolvedValue({
      text: 'Alex Chen\nEngineer\nNorthwind Inc.\nalex@example.com\n+1 555 0100',
      pageCount: 1,
      source: 'ocr',
      regions: [{ text: 'Eng1neer', confidence: 63, lineId: '0-0-1', x0: 10, y0: 50, x1: 100, y1: 75 }],
    })
    const onMessage = vi.fn()
    const { container } = render(<OcrToolPanel mode="card" onMessage={onMessage} />)
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    expect(input).toBeTruthy()

    fireEvent.change(input!, {
      target: { files: [new File(['image'], 'card.png', { type: 'image/png' })] },
    })

    await waitFor(() => expect(screen.getByDisplayValue('Alex Chen')).toBeTruthy())
    expect(screen.getByDisplayValue('alex@example.com')).toBeTruthy()
    expect(screen.getByRole('button', { name: '版面 JSON' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '版面 CSV' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '确认并导出 VCF' })).toBeTruthy()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:card-preview') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    fireEvent.click(screen.getByRole('button', { name: '置信度复核 1' }))
    expect(screen.getByRole('region', { name: 'OCR 置信度复核' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '返回 OCR 文本' }))
    expect(screen.getByDisplayValue('Alex Chen')).toBeTruthy()
    expect(onMessage).toHaveBeenCalledWith('名片已在本机识别，请确认字段后导出')
  })
})

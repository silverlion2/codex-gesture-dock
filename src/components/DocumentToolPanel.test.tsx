// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureFromImageFile,
  downloadScannedPage,
  downloadScannedPdf,
  scanCapturedDocument,
} from '../lib/documentScanner'
import { recognizeLocalFile } from '../lib/localOcr'
import { DocumentToolPanel } from './DocumentToolPanel'

vi.mock('../lib/documentScanner', () => ({
  captureFromImageFile: vi.fn(),
  downloadScannedPage: vi.fn(),
  downloadScannedPdf: vi.fn(),
  scanCapturedDocument: vi.fn(),
}))

vi.mock('../lib/localOcr', () => ({
  recognizeLocalFile: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const page = {
  id: 'page-1',
  sourceDataUrl: 'data:image/png;base64,c291cmNl',
  dataUrl: 'data:image/png;base64,c2Nhbg==',
  filename: 'receipt-processed.png',
  width: 840,
  height: 1_188,
  filter: 'document' as const,
  autoDetected: true,
}

describe('DocumentToolPanel', () => {
  it('imports, corrects, exports, and hands a scanned page to OCR', async () => {
    vi.mocked(captureFromImageFile).mockResolvedValue({
      dataUrl: page.sourceDataUrl,
      filename: 'receipt.png',
    })
    vi.mocked(scanCapturedDocument).mockResolvedValue(page)
    vi.mocked(downloadScannedPdf).mockResolvedValue(undefined)
    vi.mocked(recognizeLocalFile).mockResolvedValue({
      text: 'Invoice 2026-08-08',
      pageCount: 1,
      source: 'ocr',
    })
    const onMessage = vi.fn()
    const { container } = render(
      <DocumentToolPanel
        videoRef={{ current: null }}
        mirrored={false}
        sessionReady={false}
        onMessage={onMessage}
      />,
    )
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    expect(input).toBeTruthy()

    fireEvent.change(input!, {
      target: { files: [new File(['image'], 'receipt.png', { type: 'image/png' })] },
    })

    await waitFor(() => expect(screen.getByRole('button', { name: '1 页 PDF' })).toBeTruthy())
    expect(screen.getByAltText('第 1 页扫描预览')).toBeTruthy()
    expect(onMessage).toHaveBeenCalledWith('已检测纸张边缘并完成透视矫正')

    fireEvent.click(screen.getByRole('button', { name: '1 页 PDF' }))
    await waitFor(() => expect(downloadScannedPdf).toHaveBeenCalledWith([page]))

    fireEvent.click(screen.getByRole('button', { name: 'OCR 本页' }))
    await waitFor(() => expect((screen.getByRole('textbox', { name: '当前扫描页 OCR 文本' }) as HTMLTextAreaElement).value).toBe('Invoice 2026-08-08'))
    expect(recognizeLocalFile).toHaveBeenCalledWith(expect.any(File), 'eng+chi_sim', expect.any(Function), expect.any(AbortSignal))

    fireEvent.click(screen.getByRole('button', { name: 'PNG' }))
    expect(downloadScannedPage).toHaveBeenCalledWith(page)
  })

  it('keeps camera capture unavailable until the camera is ready', () => {
    render(
      <DocumentToolPanel
        videoRef={{ current: null }}
        mirrored={false}
        sessionReady={false}
        onMessage={vi.fn()}
      />,
    )

    expect((screen.getByRole('button', { name: '请先启动摄像头' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('边缘检测与导出均在本机')).toBeTruthy()
  })
})

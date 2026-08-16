// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyDocumentRedactions,
  captureFromImageFile,
  captureFromPdfFile,
  downloadScannedPage,
  downloadScannedPdf,
  rotateScannedDocumentPage,
  scanCapturedDocument,
} from '../lib/documentScanner'
import {
  recognizeLocalFile,
  type LocalOcrRecognizer,
  type OcrLanguage,
} from '../lib/localOcr'
import { downloadSearchableScannedPdf } from '../lib/searchableDocumentPdf'
import { DocumentToolPanel } from './DocumentToolPanel'

const ocrMocks = vi.hoisted(() => ({
  recognizeLocalFile: vi.fn(),
  withLocalOcrSession: vi.fn(),
}))

vi.mock('../lib/documentScanner', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/documentScanner')>(),
  applyDocumentRedactions: vi.fn(),
  captureFromImageFile: vi.fn(),
  captureFromPdfFile: vi.fn(),
  downloadScannedPage: vi.fn(),
  downloadScannedPdf: vi.fn(),
  rotateScannedDocumentPage: vi.fn(),
  scanCapturedDocument: vi.fn(),
}))

vi.mock('../lib/localOcr', () => ({
  recognizeLocalFile: ocrMocks.recognizeLocalFile,
  withLocalOcrSession: ocrMocks.withLocalOcrSession,
}))

vi.mock('../lib/searchableDocumentPdf', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/searchableDocumentPdf')>(),
  downloadSearchableScannedPdf: vi.fn(),
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
  correction: 'auto' as const,
  corners: {
    topLeft: { x: 40, y: 30 },
    topRight: { x: 860, y: 35 },
    bottomRight: { x: 850, y: 1_160 },
    bottomLeft: { x: 35, y: 1_150 },
  },
  sourceWidth: 900,
  sourceHeight: 1_200,
  baseDataUrl: 'data:image/png;base64,c2Nhbg==',
  redactions: [],
  quality: {
    status: 'good' as const,
    width: 1_200,
    height: 1_600,
    meanLuminance: 188,
    contrast: 61,
    sharpness: 18,
    shadowRatio: 0.02,
    highlightRatio: 0.12,
    issues: [],
  },
}

describe('DocumentToolPanel', () => {
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

  it('imports, corrects, exports, and hands a scanned page to OCR', async () => {
    vi.mocked(captureFromImageFile).mockResolvedValue({
      dataUrl: page.sourceDataUrl,
      filename: 'receipt.png',
    })
    vi.mocked(scanCapturedDocument).mockResolvedValue(page)
    vi.mocked(downloadScannedPdf).mockResolvedValue(undefined)
    vi.mocked(recognizeLocalFile).mockResolvedValue({
      text: 'Northwind Cafe\nInvoice # QA-2026-0808\nDate 2026-08-08\nSubtotal $ 128.00\nTax $ 12.80\nGrand T0tal $ 140.80',
      pageCount: 1,
      source: 'ocr',
      regions: [
        { text: 'billing@northwind.test', confidence: 96, lineId: '0-0-0', x0: 90, y0: 180, x1: 360, y1: 218 },
        { text: 'T0tal', confidence: 58, lineId: '0-0-1', x0: 90, y0: 420, x1: 180, y1: 458 },
      ],
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
    expect((screen.getByRole('button', { name: '可搜索 PDF 0/1' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByAltText('第 1 页扫描预览')).toBeTruthy()
    expect(screen.getByText('原图质量良好')).toBeTruthy()
    expect(onMessage).toHaveBeenCalledWith('已检测纸张边缘并完成透视矫正')

    fireEvent.click(screen.getByRole('button', { name: '1 页 PDF' }))
    await waitFor(() => expect(downloadScannedPdf).toHaveBeenCalledWith([page]))

    fireEvent.click(screen.getByRole('button', { name: 'OCR 本页' }))
    await waitFor(() => expect((screen.getByRole('textbox', { name: '当前扫描页 OCR 文本' }) as HTMLTextAreaElement).value).toContain('Grand T0tal $ 140.80'))
    expect(recognizeLocalFile).toHaveBeenCalledWith(expect.any(File), 'eng+chi_sim', expect.any(Function), expect.any(AbortSignal))
    expect((screen.getByRole('button', { name: '可搜索 PDF 1/1' }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '可搜索 PDF 1/1' }))
    await waitFor(() => expect(downloadSearchableScannedPdf).toHaveBeenCalledWith([
      expect.objectContaining({
        page,
        regions: expect.arrayContaining([expect.objectContaining({ text: 'billing@northwind.test' })]),
      }),
    ], { onProgress: expect.any(Function) }))
    expect(onMessage).toHaveBeenCalledWith('已生成 1 页本机可搜索 PDF；文字层来自当前逐词复核结果与原坐标')

    fireEvent.click(screen.getByRole('button', { name: '置信度复核 1' }))
    expect(screen.getByRole('region', { name: 'OCR 置信度复核' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '复核文字 T0tal，置信度 58%' })).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: '校正文字 T0tal' }), { target: { value: 'Total' } })
    fireEvent.click(screen.getByRole('button', { name: '记录此词' }))
    fireEvent.click(screen.getByRole('button', { name: '应用 1 项复核' }))
    await waitFor(() => expect((screen.getByRole('textbox', { name: '当前扫描页 OCR 文本' }) as HTMLTextAreaElement).value).toContain('Grand Total $ 140.80'))
    expect(onMessage).toHaveBeenCalledWith('已应用 1 项逐词复核，其中 1 项改字；版面与可搜索 PDF 将使用校正词')
    fireEvent.click(screen.getByRole('button', { name: '可搜索 PDF 1/1' }))
    await waitFor(() => expect(downloadSearchableScannedPdf).toHaveBeenLastCalledWith([
      expect.objectContaining({ regions: expect.arrayContaining([expect.objectContaining({ text: 'Total', recognizedText: 'T0tal', humanReviewed: true })]) }),
    ], { onProgress: expect.any(Function) }))

    fireEvent.change(screen.getByRole('textbox', { name: '当前扫描页 OCR 文本' }), {
      target: { value: 'Reviewed Cafe\nInvoice # QA-2026-0808\nDate 2026-08-08\nSubtotal $ 128.00\nTax $ 12.80\nGrand Total $ 140.80' },
    })
    expect(screen.getByText(/已人工修正 · 复制、提取与 TXT 将使用当前文本/)).toBeTruthy()
    expect(screen.getByText(/逐词复核会同步版面与可搜索 PDF/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '版面 JSON' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '版面 CSV' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '版面 hOCR' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '版面 ALTO' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '表格辅助' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '提取票据' }))
    expect(screen.getByRole('region', { name: '票据结构化字段' })).toBeTruthy()
    expect((screen.getByRole('textbox', { name: '商户 / 公司' }) as HTMLInputElement).value).toBe('Reviewed Cafe')
    expect((screen.getByRole('textbox', { name: '总额' }) as HTMLInputElement).value).toBe('140.80')
    fireEvent.click(screen.getByRole('button', { name: '返回扫描页' }))
    fireEvent.click(screen.getByRole('button', { name: '恢复识别文本与词框' }))
    expect((screen.getByRole('textbox', { name: '当前扫描页 OCR 文本' }) as HTMLTextAreaElement).value).toContain('Northwind Cafe')
    expect((screen.getByRole('textbox', { name: '当前扫描页 OCR 文本' }) as HTMLTextAreaElement).value).toContain('Grand T0tal')
    expect(onMessage).toHaveBeenCalledWith('已恢复当前页的本机 OCR 原始文本与词框')

    fireEvent.click(screen.getByRole('button', { name: '复核 1 处敏感信息' }))
    expect(screen.getByRole('dialog', { name: '文档隐私遮盖' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '遮盖区 1' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))

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

  it('uses the selected Traditional Chinese language for subsequent scanned-page OCR', async () => {
    vi.mocked(captureFromImageFile).mockResolvedValue({ dataUrl: page.sourceDataUrl, filename: 'traditional.png' })
    vi.mocked(scanCapturedDocument).mockResolvedValue(page)
    vi.mocked(recognizeLocalFile).mockResolvedValue({
      text: '繁體文字',
      pageCount: 1,
      source: 'ocr',
      regions: [{ text: '繁體', confidence: 92, lineId: 'line-1', x0: 10, y0: 10, x1: 70, y1: 35 }],
    })
    const { container } = render(
      <DocumentToolPanel videoRef={{ current: null }} mirrored={false} sessionReady={false} onMessage={vi.fn()} />,
    )
    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['image'], 'traditional.png', { type: 'image/png' })] },
    })
    await waitFor(() => expect(screen.getByRole('button', { name: 'OCR 本页' })).toBeTruthy())
    fireEvent.change(screen.getByRole('combobox', { name: '扫描页 OCR 语言' }), { target: { value: 'eng+chi_tra' } })
    fireEvent.click(screen.getByRole('button', { name: 'OCR 本页' }))
    await waitFor(() => expect(screen.getByDisplayValue('繁體文字')).toBeTruthy())
    expect(recognizeLocalFile).toHaveBeenCalledWith(expect.any(File), 'eng+chi_tra', expect.any(Function), expect.any(AbortSignal))
  })

  it('shows advisory quality problems without disabling OCR or export', async () => {
    const poorPage = {
      ...page,
      quality: {
        ...page.quality,
        status: 'poor' as const,
        issues: [
          { code: 'blur' as const, label: '可能模糊', guidance: '稳定镜头并重新对焦后再拍摄。' },
          { code: 'glare' as const, label: '疑似局部反光', guidance: '调整灯光或拍摄角度。' },
        ],
      },
    }
    vi.mocked(captureFromImageFile).mockResolvedValue({ dataUrl: page.sourceDataUrl, filename: 'blurred.png' })
    vi.mocked(scanCapturedDocument).mockResolvedValue(poorPage)
    const onMessage = vi.fn()
    const { container } = render(<DocumentToolPanel videoRef={{ current: null }} mirrored={false} sessionReady={false} onMessage={onMessage} />)

    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['image'], 'blurred.png', { type: 'image/png' })] },
    })
    await waitFor(() => expect(screen.getByText('建议重拍或更换原图')).toBeTruthy())
    expect(screen.getByText('可能模糊')).toBeTruthy()
    expect(screen.getByText('疑似局部反光')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'OCR 本页' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: '1 页 PDF' }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '下一质量问题页 1' }))
    expect(onMessage).toHaveBeenCalledWith('已定位第 1 页；发现 2 项拍摄质量建议')
  })

  it('rotates a reviewed page, preserves its transformed redactions, and clears stale OCR', async () => {
    const redaction = { id: 'private', x: 0.1, y: 0.2, width: 0.3, height: 0.4 }
    const redactedPage = { ...page, redactions: [redaction], rotation: 0 as const }
    const rotatedPage = {
      ...redactedPage,
      width: page.height,
      height: page.width,
      rotation: 90 as const,
      redactions: [{ id: 'private', x: 0.4, y: 0.1, width: 0.4, height: 0.3 }],
    }
    vi.mocked(captureFromImageFile).mockResolvedValue({ dataUrl: page.sourceDataUrl, filename: 'receipt.png' })
    vi.mocked(scanCapturedDocument).mockResolvedValue(redactedPage)
    vi.mocked(rotateScannedDocumentPage).mockResolvedValue(rotatedPage)
    vi.mocked(recognizeLocalFile).mockResolvedValue({ text: 'stale OCR', pageCount: 1, source: 'ocr', regions: [] })
    const onMessage = vi.fn()
    const { container } = render(<DocumentToolPanel videoRef={{ current: null }} mirrored={false} sessionReady={false} onMessage={onMessage} />)

    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['image'], 'receipt.png', { type: 'image/png' })] },
    })
    await waitFor(() => expect(screen.getByRole('button', { name: 'OCR 本页' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'OCR 本页' }))
    await waitFor(() => expect(screen.getByDisplayValue('stale OCR')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '向右旋转' }))

    await waitFor(() => expect(rotateScannedDocumentPage).toHaveBeenCalledWith(redactedPage, 'right'))
    expect(screen.queryByDisplayValue('stale OCR')).toBeNull()
    expect(onMessage).toHaveBeenCalledWith('已向右旋转当前页；隐私遮盖位置已同步')
  })

  it('opens checksum-aware MRZ review from scanned-page OCR', async () => {
    vi.mocked(captureFromImageFile).mockResolvedValue({
      dataUrl: page.sourceDataUrl,
      filename: 'passport.png',
    })
    vi.mocked(scanCapturedDocument).mockResolvedValue(page)
    vi.mocked(recognizeLocalFile).mockResolvedValue({
      text: [
        'P<GBRERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
        'L898902C36GBR7408122F1204159ZE184226B<<<<<10',
      ].join('\n'),
      pageCount: 1,
      source: 'ocr',
      regions: [],
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
    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['passport'], 'passport.png', { type: 'image/png' })] },
    })
    await waitFor(() => expect(screen.getByRole('button', { name: 'OCR 本页' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'OCR 本页' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '提取 MRZ' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '提取 MRZ' }))

    await waitFor(
      () => expect(screen.getByRole('region', { name: '证件 MRZ 结构化字段' })).toBeTruthy(),
      { timeout: 10_000 },
    )
    expect(screen.getByDisplayValue('L898902C3')).toBeTruthy()
    expect(onMessage).toHaveBeenCalledWith('已提取证件 MRZ 且校验位通过，请对照原证件复核')
  }, 15_000)

  it('rasterizes and adds every reviewed PDF page to the document workbench', async () => {
    const secondPage = { ...page, id: 'page-2', filename: 'report-page-2-processed.png' }
    vi.mocked(captureFromPdfFile).mockResolvedValue([
      { dataUrl: page.sourceDataUrl, filename: 'report-page-1.png' },
      { dataUrl: page.sourceDataUrl, filename: 'report-page-2.png' },
    ])
    vi.mocked(scanCapturedDocument).mockResolvedValueOnce(page).mockResolvedValueOnce(secondPage)
    const onMessage = vi.fn()
    const { container } = render(
      <DocumentToolPanel
        videoRef={{ current: null }}
        mirrored={false}
        sessionReady={false}
        onMessage={onMessage}
      />,
    )
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
    expect(input.accept).toContain('application/pdf')

    fireEvent.change(input, {
      target: { files: [new File(['pdf'], 'report.pdf', { type: 'application/pdf' })] },
    })

    await waitFor(() => expect(screen.getByRole('button', { name: '2 页 PDF' })).toBeTruthy())
    expect(captureFromPdfFile).toHaveBeenCalledWith(expect.any(File), expect.any(Function))
    expect(scanCapturedDocument).toHaveBeenNthCalledWith(1, expect.objectContaining({ filename: 'report-page-1.png' }), 'document')
    expect(scanCapturedDocument).toHaveBeenNthCalledWith(2, expect.objectContaining({ filename: 'report-page-2.png' }), 'document')
    expect(screen.getByRole('button', { name: '1', pressed: true })).toBeTruthy()
    expect(screen.getByRole('button', { name: '2', pressed: false })).toBeTruthy()
    expect(onMessage).toHaveBeenCalledWith('已在本机导入并栅格化 2 页 PDF，请逐页复核')
  })

  it('reorders scanned pages while preserving the active page OCR and PDF order', async () => {
    const secondPage = {
      ...page,
      id: 'page-2',
      dataUrl: 'data:image/png;base64,c2NhbjI=',
      baseDataUrl: 'data:image/png;base64,c2NhbjI=',
      filename: 'report-page-2-processed.png',
    }
    vi.mocked(captureFromPdfFile).mockResolvedValue([
      { dataUrl: page.sourceDataUrl, filename: 'report-page-1.png' },
      { dataUrl: secondPage.sourceDataUrl, filename: 'report-page-2.png' },
    ])
    vi.mocked(scanCapturedDocument).mockResolvedValueOnce(page).mockResolvedValueOnce(secondPage)
    vi.mocked(recognizeLocalFile).mockResolvedValue({
      text: 'second page OCR',
      pageCount: 1,
      source: 'ocr',
      regions: [{ text: 'privacy@example.com', confidence: 93, lineId: 'line-1', x0: 10, y0: 10, x1: 170, y1: 32 }],
    })
    vi.mocked(downloadScannedPdf).mockResolvedValue(undefined)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:document-ocr')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    let downloadedFilename = ''
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function captureDownload(this: HTMLAnchorElement) {
      downloadedFilename = this.download
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

    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['pdf'], 'report.pdf', { type: 'application/pdf' })] },
    })
    await waitFor(() => expect(screen.getByRole('button', { name: '2 页 PDF' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '2', pressed: false }))
    fireEvent.click(screen.getByRole('button', { name: 'OCR 本页' }))
    await waitFor(() => expect(screen.getByDisplayValue('second page OCR')).toBeTruthy())
    expect((screen.getByRole('button', { name: 'OCR TXT 1/2' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: '多页 hOCR 1/2' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '多页 ALTO 1/2' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '多页 JSON 1/2' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '多页 CSV 1/2' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByRole('textbox', { name: '当前扫描页 OCR 文本' }), { target: { value: 'reviewed second page' } })

    fireEvent.click(screen.getByRole('button', { name: '1', pressed: false }))
    expect(screen.queryByDisplayValue('reviewed second page')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '2', pressed: false }))
    expect(screen.getByDisplayValue('reviewed second page')).toBeTruthy()

    expect((screen.getByRole('button', { name: '前移一页' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: '后移一页' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '前移一页' }))

    expect(screen.getByRole('button', { name: '1', pressed: true })).toBeTruthy()
    expect(screen.getByDisplayValue('reviewed second page')).toBeTruthy()
    expect(screen.getByAltText('第 1 页扫描预览').getAttribute('src')).toBe(secondPage.dataUrl)
    expect(onMessage).toHaveBeenCalledWith('已将当前页前移一页；OCR 与遮盖内容已随页面保留')

    fireEvent.click(screen.getByRole('button', { name: '2 页 PDF' }))
    await waitFor(() => expect(downloadScannedPdf).toHaveBeenCalledWith([secondPage, page]))

    fireEvent.click(screen.getByRole('button', { name: 'OCR TXT 1/2' }))
    expect(downloadedFilename).toBe('report-page-2-all-pages-ocr.txt')
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:document-ocr')
    expect(onMessage).toHaveBeenCalledWith('已导出 1 页 OCR 文本；另有 1 页以“尚未执行 OCR”标记')

    fireEvent.click(screen.getByRole('button', { name: 'OCR 未识别页 1' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'OCR TXT 2/2' })).toBeTruthy())
    expect(ocrMocks.withLocalOcrSession).toHaveBeenCalledTimes(1)
    expect(ocrMocks.withLocalOcrSession).toHaveBeenCalledWith('eng+chi_sim', expect.any(Function))
    expect(recognizeLocalFile).toHaveBeenCalledTimes(2)
    expect(onMessage).toHaveBeenCalledWith('已完成其余 1 页 OCR；全部 2 页已有文本')
    expect((screen.getByRole('button', { name: 'OCR 未识别页 0' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '多页 hOCR 2/2' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: '多页 ALTO 2/2' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: '多页 JSON 2/2' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: '多页 CSV 2/2' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByRole('button', { name: '下一敏感页 2 处 / 2 页' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '下一敏感页 2 处 / 2 页' }))
    expect(screen.getByRole('dialog', { name: '文档隐私遮盖' })).toBeTruthy()
    expect(onMessage).toHaveBeenCalledWith('已定位第 2 页的 1 处疑似敏感信息；请逐项调整、删除或确认')
    fireEvent.click(screen.getByRole('button', { name: '取消' }))

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索全部扫描页 OCR' }), { target: { value: 'page' } })
    expect(screen.getByRole('button', { name: '下一匹配页 2' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '下一匹配页 2' }))
    expect(onMessage).toHaveBeenCalledWith('已定位第 1 页；此页有 1 处文字匹配')

    fireEvent.click(screen.getByRole('button', { name: 'OCR TXT 2/2' }))
    expect(onMessage).toHaveBeenCalledWith('已按当前页序导出 2 页 OCR 文本')

    fireEvent.click(screen.getByRole('button', { name: '多页 JSON 2/2' }))
    expect(downloadedFilename).toBe('report-page-2-all-pages-ocr-layout.json')
    expect(onMessage).toHaveBeenCalledWith('已按当前页序导出 2 页 JSON 版面')

    fireEvent.click(screen.getByRole('button', { name: '多页 CSV 2/2' }))
    expect(downloadedFilename).toBe('report-page-2-all-pages-ocr-layout.csv')
    expect(onMessage).toHaveBeenCalledWith('已按当前页序导出 2 页 CSV 版面')

    fireEvent.click(screen.getByRole('button', { name: '多页 hOCR 2/2' }))
    expect(downloadedFilename).toBe('report-page-2-all-pages-ocr-layout.hocr')
    expect(onMessage).toHaveBeenCalledWith('已按当前页序导出 2 页 hOCR 版面')

    fireEvent.click(screen.getByRole('button', { name: '多页 ALTO 2/2' }))
    expect(downloadedFilename).toBe('report-page-2-all-pages-ocr-layout.alto.xml')
    expect(onMessage).toHaveBeenCalledWith('已按当前页序导出 2 页 ALTO 4.4 版面')
  })

  it('lets keyboard users correct detected corners and reprocess the page', async () => {
    vi.mocked(captureFromImageFile).mockResolvedValue({
      dataUrl: page.sourceDataUrl,
      filename: 'receipt.png',
    })
    vi.mocked(scanCapturedDocument)
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce({ ...page, correction: 'manual', autoDetected: false })
    const { container } = render(
      <DocumentToolPanel
        videoRef={{ current: null }}
        mirrored={false}
        sessionReady={false}
        onMessage={vi.fn()}
      />,
    )

    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['image'], 'receipt.png', { type: 'image/png' })] },
    })
    await waitFor(() => expect(screen.getByRole('button', { name: '调整边缘' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: '调整边缘' }))
    fireEvent.keyDown(screen.getByRole('button', { name: '调整左上角' }), { key: 'ArrowRight' })
    fireEvent.click(screen.getByRole('button', { name: '应用边缘' }))

    await waitFor(() => expect(scanCapturedDocument).toHaveBeenCalledTimes(2))
    expect(vi.mocked(scanCapturedDocument).mock.calls[1][3]?.topLeft.x).toBe(42)
  })

  it('reviews and permanently applies local redaction boxes', async () => {
    vi.mocked(captureFromImageFile).mockResolvedValue({
      dataUrl: page.sourceDataUrl,
      filename: 'receipt.png',
    })
    vi.mocked(scanCapturedDocument).mockResolvedValue(page)
    vi.mocked(applyDocumentRedactions).mockImplementation(async (currentPage, redactions) => ({
      ...currentPage,
      dataUrl: 'data:image/png;base64,cmVkYWN0ZWQ=',
      filename: 'receipt-processed-redacted.png',
      redactions,
    }))
    const onMessage = vi.fn()
    const { container } = render(
      <DocumentToolPanel
        videoRef={{ current: null }}
        mirrored={false}
        sessionReady={false}
        onMessage={onMessage}
      />,
    )

    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['image'], 'receipt.png', { type: 'image/png' })] },
    })
    await waitFor(() => expect(screen.getByRole('button', { name: '隐私遮盖' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: '隐私遮盖' }))
    fireEvent.click(screen.getByRole('button', { name: '添加遮盖区' }))
    const box = screen.getByRole('button', { name: '遮盖区 1' })
    fireEvent.keyDown(box, { key: 'ArrowRight' })
    fireEvent.click(screen.getByRole('button', { name: '应用遮盖' }))

    await waitFor(() => expect(applyDocumentRedactions).toHaveBeenCalledTimes(1))
    const redactions = vi.mocked(applyDocumentRedactions).mock.calls[0][1]
    expect(redactions).toHaveLength(1)
    expect(redactions[0]).toMatchObject({ x: 0.305, y: 0.43, width: 0.4, height: 0.12 })
    await waitFor(() => expect(screen.getByText(/遮盖 1 处/)).toBeTruthy())
    expect(onMessage).toHaveBeenCalledWith('已在本机永久遮盖 1 处')
  })

  it('preserves applied redactions when reprocessing a scanned page', async () => {
    const redaction = { id: 'secret', x: 0.2, y: 0.3, width: 0.4, height: 0.1 }
    const redactedPage = { ...page, redactions: [redaction] }
    vi.mocked(captureFromImageFile).mockResolvedValue({
      dataUrl: page.sourceDataUrl,
      filename: 'receipt.png',
    })
    vi.mocked(scanCapturedDocument).mockResolvedValueOnce(redactedPage).mockResolvedValueOnce(page)
    vi.mocked(applyDocumentRedactions).mockResolvedValue({
      ...page,
      dataUrl: 'data:image/png;base64,cmVkYWN0ZWQ=',
      redactions: [redaction],
    })
    const { container } = render(
      <DocumentToolPanel
        videoRef={{ current: null }}
        mirrored={false}
        sessionReady={false}
        onMessage={vi.fn()}
      />,
    )

    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['image'], 'receipt.png', { type: 'image/png' })] },
    })
    await waitFor(() => expect(screen.getByText(/遮盖 1 处/)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '应用到本页' }))

    await waitFor(() => expect(scanCapturedDocument).toHaveBeenCalledTimes(2))
    expect(applyDocumentRedactions).toHaveBeenCalledWith(page, [redaction])
    await waitFor(() => expect(screen.getByText(/遮盖 1 处/)).toBeTruthy())
  })

  it('reapplies the saved orientation before restoring redactions after filter changes', async () => {
    const redaction = { id: 'secret', x: 0.2, y: 0.3, width: 0.4, height: 0.1 }
    const rotatedPage = { ...page, rotation: 90 as const, redactions: [redaction] }
    const freshRotatedPage = { ...page, rotation: 90 as const, width: page.height, height: page.width, redactions: [] }
    vi.mocked(captureFromImageFile).mockResolvedValue({ dataUrl: page.sourceDataUrl, filename: 'receipt.png' })
    vi.mocked(scanCapturedDocument).mockResolvedValueOnce(rotatedPage).mockResolvedValueOnce(page)
    vi.mocked(rotateScannedDocumentPage).mockResolvedValue(freshRotatedPage)
    vi.mocked(applyDocumentRedactions).mockResolvedValue({ ...freshRotatedPage, redactions: [redaction] })
    const { container } = render(<DocumentToolPanel videoRef={{ current: null }} mirrored={false} sessionReady={false} onMessage={vi.fn()} />)

    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['image'], 'receipt.png', { type: 'image/png' })] },
    })
    await waitFor(() => expect(screen.getByRole('button', { name: '应用到本页' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '应用到本页' }))

    await waitFor(() => expect(rotateScannedDocumentPage).toHaveBeenCalledWith(page, 'right'))
    expect(applyDocumentRedactions).toHaveBeenCalledWith(freshRotatedPage, [redaction])
  })
})

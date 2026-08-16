// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OcrLayoutExportActions } from './OcrLayoutExportActions'

const layoutMocks = vi.hoisted(() => ({
  create: vi.fn(),
  filename: vi.fn((_: string, format: string) => `sample-ocr-layout.${format}`),
  readDimensions: vi.fn(),
  json: vi.fn(() => '{"layout":true}\n'),
  csv: vi.fn(() => 'csv'),
  hocr: vi.fn(() => '<html></html>\n'),
  alto: vi.fn(() => '<?xml version="1.0"?><alto/>\n'),
}))

const tableMocks = vi.hoisted(() => ({
  detect: vi.fn(),
  filename: vi.fn(() => 'sample-ocr-table.csv'),
  csv: vi.fn(() => '\uFEFF"Name","Value"\r\n'),
}))

vi.mock('../lib/ocrLayoutExport', () => ({
  createOcrLayoutDocument: layoutMocks.create,
  ocrLayoutFilename: layoutMocks.filename,
  readOcrImageDimensions: layoutMocks.readDimensions,
  serializeOcrLayoutJson: layoutMocks.json,
  serializeOcrLayoutCsv: layoutMocks.csv,
  serializeOcrLayoutHocr: layoutMocks.hocr,
  serializeOcrLayoutAlto: layoutMocks.alto,
}))

vi.mock('../lib/ocrTable', () => ({
  detectOcrTable: tableMocks.detect,
  ocrTableFilename: tableMocks.filename,
  serializeOcrTableCsv: tableMocks.csv,
}))

const regions = [{ text: 'Hello', confidence: 92, lineId: 'line-1', x0: 1, y0: 2, x1: 20, y1: 12 }]
const layoutDocument = { wordCount: 1, lines: [] }

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('OcrLayoutExportActions', () => {
  it('loads image dimensions and downloads layout JSON', async () => {
    layoutMocks.readDimensions.mockResolvedValue({ width: 640, height: 480 })
    layoutMocks.create.mockReturnValue(layoutDocument)
    const createObjectUrl = vi.fn(() => 'blob:layout')
    const revokeObjectUrl = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: createObjectUrl, revokeObjectURL: revokeObjectUrl })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const onMessage = vi.fn()
    const file = new File(['image'], 'sample.png', { type: 'image/png' })
    render(<div className="ocr-actions"><OcrLayoutExportActions regions={regions} filename="sample.png" sourceFile={file} language="eng" onMessage={onMessage} /></div>)

    fireEvent.click(screen.getByRole('button', { name: '版面 JSON' }))

    await waitFor(() => expect(onMessage).toHaveBeenCalledWith(expect.stringContaining('1 个当前 OCR 词框')))
    expect(layoutMocks.readDimensions).toHaveBeenCalledWith(file)
    expect(layoutMocks.create).toHaveBeenCalledWith(regions, { filename: 'sample.png', width: 640, height: 480, language: 'eng' })
    expect(layoutMocks.filename).toHaveBeenCalledWith('sample.png', 'json')
    expect(click).toHaveBeenCalledTimes(1)
    expect(createObjectUrl).toHaveBeenCalledTimes(1)
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:layout')
  })

  it('uses known scan dimensions for CSV without decoding a source file', async () => {
    layoutMocks.create.mockReturnValue(layoutDocument)
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:csv'), revokeObjectURL: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const onMessage = vi.fn()
    render(<OcrLayoutExportActions regions={regions} filename="page.png" width={1200} height={900} onMessage={onMessage} />)

    fireEvent.click(screen.getByRole('button', { name: '版面 CSV' }))

    await waitFor(() => expect(layoutMocks.csv).toHaveBeenCalledWith(layoutDocument))
    expect(layoutMocks.readDimensions).not.toHaveBeenCalled()
    expect(layoutMocks.create).toHaveBeenCalledWith(regions, { filename: 'page.png', width: 1200, height: 900, language: undefined })
  })

  it('downloads interoperable hOCR markup with the same original word boxes', async () => {
    layoutMocks.create.mockReturnValue(layoutDocument)
    const createObjectUrl = vi.fn(() => 'blob:hocr')
    vi.stubGlobal('URL', { createObjectURL: createObjectUrl, revokeObjectURL: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const onMessage = vi.fn()
    render(<OcrLayoutExportActions regions={regions} filename="page.png" width={1200} height={900} language="eng+chi_sim" onMessage={onMessage} />)

    fireEvent.click(screen.getByRole('button', { name: '版面 hOCR' }))

    await waitFor(() => expect(layoutMocks.hocr).toHaveBeenCalledWith(layoutDocument))
    expect(layoutMocks.filename).toHaveBeenCalledWith('page.png', 'hocr')
    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob))
    expect(onMessage).toHaveBeenCalledWith('已导出 1 个当前 OCR 词框的版面 hOCR；逐词复核保留坐标，整段改字不会重排')
  })

  it('downloads ALTO 4.4 XML through the shared layout action', async () => {
    layoutMocks.create.mockReturnValue(layoutDocument)
    const createObjectUrl = vi.fn(() => 'blob:alto')
    vi.stubGlobal('URL', { createObjectURL: createObjectUrl, revokeObjectURL: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const onMessage = vi.fn()
    render(<OcrLayoutExportActions regions={regions} filename="page.png" width={1200} height={900} language="eng" onMessage={onMessage} />)

    fireEvent.click(screen.getByRole('button', { name: '版面 ALTO' }))

    await waitFor(() => expect(layoutMocks.alto).toHaveBeenCalledWith(layoutDocument))
    expect(layoutMocks.filename).toHaveBeenCalledWith('page.png', 'alto')
    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob))
    expect(onMessage).toHaveBeenCalledWith('已导出 1 个当前 OCR 词框的版面 ALTO；逐词复核保留坐标，整段改字不会重排')
  })

  it('reports missing dimensions and disables empty exports', async () => {
    const onMessage = vi.fn()
    const { rerender } = render(<OcrLayoutExportActions regions={regions} filename="page.png" onMessage={onMessage} />)
    fireEvent.click(screen.getByRole('button', { name: '版面 JSON' }))
    await waitFor(() => expect(onMessage).toHaveBeenCalledWith('缺少 OCR 原图尺寸，无法导出版面坐标'))

    rerender(<OcrLayoutExportActions regions={[]} filename="page.png" onMessage={onMessage} />)
    expect((screen.getByRole('button', { name: '版面 JSON' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '版面 CSV' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '版面 hOCR' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '版面 ALTO' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '表格辅助' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('opens an editable table candidate and exports the reviewed formula-safe CSV', async () => {
    tableMocks.detect.mockReturnValue({
      rows: [['Name', 'Value'], ['Paper', '=24']],
      rowLineIds: ['line-1', 'line-2'],
      columnCount: 2,
      rowCount: 2,
      usedWordCount: 4,
      ignoredWordCount: 1,
      confidence: 0.82,
      confidenceLabel: 'high',
      separatorPositions: [0.5],
    })
    const createObjectUrl = vi.fn(() => 'blob:table')
    const revokeObjectUrl = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: createObjectUrl, revokeObjectURL: revokeObjectUrl })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const onMessage = vi.fn()
    render(<OcrLayoutExportActions regions={regions} filename="page.png" width={1200} height={900} onMessage={onMessage} />)

    fireEvent.click(screen.getByRole('button', { name: '表格辅助' }))

    const dialog = await screen.findByRole('dialog', { name: 'OCR 表格人工复核' })
    expect(tableMocks.detect).toHaveBeenCalledWith(regions, 1200, 900)
    expect(screen.getByText(/忽略 1 个/)).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '关闭表格复核对话框' })))
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'OCR 表格人工复核' })).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '表格辅助' })))
    fireEvent.click(screen.getByRole('button', { name: '表格辅助' }))
    await screen.findByRole('dialog', { name: 'OCR 表格人工复核' })
    fireEvent.change(screen.getByRole('textbox', { name: '表格第 2 行第 2 列' }), { target: { value: '=25' } })
    fireEvent.click(screen.getByRole('button', { name: '确认并导出表格 CSV' }))

    expect(tableMocks.csv).toHaveBeenCalledWith([['Name', 'Value'], ['Paper', '=25']])
    expect(tableMocks.filename).toHaveBeenCalledWith('page.png')
    expect(createObjectUrl).toHaveBeenCalledTimes(1)
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:table')
    expect(onMessage).toHaveBeenCalledWith('已导出人工复核的 2 行 × 2 列 OCR 表格 CSV')
  })

  it('fails closed when no repeated aligned table is found', async () => {
    tableMocks.detect.mockReturnValue(null)
    const onMessage = vi.fn()
    render(<OcrLayoutExportActions regions={regions} filename="page.png" width={1200} height={900} onMessage={onMessage} />)

    fireEvent.click(screen.getByRole('button', { name: '表格辅助' }))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('未找到至少 3 行'))
    expect(onMessage).toHaveBeenCalledWith(expect.stringContaining('请改用版面 JSON/CSV'))
  })
})

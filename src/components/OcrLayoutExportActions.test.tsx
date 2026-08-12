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
}))

vi.mock('../lib/ocrLayoutExport', () => ({
  createOcrLayoutDocument: layoutMocks.create,
  ocrLayoutFilename: layoutMocks.filename,
  readOcrImageDimensions: layoutMocks.readDimensions,
  serializeOcrLayoutJson: layoutMocks.json,
  serializeOcrLayoutCsv: layoutMocks.csv,
}))

const regions = [{ text: 'Hello', confidence: 92, lineId: 'line-1', x0: 1, y0: 2, x1: 20, y1: 12 }]
const document = { wordCount: 1, lines: [] }

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('OcrLayoutExportActions', () => {
  it('loads image dimensions and downloads layout JSON', async () => {
    layoutMocks.readDimensions.mockResolvedValue({ width: 640, height: 480 })
    layoutMocks.create.mockReturnValue(document)
    const createObjectUrl = vi.fn(() => 'blob:layout')
    const revokeObjectUrl = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: createObjectUrl, revokeObjectURL: revokeObjectUrl })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const onMessage = vi.fn()
    const file = new File(['image'], 'sample.png', { type: 'image/png' })
    render(<div className="ocr-actions"><OcrLayoutExportActions regions={regions} filename="sample.png" sourceFile={file} language="eng" onMessage={onMessage} /></div>)

    fireEvent.click(screen.getByRole('button', { name: '版面 JSON' }))

    await waitFor(() => expect(onMessage).toHaveBeenCalledWith(expect.stringContaining('1 个原始 OCR 词框')))
    expect(layoutMocks.readDimensions).toHaveBeenCalledWith(file)
    expect(layoutMocks.create).toHaveBeenCalledWith(regions, { filename: 'sample.png', width: 640, height: 480, language: 'eng' })
    expect(layoutMocks.filename).toHaveBeenCalledWith('sample.png', 'json')
    expect(click).toHaveBeenCalledTimes(1)
    expect(createObjectUrl).toHaveBeenCalledTimes(1)
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:layout')
  })

  it('uses known scan dimensions for CSV without decoding a source file', async () => {
    layoutMocks.create.mockReturnValue(document)
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:csv'), revokeObjectURL: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const onMessage = vi.fn()
    render(<OcrLayoutExportActions regions={regions} filename="page.png" width={1200} height={900} onMessage={onMessage} />)

    fireEvent.click(screen.getByRole('button', { name: '版面 CSV' }))

    await waitFor(() => expect(layoutMocks.csv).toHaveBeenCalledWith(document))
    expect(layoutMocks.readDimensions).not.toHaveBeenCalled()
    expect(layoutMocks.create).toHaveBeenCalledWith(regions, { filename: 'page.png', width: 1200, height: 900, language: undefined })
  })

  it('reports missing dimensions and disables empty exports', async () => {
    const onMessage = vi.fn()
    const { rerender } = render(<OcrLayoutExportActions regions={regions} filename="page.png" onMessage={onMessage} />)
    fireEvent.click(screen.getByRole('button', { name: '版面 JSON' }))
    await waitFor(() => expect(onMessage).toHaveBeenCalledWith('缺少 OCR 原图尺寸，无法导出版面坐标'))

    rerender(<OcrLayoutExportActions regions={[]} filename="page.png" onMessage={onMessage} />)
    expect((screen.getByRole('button', { name: '版面 JSON' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '版面 CSV' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

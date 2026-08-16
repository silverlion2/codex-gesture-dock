import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { encode } from 'fast-png'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import type { ScannedDocumentPage } from './documentScanner'
import {
  buildSearchableScannedPdf,
  SEARCHABLE_PDF_FONT_SHA256,
  searchablePdfEligiblePageCount,
  splitSearchablePdfTextRuns,
} from './searchableDocumentPdf'

const ONE_PIXEL_PNG = `data:image/png;base64,${Buffer.from(encode({
  width: 1,
  height: 1,
  channels: 4,
  depth: 8,
  data: new Uint8Array([255, 255, 255, 255]),
})).toString('base64')}`
const fontPath = fileURLToPath(new URL('../../public/fonts/NotoSansSC-VF.ttf', import.meta.url))

const page: ScannedDocumentPage = {
  id: 'searchable-page',
  sourceDataUrl: ONE_PIXEL_PNG,
  dataUrl: ONE_PIXEL_PNG,
  baseDataUrl: ONE_PIXEL_PNG,
  filename: 'invoice-processed.png',
  width: 240,
  height: 160,
  filter: 'document',
  autoDetected: false,
  correction: 'fallback',
  corners: {
    topLeft: { x: 0, y: 0 },
    topRight: { x: 240, y: 0 },
    bottomRight: { x: 240, y: 160 },
    bottomLeft: { x: 0, y: 160 },
  },
  sourceWidth: 240,
  sourceHeight: 160,
  redactions: [],
}

describe('searchable scanned PDF', () => {
  it('embeds a Chinese-capable invisible OCR layer that PDF.js can read back', async () => {
    const fontBytes = await readFile(fontPath)
    expect(createHash('sha256').update(fontBytes).digest('hex').toUpperCase()).toBe(SEARCHABLE_PDF_FONT_SHA256)
    const data = await buildSearchableScannedPdf([
      {
        page,
        regions: [
          { text: 'Invoice 发票 123', confidence: 96, lineId: '0-0-0', x0: 20, y0: 30, x1: 205, y1: 55 },
          { text: '合计', confidence: 94, lineId: '0-0-1', x0: 20, y0: 70, x1: 70, y1: 95 },
          { text: '¥140.80', confidence: 93, lineId: '0-0-1', x0: 100, y0: 70, x1: 190, y1: 95 },
        ],
      },
      {
        page: { ...page, id: 'searchable-page-2', width: 160, height: 240 },
        regions: [
          { text: '第二页 Page 2', confidence: 95, lineId: '1-0-0', x0: 15, y0: 25, x1: 145, y1: 50 },
        ],
      },
    ], { fontData: fontBytes.buffer.slice(fontBytes.byteOffset, fontBytes.byteOffset + fontBytes.byteLength) })

    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data) })
    const pdf = await loadingTask.promise
    try {
      expect(pdf.numPages).toBe(2)
      const firstPageText = (await (await pdf.getPage(1)).getTextContent()).items.map((item) => 'str' in item ? item.str : '').join(' ')
      const secondPageText = (await (await pdf.getPage(2)).getTextContent()).items.map((item) => 'str' in item ? item.str : '').join(' ')
      expect(firstPageText).toContain('Invoice 发票 123')
      expect(firstPageText).toContain('合计')
      expect(firstPageText).toContain('¥140.80')
      expect(secondPageText).toContain('第二页 Page 2')
      expect(data.byteLength).toBeLessThan(250_000)
    } finally {
      await loadingTask.destroy()
    }
  }, 20_000)

  it('splits mixed CJK and non-CJK runs to preserve Unicode mappings', () => {
    expect(splitSearchablePdfTextRuns('Invoice 发票 123')).toEqual(['Invoice ', '发票', ' 123'])
  })

  it('fails closed when any page lacks a valid OCR word box', async () => {
    expect(searchablePdfEligiblePageCount([
      { page, regions: [{ text: 'valid', confidence: 90, lineId: '0', x0: 10, y0: 10, x1: 80, y1: 30 }] },
      { page: { ...page, id: 'empty' }, regions: [] },
    ])).toBe(1)
    await expect(buildSearchableScannedPdf([
      { page, regions: [] },
    ], { fontData: new ArrayBuffer(2_048) })).rejects.toThrow('每一页都需要先完成带版面词框的 OCR')
  })
})

// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
  createOcrLayoutDocument,
  ocrLayoutFilename,
  serializeOcrLayoutAlto,
  serializeOcrLayoutAltoPages,
  serializeOcrLayoutCsv,
  serializeOcrLayoutCsvPages,
  serializeOcrLayoutHocr,
  serializeOcrLayoutHocrPages,
  serializeOcrLayoutJson,
  serializeOcrLayoutJsonPages,
  type OcrLayoutDocument,
} from './ocrLayoutExport'
import type { OcrRegion } from './localOcr'

const regions: OcrRegion[] = [
  { text: 'Hello', confidence: 98.456, lineId: 'line-1', x0: -5, y0: 10, x1: 50, y1: 30 },
  { text: '=SUM(1,1)', confidence: 120, lineId: '@line-2', x0: 60, y0: 35, x1: 140, y1: 75 },
  { text: 'ignored', confidence: Number.NaN, lineId: 'line-3', x0: 0, y0: 0, x1: 1, y1: 1 },
  { text: 'outside', confidence: 80, lineId: 'line-4', x0: 110, y0: 10, x1: 120, y1: 20 },
]

describe('ocrLayoutExport', () => {
  it('groups valid words, clamps boxes, and provides normalized coordinates', () => {
    const document = createOcrLayoutDocument(regions, { filename: 'scan.png', width: 100, height: 80, language: 'eng' })

    expect(document).toMatchObject({
      schemaVersion: 1,
      type: 'ocr-word-layout',
      coordinateSpace: 'pixels-top-left',
      source: { filename: 'scan.png', width: 100, height: 80, language: 'eng' },
      wordCount: 2,
    })
    expect(document.lines.map((line) => line.id)).toEqual(['line-1', '@line-2'])
    expect(document.lines[0].words[0]).toEqual({
      index: 0,
      text: 'Hello',
      confidence: 98.46,
      bbox: { x: 0, y: 10, width: 50, height: 20 },
      normalized: { x: 0, y: 0.125, width: 0.5, height: 0.25 },
    })
    expect(document.lines[1].words[0].confidence).toBe(100)
    expect(document.lines[1].words[0].bbox).toEqual({ x: 60, y: 35, width: 40, height: 40 })
  })

  it('serializes stable JSON and formula-neutralized UTF-8 CSV', () => {
    const document = createOcrLayoutDocument(regions, { filename: 'scan.png', width: 100, height: 80 })
    const json = serializeOcrLayoutJson(document)
    const csv = serializeOcrLayoutCsv(document)

    expect(json.endsWith('\n')).toBe(true)
    expect(JSON.parse(json).wordCount).toBe(2)
    expect(csv.startsWith('\uFEFF"word_index"')).toBe(true)
    expect(csv).toContain('"\'@line-2"')
    expect(csv).toContain('"\'=SUM(1,1)"')
    expect(csv.endsWith('\r\n')).toBe(true)
  })

  it('preserves human-correction provenance without changing the engine confidence or box', () => {
    const document = createOcrLayoutDocument([{
      text: 'Total',
      recognizedText: 'T0tal',
      humanReviewed: true,
      confidence: 58,
      lineId: 'line-1',
      x0: 10,
      y0: 20,
      x1: 60,
      y1: 40,
    }], { filename: 'invoice.png', width: 100, height: 80 })
    expect(document.lines[0].words[0]).toMatchObject({
      text: 'Total', recognizedText: 'T0tal', humanReviewed: true, confidence: 58,
      bbox: { x: 10, y: 20, width: 50, height: 20 },
    })
    expect(serializeOcrLayoutCsv(document)).toContain('"Total","T0tal","true","58"')
    expect(serializeOcrLayoutHocr(document)).toContain('x_wconf 58; x_codex_human_reviewed 1')
    const alto = serializeOcrLayoutAlto(document)
    expect(alto).toContain('CONTENT="Total"')
    expect(alto).toContain('WC="0.58" CS="true"')
    expect(alto).toContain('<ALTERNATIVE PURPOSE="original-recognition">T0tal</ALTERNATIVE>')
  })

  it('serializes escaped hOCR 1.2-compatible page, line, word, and confidence markup', () => {
    const document = createOcrLayoutDocument([
      { text: '<Invoice & 发票>', confidence: 98.6, lineId: 'line-1', x0: 10, y0: 12, x1: 80, y1: 32 },
      { text: '123', confidence: 71.2, lineId: 'line-1', x0: 85, y0: 12, x1: 115, y1: 32 },
    ], { filename: 'scan "A".png', width: 120, height: 80, language: 'eng+chi_sim' })
    const hocr = serializeOcrLayoutHocr(document)

    expect(hocr).toContain('<meta name="ocr-capabilities" content="ocr_page ocrx_line ocrx_word" />')
    expect(hocr).toContain('<meta name="ocr-langs" content="en zh-Hans" />')
    expect(hocr).toContain('class="ocr_page"')
    expect(hocr).toContain('<meta name="ocr-source" content="scan &quot;A&quot;.png" />')
    expect(hocr).toContain('class="ocr_page" id="page_1" title="image &quot;scan%20%22A%22.png&quot;; bbox 0 0 120 80; ppageno 0"')
    expect(hocr).toContain('class="ocrx_line" id="line_1" title="bbox 10 12 115 32"')
    expect(hocr).toContain('id="word_1" title="bbox 10 12 80 32; x_wconf 99"')
    expect(hocr).toContain('&lt;Invoice &amp; 发票&gt;')
    expect(hocr.endsWith('\n')).toBe(true)
  })

  it('serializes well-formed ALTO 4.4 page, block, line, word, language, and pixel geometry', () => {
    const document = createOcrLayoutDocument([
      { text: '<Invoice & 发票>', confidence: 98.6, lineId: 'line-1', x0: 10, y0: 12, x1: 80, y1: 32 },
      { text: '123', confidence: 71.2, lineId: 'line-1', x0: 85, y0: 12, x1: 115, y1: 32 },
    ], { filename: 'scan "A".png', width: 120, height: 80, language: 'eng+chi_sim' })
    const alto = serializeOcrLayoutAlto(document)
    const parsed = new DOMParser().parseFromString(alto, 'application/xml')

    expect(parsed.querySelector('parsererror')).toBeNull()
    expect(parsed.documentElement.namespaceURI).toBe('http://www.loc.gov/standards/alto/ns-v4#')
    expect(parsed.documentElement.getAttribute('SCHEMAVERSION')).toBe('4.4')
    expect(parsed.querySelector('fileName')?.textContent).toBe('scan "A".png')
    expect(parsed.querySelector('OtherTag')?.getAttribute('LABEL')).toBe('scan "A".png')
    expect(parsed.querySelector('TextBlock')?.getAttribute('TAGREFS')).toBe('SourceImage_Page_1')
    expect(parsed.querySelector('Page')?.getAttribute('LANG')).toBe('en')
    expect(parsed.querySelector('Page')?.getAttribute('OTHERLANGS')).toBe('zh-Hans')
    expect(parsed.querySelector('TextBlock')).toBeTruthy()
    expect(parsed.querySelector('TextLine')?.getAttribute('WIDTH')).toBe('105')
    expect(parsed.querySelector('String')?.getAttribute('CONTENT')).toBe('<Invoice & 发票>')
    expect(parsed.querySelector('String')?.getAttribute('WC')).toBe('0.986')
    expect(alto.endsWith('\n')).toBe(true)
  })

  it('serializes multi-page hOCR with page order, source names, and unique IDs', () => {
    const first = createOcrLayoutDocument([
      { text: 'First', confidence: 91, lineId: 'line-1', x0: 10, y0: 12, x1: 50, y1: 32 },
    ], { filename: 'front & cover.png', width: 120, height: 80, language: 'eng' })
    const second = createOcrLayoutDocument([
      { text: '第二页', confidence: 83, lineId: 'line-1', x0: 8, y0: 10, x1: 68, y1: 38 },
    ], { filename: '后页.png', width: 200, height: 140, language: 'chi_sim' })
    const hocr = serializeOcrLayoutHocrPages([first, second])
    const parsed = new DOMParser().parseFromString(hocr, 'text/html')
    const pages = [...parsed.querySelectorAll('.ocr_page')]

    expect(pages).toHaveLength(2)
    expect(pages[0].getAttribute('title')).toBe('image "front%20%26%20cover.png"; bbox 0 0 120 80; ppageno 0')
    expect(pages[1].getAttribute('title')).toBe('image "%E5%90%8E%E9%A1%B5.png"; bbox 0 0 200 140; ppageno 1')
    expect(pages[0].getAttribute('data-source')).toBe('front & cover.png')
    expect(pages[1].getAttribute('data-source')).toBe('后页.png')
    expect(parsed.querySelector('#page_1_word_1')?.textContent).toBe('First')
    expect(parsed.querySelector('#page_2_word_1')?.textContent).toBe('第二页')
    expect(parsed.querySelector('meta[name="ocr-langs"]')?.getAttribute('content')).toBe('en zh-Hans')
  })

  it('serializes multi-page ALTO with ordered physical pages and unique layout IDs', () => {
    const first = createOcrLayoutDocument([
      { text: 'Front', confidence: 95, lineId: 'line-1', x0: 10, y0: 10, x1: 70, y1: 30 },
    ], { filename: 'front.png', width: 120, height: 80, language: 'eng' })
    const second = createOcrLayoutDocument([
      { text: '背面', confidence: 88, lineId: 'line-1', x0: 20, y0: 18, x1: 82, y1: 48 },
    ], { filename: 'back.png', width: 200, height: 140, language: 'chi_sim' })
    const alto = serializeOcrLayoutAltoPages([first, second], 'two-page scan')
    const parsed = new DOMParser().parseFromString(alto, 'application/xml')
    const pages = [...parsed.querySelectorAll('Page')]
    const strings = [...parsed.querySelectorAll('String')]
    const sourceTags = [...parsed.querySelectorAll('OtherTag')]

    expect(parsed.querySelector('parsererror')).toBeNull()
    expect(parsed.querySelector('fileName')?.textContent).toBe('two-page scan')
    expect(pages).toHaveLength(2)
    expect(pages.map((page) => page.getAttribute('PHYSICAL_IMG_NR'))).toEqual(['1', '2'])
    expect(pages.map((page) => [page.getAttribute('WIDTH'), page.getAttribute('HEIGHT')])).toEqual([
      ['120', '80'],
      ['200', '140'],
    ])
    expect(strings.map((word) => word.getAttribute('ID'))).toEqual(['Page_1_String_1', 'Page_2_String_1'])
    expect(strings.map((word) => word.getAttribute('CONTENT'))).toEqual(['Front', '背面'])
    expect(sourceTags.map((tag) => tag.getAttribute('LABEL'))).toEqual(['front.png', 'back.png'])
    expect(sourceTags.map((tag) => tag.getAttribute('TYPE'))).toEqual(['source-image', 'source-image'])
    expect([...parsed.querySelectorAll('TextBlock')].map((block) => block.getAttribute('TAGREFS'))).toEqual([
      'SourceImage_Page_1',
      'SourceImage_Page_2',
    ])
  })

  it('serializes a multi-page JSON manifest and formula-safe flat CSV', () => {
    const first = createOcrLayoutDocument([
      { text: '=Invoice', confidence: 95, lineId: '@line-1', x0: 10, y0: 10, x1: 70, y1: 30 },
    ], { filename: 'front.png', width: 120, height: 80, language: 'eng' })
    const second = createOcrLayoutDocument([
      { text: '合计', confidence: 88, lineId: 'line-1', x0: 20, y0: 18, x1: 82, y1: 48 },
    ], { filename: 'back.png', width: 200, height: 140, language: 'eng+chi_sim' })
    const json = serializeOcrLayoutJsonPages([first, second], 'invoice scan')
    const csv = serializeOcrLayoutCsvPages([first, second])
    const parsed = JSON.parse(json)

    expect(parsed).toMatchObject({
      schemaVersion: 1,
      type: 'ocr-document-layout',
      coordinateSpace: 'pixels-top-left',
      sourceFilename: 'invoice scan',
      pageCount: 2,
      wordCount: 2,
    })
    expect(parsed.pages.map((page: OcrLayoutDocument) => page.source.filename)).toEqual(['front.png', 'back.png'])
    expect(csv.startsWith('\uFEFF"page_number","source_filename"')).toBe(true)
    expect(csv).toContain('"1","front.png","120","80","eng","0","\'@line-1","\'=Invoice"')
    expect(csv).toContain('"2","back.png","200","140","eng+chi_sim"')
    expect(csv.endsWith('\r\n')).toBe(true)
  })

  it('rejects empty multi-page layout exports and pages without valid word boxes', () => {
    const emptyPage = createOcrLayoutDocument([], { filename: 'blank.png', width: 100, height: 80 })

    expect(() => serializeOcrLayoutHocrPages([])).toThrow()
    expect(() => serializeOcrLayoutAltoPages([])).toThrow()
    expect(() => serializeOcrLayoutJsonPages([])).toThrow()
    expect(() => serializeOcrLayoutCsvPages([])).toThrow()
    expect(() => serializeOcrLayoutHocrPages([emptyPage])).toThrow()
    expect(() => serializeOcrLayoutAltoPages([emptyPage])).toThrow()
    expect(() => serializeOcrLayoutJsonPages([emptyPage])).toThrow()
    expect(() => serializeOcrLayoutCsvPages([emptyPage])).toThrow()
  })

  it('rejects missing dimensions and creates safe export filenames', () => {
    expect(() => createOcrLayoutDocument(regions, { filename: 'scan.png', width: 0, height: 80 })).toThrow('有效的原图尺寸')
    expect(ocrLayoutFilename('客户<卡片>.PNG', 'json')).toBe('客户-卡片--ocr-layout.json')
    expect(ocrLayoutFilename('..', 'csv')).toBe('ocr-layout-ocr-layout.csv')
    expect(ocrLayoutFilename('CON.png', 'json')).toBe('CON-file-ocr-layout.json')
    expect(ocrLayoutFilename('invoice...png', 'csv')).toBe('invoice-ocr-layout.csv')
    expect(ocrLayoutFilename('scan.png', 'hocr')).toBe('scan-ocr-layout.hocr')
    expect(ocrLayoutFilename('scan.png', 'alto')).toBe('scan-ocr-layout.alto.xml')
  })
})

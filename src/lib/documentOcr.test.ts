import { describe, expect, it } from 'vitest'
import { buildDocumentOcrText, documentLayoutFilename, documentOcrFilename, findDocumentOcrMatches } from './documentOcr'

describe('scanned document OCR export', () => {
  it('preserves page order and marks pages that have not been reviewed', () => {
    expect(buildDocumentOcrText([
      { id: 'page-b', filename: 'back.png' },
      { id: 'page-a', filename: 'front.png' },
      { id: 'page-empty', filename: 'blank.png' },
    ], {
      'page-a': { text: '  Front page text  ' },
      'page-empty': { text: '   ' },
    })).toBe([
      '--- 第 1 页 · back.png ---',
      '[尚未执行 OCR]',
      '',
      '--- 第 2 页 · front.png ---',
      'Front page text',
      '',
      '--- 第 3 页 · blank.png ---',
      '[人工复核后为空]',
    ].join('\n'))
  })

  it('creates a safe document-level text filename', () => {
    expect(documentOcrFilename('client:scan-processed-redacted.png')).toBe('client-scan-all-pages-ocr.txt')
    expect(documentOcrFilename('?.png')).toBe('--all-pages-ocr.txt')
  })

  it('creates safe document-level hOCR and ALTO filenames', () => {
    expect(documentLayoutFilename('client:scan-processed-redacted.png', 'json')).toBe('client-scan-all-pages-ocr-layout.json')
    expect(documentLayoutFilename('client:scan-processed-redacted.png', 'csv')).toBe('client-scan-all-pages-ocr-layout.csv')
    expect(documentLayoutFilename('client:scan-processed-redacted.png', 'hocr')).toBe('client-scan-all-pages-ocr-layout.hocr')
    expect(documentLayoutFilename('client:scan-processed-redacted.png', 'alto')).toBe('client-scan-all-pages-ocr-layout.alto.xml')
  })

  it('searches reviewed OCR by page order, counts occurrences, and returns bounded previews', () => {
    const pages = [
      { id: 'front', filename: 'front.png' },
      { id: 'back', filename: 'back.png' },
      { id: 'blank', filename: 'blank.png' },
    ]
    expect(findDocumentOcrMatches(pages, {
      front: { text: 'Invoice number A-10\nInvoice total 42.00' },
      back: { text: `${'x'.repeat(80)} invoice archive copy ${'y'.repeat(80)}` },
    }, ' INVOICE ')).toEqual([
      expect.objectContaining({ pageId: 'front', pageIndex: 0, filename: 'front.png', occurrenceCount: 2 }),
      expect.objectContaining({ pageId: 'back', pageIndex: 1, filename: 'back.png', occurrenceCount: 1 }),
    ])
    const matches = findDocumentOcrMatches(pages, { back: { text: `${'x'.repeat(80)} invoice ${'y'.repeat(80)}` } }, 'invoice')
    expect(matches[0].preview.startsWith('…')).toBe(true)
    expect(matches[0].preview.endsWith('…')).toBe(true)
    expect(findDocumentOcrMatches(pages, {}, '   ')).toEqual([])
  })
})

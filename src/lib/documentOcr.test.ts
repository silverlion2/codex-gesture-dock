import { describe, expect, it } from 'vitest'
import { buildDocumentOcrText, documentOcrFilename } from './documentOcr'

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
})

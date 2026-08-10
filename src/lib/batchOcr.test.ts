import { describe, expect, it } from 'vitest'
import { buildCombinedOcrText } from './batchOcr'

describe('batch OCR export', () => {
  it('combines successful results in input order and omits missing results', () => {
    expect(buildCombinedOcrText([
      { filename: 'a.png', result: { text: 'Alpha', pageCount: 1, source: 'ocr' } },
      { filename: 'b.png' },
      { filename: 'c.pdf', result: { text: 'Charlie', pageCount: 1, source: 'embedded-text' } },
    ])).toBe('===== a.png =====\nAlpha\n\n===== c.pdf =====\nCharlie')
  })
})

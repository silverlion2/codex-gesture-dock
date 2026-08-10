import { describe, expect, it } from 'vitest'
import { classifySensitiveText, findPiiSuggestions } from './piiSuggestions'

describe('PII redaction suggestions', () => {
  it('classifies conservative high-signal sensitive values', () => {
    expect(classifySensitiveText('hello@example.com')).toBe('email')
    expect(classifySensitiveText('+1 (415) 555-2671')).toBe('phone')
    expect(classifySensitiveText('11010519491231002X')).toBe('id-number')
    expect(classifySensitiveText('4111 1111 1111 1111')).toBe('financial-number')
    expect(classifySensitiveText('Invoice 2026-100')).toBeNull()
  })

  it('joins split OCR words on one line and returns a bounded review box', () => {
    const suggestions = findPiiSuggestions([
      { text: '+1', confidence: 91, lineId: 'line-1', x0: 100, y0: 200, x1: 130, y1: 230 },
      { text: '(415)', confidence: 88, lineId: 'line-1', x0: 135, y0: 200, x1: 190, y1: 230 },
      { text: '555-2671', confidence: 93, lineId: 'line-1', x0: 195, y0: 200, x1: 290, y1: 230 },
    ], 1_000, 800)
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].kind).toBe('phone')
    expect(suggestions[0].confidence).toBe(88)
    expect(suggestions[0].redaction.x).toBeGreaterThanOrEqual(0)
    expect(suggestions[0].redaction.y + suggestions[0].redaction.height).toBeLessThanOrEqual(1)
  })
})

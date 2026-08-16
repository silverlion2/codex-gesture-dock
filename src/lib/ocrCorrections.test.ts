import { describe, expect, it } from 'vitest'
import type { OcrRegion } from './localOcr'
import {
  applyOcrWordCorrections,
  MAX_OCR_CORRECTION_CHARACTERS,
  normalizeOcrCorrectionText,
} from './ocrCorrections'

const regions: OcrRegion[] = [
  { text: 'Total', confidence: 52, lineId: 'line-1', x0: 10, y0: 10, x1: 50, y1: 30 },
  { text: 'Total', confidence: 48, lineId: 'line-2', x0: 10, y0: 40, x1: 50, y1: 60 },
  { text: '¥10.00', confidence: 81, lineId: 'line-2', x0: 60, y0: 40, x1: 120, y1: 60 },
]

describe('OCR word corrections', () => {
  it('patches the intended duplicate occurrence while preserving geometry and engine confidence', () => {
    const result = applyOcrWordCorrections('Total items\nTotal ¥10.00', regions, [
      { index: 1, text: '合计' },
    ])

    expect(result.text).toBe('Total items\n合计 ¥10.00')
    expect(result.reviewedCount).toBe(1)
    expect(result.changedCount).toBe(1)
    expect(result.regions[1]).toEqual({
      ...regions[1],
      text: '合计',
      recognizedText: 'Total',
      humanReviewed: true,
    })
    expect(result.regions[1].confidence).toBe(48)
    expect(result.regions[1].x0).toBe(10)
  })

  it('allows explicit confirmation without changing text and preserves first-recognition provenance on later edits', () => {
    const confirmed = applyOcrWordCorrections('Total items\nTotal ¥10.00', regions, [{ index: 0, text: 'Total' }])
    expect(confirmed.changedCount).toBe(0)
    expect(confirmed.regions[0]).toMatchObject({ text: 'Total', recognizedText: 'Total', humanReviewed: true })

    const revised = applyOcrWordCorrections(confirmed.text, confirmed.regions, [{ index: 0, text: 'Subtotal' }])
    expect(revised.text).toContain('Subtotal items')
    expect(revised.regions[0]).toMatchObject({ text: 'Subtotal', recognizedText: 'Total', humanReviewed: true })
  })

  it('normalizes control whitespace, bounds code points, and supports removing a false-positive word', () => {
    expect(normalizeOcrCorrectionText('  发票\n\t 123  ')).toBe('发票 123')
    expect(Array.from(normalizeOcrCorrectionText('字'.repeat(MAX_OCR_CORRECTION_CHARACTERS + 20)))).toHaveLength(MAX_OCR_CORRECTION_CHARACTERS)
    const result = applyOcrWordCorrections('Total items\nTotal ¥10.00', regions, [{ index: 2, text: '' }])
    expect(result.text).toBe('Total items\nTotal ')
    expect(result.regions[2].text).toBe('')
  })

  it('fails closed for duplicate, out-of-range, or unlocatable corrections', () => {
    expect(() => applyOcrWordCorrections('Total', regions, [
      { index: 0, text: 'A' },
      { index: 0, text: 'B' },
    ])).toThrow('不能重复提交')
    expect(() => applyOcrWordCorrections('Total', regions, [{ index: 8, text: 'A' }])).toThrow('索引无效')
    expect(() => applyOcrWordCorrections('Different text', regions, [{ index: 0, text: 'A' }])).toThrow('按出现顺序唯一定位')
    expect(() => applyOcrWordCorrections('items\nTotal ¥10.00', regions, [{ index: 1, text: '合计' }])).toThrow('按出现顺序唯一定位')
  })
})

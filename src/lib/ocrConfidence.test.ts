import { describe, expect, it } from 'vitest'
import { countOcrReviewRegions, normalizeOcrReviewRegions, summarizeOcrConfidence } from './ocrConfidence'
import type { OcrRegion } from './localOcr'

const regions: OcrRegion[] = [
  { text: 'Certain', confidence: 96, lineId: 'line-1', x0: 10, y0: 20, x1: 90, y1: 50 },
  { text: 'unc1ear', confidence: 42, lineId: 'line-1', x0: 95, y0: 20, x1: 175, y1: 50 },
  { text: 'maybe', confidence: 71, lineId: 'line-2', x0: -10, y0: 80, x1: 210, y1: 120 },
]

describe('ocrConfidence', () => {
  it('summarizes usable word scores without treating them as probabilities', () => {
    expect(summarizeOcrConfidence(regions, 80)).toEqual({
      wordCount: 3,
      averageConfidence: (96 + 42 + 71) / 3,
      lowestConfidence: 42,
      reviewCount: 2,
      reviewedCount: 0,
    })
    expect(summarizeOcrConfidence([], 80)).toEqual({
      wordCount: 0,
      averageConfidence: null,
      lowestConfidence: null,
      reviewCount: 0,
      reviewedCount: 0,
    })
  })

  it('sorts low-score boxes, clamps them to the image, and normalizes coordinates', () => {
    expect(normalizeOcrReviewRegions(regions, 200, 100, 80)).toEqual([
      { id: 'line-1-1', sourceIndex: 1, text: 'unc1ear', recognizedText: 'unc1ear', humanReviewed: false, confidence: 42, x: 0.475, y: 0.2, width: 0.4, height: 0.3 },
      { id: 'line-2-2', sourceIndex: 2, text: 'maybe', recognizedText: 'maybe', humanReviewed: false, confidence: 71, x: 0, y: 0.8, width: 1, height: 0.2 },
    ])
  })

  it('returns no overlays for invalid image geometry or invalid boxes', () => {
    const invalid = [{ ...regions[1], x1: 50 }]
    expect(normalizeOcrReviewRegions(regions, 0, 100, 80)).toEqual([])
    expect(normalizeOcrReviewRegions(invalid, 200, 100, 80)).toEqual([])
  })

  it('honors the review threshold and output limit', () => {
    expect(normalizeOcrReviewRegions(regions, 200, 100, 50)).toHaveLength(1)
    expect(normalizeOcrReviewRegions(regions, 200, 100, 100, 1)).toHaveLength(1)
  })

  it('can include high-confidence words and page through all valid boxes in reading order', () => {
    const manyRegions = Array.from({ length: 205 }, (_, index): OcrRegion => ({
      text: `word-${index}`,
      confidence: 99,
      lineId: `line-${index}`,
      x0: 1,
      y0: 1,
      x1: 10,
      y1: 10,
    }))
    expect(normalizeOcrReviewRegions(regions, 200, 100, 80, 100, { includeAll: true }).map((region) => region.text)).toEqual(['Certain', 'unc1ear', 'maybe'])
    expect(normalizeOcrReviewRegions(manyRegions, 20, 20, 80, 100, { includeAll: true, offset: 200 }).map((region) => region.text)).toEqual(['word-200', 'word-201', 'word-202', 'word-203', 'word-204'])
    expect(countOcrReviewRegions(manyRegions, 20, 20, 80, true)).toBe(205)
  })

  it('keeps reviewed boxes available for later edits but removes them from the pending count', () => {
    const reviewed = regions.map((region, index) => index === 1 ? {
      ...region,
      text: 'unclear',
      recognizedText: 'unc1ear',
      humanReviewed: true,
    } : region)
    expect(summarizeOcrConfidence(reviewed, 80)).toMatchObject({ reviewCount: 1, reviewedCount: 1 })
    expect(normalizeOcrReviewRegions(reviewed, 200, 100, 80).map((region) => ({ text: region.text, reviewed: region.humanReviewed }))).toEqual([
      { text: 'maybe', reviewed: false },
      { text: 'unclear', reviewed: true },
    ])
  })
})

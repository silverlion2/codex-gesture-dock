import { describe, expect, it } from 'vitest'
import { normalizeOcrReviewRegions, summarizeOcrConfidence } from './ocrConfidence'
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
    })
    expect(summarizeOcrConfidence([], 80)).toEqual({
      wordCount: 0,
      averageConfidence: null,
      lowestConfidence: null,
      reviewCount: 0,
    })
  })

  it('sorts low-score boxes, clamps them to the image, and normalizes coordinates', () => {
    expect(normalizeOcrReviewRegions(regions, 200, 100, 80)).toEqual([
      { id: 'line-1-1', text: 'unc1ear', confidence: 42, x: 0.475, y: 0.2, width: 0.4, height: 0.3 },
      { id: 'line-2-2', text: 'maybe', confidence: 71, x: 0, y: 0.8, width: 1, height: 0.2 },
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
})

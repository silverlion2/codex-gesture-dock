import type { OcrRegion } from './localOcr'

export const DEFAULT_OCR_REVIEW_THRESHOLD = 80
export const MAX_OCR_REVIEW_REGIONS = 100

export interface OcrConfidenceSummary {
  wordCount: number
  averageConfidence: number | null
  lowestConfidence: number | null
  reviewCount: number
}

export interface NormalizedOcrReviewRegion {
  id: string
  text: string
  confidence: number
  x: number
  y: number
  width: number
  height: number
}

function boundedConfidence(value: number) {
  return Math.max(0, Math.min(100, value))
}

function usableRegions(regions: OcrRegion[]) {
  return regions.filter((region) => region.text.trim() && Number.isFinite(region.confidence))
}

export function summarizeOcrConfidence(
  regions: OcrRegion[],
  threshold = DEFAULT_OCR_REVIEW_THRESHOLD,
): OcrConfidenceSummary {
  const usable = usableRegions(regions)
  if (!usable.length) {
    return { wordCount: 0, averageConfidence: null, lowestConfidence: null, reviewCount: 0 }
  }
  const confidences = usable.map((region) => boundedConfidence(region.confidence))
  const normalizedThreshold = boundedConfidence(threshold)
  return {
    wordCount: usable.length,
    averageConfidence: confidences.reduce((sum, confidence) => sum + confidence, 0) / confidences.length,
    lowestConfidence: Math.min(...confidences),
    reviewCount: confidences.filter((confidence) => confidence < normalizedThreshold).length,
  }
}

export function normalizeOcrReviewRegions(
  regions: OcrRegion[],
  imageWidth: number,
  imageHeight: number,
  threshold = DEFAULT_OCR_REVIEW_THRESHOLD,
  limit = MAX_OCR_REVIEW_REGIONS,
): NormalizedOcrReviewRegion[] {
  if (![imageWidth, imageHeight].every(Number.isFinite) || imageWidth <= 0 || imageHeight <= 0) return []
  const normalizedThreshold = boundedConfidence(threshold)
  const normalizedLimit = Math.max(0, Math.min(MAX_OCR_REVIEW_REGIONS, Math.floor(limit)))
  return regions
    .map((region, index) => ({ region, index }))
    .filter(({ region }) => region.text.trim() && Number.isFinite(region.confidence) && region.confidence < normalizedThreshold)
    .sort((first, second) => first.region.confidence - second.region.confidence || first.index - second.index)
    .flatMap(({ region, index }) => {
      const x0 = Math.max(0, Math.min(imageWidth, region.x0))
      const y0 = Math.max(0, Math.min(imageHeight, region.y0))
      const x1 = Math.max(0, Math.min(imageWidth, region.x1))
      const y1 = Math.max(0, Math.min(imageHeight, region.y1))
      if (![x0, y0, x1, y1].every(Number.isFinite) || x1 <= x0 || y1 <= y0) return []
      return [{
        id: `${region.lineId}-${index}`,
        text: region.text.trim(),
        confidence: boundedConfidence(region.confidence),
        x: x0 / imageWidth,
        y: y0 / imageHeight,
        width: (x1 - x0) / imageWidth,
        height: (y1 - y0) / imageHeight,
      }]
    })
    .slice(0, normalizedLimit)
}

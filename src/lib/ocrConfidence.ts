import type { OcrRegion } from './localOcr'

export const DEFAULT_OCR_REVIEW_THRESHOLD = 80
export const MAX_OCR_REVIEW_REGIONS = 100

export interface OcrReviewRegionOptions {
  includeAll?: boolean
  offset?: number
}

export interface OcrConfidenceSummary {
  wordCount: number
  averageConfidence: number | null
  lowestConfidence: number | null
  reviewCount: number
  reviewedCount: number
}

export interface NormalizedOcrReviewRegion {
  id: string
  sourceIndex: number
  text: string
  recognizedText: string
  humanReviewed: boolean
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
    return { wordCount: 0, averageConfidence: null, lowestConfidence: null, reviewCount: 0, reviewedCount: 0 }
  }
  const confidences = usable.map((region) => boundedConfidence(region.confidence))
  const normalizedThreshold = boundedConfidence(threshold)
  return {
    wordCount: usable.length,
    averageConfidence: confidences.reduce((sum, confidence) => sum + confidence, 0) / confidences.length,
    lowestConfidence: Math.min(...confidences),
    reviewCount: usable.filter((region) => !region.humanReviewed && boundedConfidence(region.confidence) < normalizedThreshold).length,
    reviewedCount: usable.filter((region) => region.humanReviewed).length,
  }
}

function buildNormalizedReviewRegions(
  regions: OcrRegion[],
  imageWidth: number,
  imageHeight: number,
  threshold: number,
  includeAll: boolean,
) {
  if (![imageWidth, imageHeight].every(Number.isFinite) || imageWidth <= 0 || imageHeight <= 0) return []
  const normalizedThreshold = boundedConfidence(threshold)
  return regions
    .map((region, index) => ({ region, index }))
    .filter(({ region }) => region.text.trim() && Number.isFinite(region.confidence) && (includeAll || region.confidence < normalizedThreshold))
    .sort((first, second) => includeAll
      ? first.index - second.index
      : Number(Boolean(first.region.humanReviewed)) - Number(Boolean(second.region.humanReviewed)) || first.region.confidence - second.region.confidence || first.index - second.index)
    .flatMap(({ region, index }): NormalizedOcrReviewRegion[] => {
      const x0 = Math.max(0, Math.min(imageWidth, region.x0))
      const y0 = Math.max(0, Math.min(imageHeight, region.y0))
      const x1 = Math.max(0, Math.min(imageWidth, region.x1))
      const y1 = Math.max(0, Math.min(imageHeight, region.y1))
      if (![x0, y0, x1, y1].every(Number.isFinite) || x1 <= x0 || y1 <= y0) return []
      return [{
        id: `${region.lineId}-${index}`,
        sourceIndex: index,
        text: region.text.trim(),
        recognizedText: (region.recognizedText ?? region.text).trim(),
        humanReviewed: Boolean(region.humanReviewed),
        confidence: boundedConfidence(region.confidence),
        x: x0 / imageWidth,
        y: y0 / imageHeight,
        width: (x1 - x0) / imageWidth,
        height: (y1 - y0) / imageHeight,
      }]
    })
}

export function normalizeOcrReviewRegions(
  regions: OcrRegion[],
  imageWidth: number,
  imageHeight: number,
  threshold = DEFAULT_OCR_REVIEW_THRESHOLD,
  limit = MAX_OCR_REVIEW_REGIONS,
  options: OcrReviewRegionOptions = {},
): NormalizedOcrReviewRegion[] {
  const normalizedLimit = Math.max(0, Math.min(MAX_OCR_REVIEW_REGIONS, Math.floor(limit)))
  const normalizedOffset = Math.max(0, Math.floor(options.offset ?? 0))
  const candidates = buildNormalizedReviewRegions(regions, imageWidth, imageHeight, threshold, Boolean(options.includeAll))
  return candidates.slice(normalizedOffset, normalizedOffset + normalizedLimit)
}

export function countOcrReviewRegions(
  regions: OcrRegion[],
  imageWidth: number,
  imageHeight: number,
  threshold = DEFAULT_OCR_REVIEW_THRESHOLD,
  includeAll = false,
) {
  return buildNormalizedReviewRegions(regions, imageWidth, imageHeight, threshold, includeAll).length
}

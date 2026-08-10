import { normalizeDocumentRedaction, type DocumentRedaction } from './documentScanner'
import type { OcrRegion } from './localOcr'

export type PiiSuggestionKind = 'email' | 'phone' | 'id-number' | 'financial-number'

export interface PiiSuggestion {
  id: string
  kind: PiiSuggestionKind
  text: string
  confidence: number
  redaction: DocumentRedaction
}

function digits(value: string) {
  return value.replace(/\D/g, '')
}

function passesLuhn(value: string) {
  const number = digits(value)
  if (number.length < 13 || number.length > 19) return false
  let total = 0
  let double = false
  for (let index = number.length - 1; index >= 0; index -= 1) {
    let digit = Number(number[index])
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    total += digit
    double = !double
  }
  return total % 10 === 0
}

export function classifySensitiveText(value: string): PiiSuggestionKind | null {
  const text = value.trim().replace(/[，。；;：:]+$/, '')
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(text)) return 'email'
  if (/^\d{6}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/u.test(text) || /^\d{15}$/u.test(text)) return 'id-number'
  if (passesLuhn(text)) return 'financial-number'
  const number = digits(text)
  if (/^1[3-9]\d{9}$/u.test(number)) return 'phone'
  if (/^[+\d\s().-]+$/u.test(text) && (text.startsWith('+') || /[()\s-]/u.test(text)) && number.length >= 7 && number.length <= 15) return 'phone'
  return null
}

function unionRegions(regions: OcrRegion[]) {
  return {
    x0: Math.min(...regions.map((region) => region.x0)),
    y0: Math.min(...regions.map((region) => region.y0)),
    x1: Math.max(...regions.map((region) => region.x1)),
    y1: Math.max(...regions.map((region) => region.y1)),
  }
}

function overlapRatio(first: DocumentRedaction, second: DocumentRedaction) {
  const x0 = Math.max(first.x, second.x)
  const y0 = Math.max(first.y, second.y)
  const x1 = Math.min(first.x + first.width, second.x + second.width)
  const y1 = Math.min(first.y + first.height, second.y + second.height)
  const intersection = Math.max(0, x1 - x0) * Math.max(0, y1 - y0)
  const smaller = Math.min(first.width * first.height, second.width * second.height)
  return smaller > 0 ? intersection / smaller : 0
}

export function findPiiSuggestions(regions: OcrRegion[], imageWidth: number, imageHeight: number) {
  if (imageWidth <= 0 || imageHeight <= 0) return []
  const byLine = new Map<string, OcrRegion[]>()
  regions.filter((region) => region.text.trim()).forEach((region) => {
    const line = byLine.get(region.lineId) ?? []
    line.push(region)
    byLine.set(region.lineId, line)
  })
  const candidates: PiiSuggestion[] = []

  byLine.forEach((lineRegions, lineId) => {
    const words = [...lineRegions].sort((first, second) => first.x0 - second.x0)
    for (let start = 0; start < words.length; start += 1) {
      for (let length = 1; length <= Math.min(6, words.length - start); length += 1) {
        const window = words.slice(start, start + length)
        const text = window.map((region) => region.text).join(length === 1 ? '' : ' ')
        const compactText = window.map((region) => region.text).join('')
        const kind = classifySensitiveText(text) ?? classifySensitiveText(compactText)
        if (!kind) continue
        const bounds = unionRegions(window)
        const paddingX = Math.max(2, (bounds.x1 - bounds.x0) * 0.04)
        const paddingY = Math.max(2, (bounds.y1 - bounds.y0) * 0.18)
        const redaction = normalizeDocumentRedaction({
          id: `pii-${lineId}-${start}-${length}`,
          x: (bounds.x0 - paddingX) / imageWidth,
          y: (bounds.y0 - paddingY) / imageHeight,
          width: (bounds.x1 - bounds.x0 + paddingX * 2) / imageWidth,
          height: (bounds.y1 - bounds.y0 + paddingY * 2) / imageHeight,
        })
        if (!redaction) continue
        candidates.push({
          id: redaction.id,
          kind,
          text: compactText,
          confidence: Math.min(...window.map((region) => region.confidence)),
          redaction,
        })
      }
    }
  })

  return candidates
    .sort((first, second) => second.redaction.width - first.redaction.width)
    .filter((candidate, index, all) => !all.slice(0, index).some((existing) => (
      existing.kind === candidate.kind && overlapRatio(existing.redaction, candidate.redaction) > 0.8
    )))
}

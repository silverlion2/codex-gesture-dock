import type { OcrRegion } from './localOcr'

export const MAX_OCR_WORD_CORRECTIONS = 100
export const MAX_OCR_CORRECTION_CHARACTERS = 200

export interface OcrWordCorrection {
  index: number
  text: string
}

export interface AppliedOcrCorrections {
  text: string
  regions: OcrRegion[]
  reviewedCount: number
  changedCount: number
}

export function normalizeOcrCorrectionText(value: string) {
  const sanitized = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 31 || codePoint === 127 ? ' ' : character
  }).join('').replace(/\s+/gu, ' ').trim()
  return Array.from(sanitized).slice(0, MAX_OCR_CORRECTION_CHARACTERS).join('')
}

export function applyOcrWordCorrections(
  sourceText: string,
  regions: OcrRegion[],
  corrections: OcrWordCorrection[],
): AppliedOcrCorrections {
  if (corrections.length === 0) throw new Error('请先记录至少一个已对照原图的词')
  if (corrections.length > MAX_OCR_WORD_CORRECTIONS) {
    throw new Error(`单次最多复核 ${MAX_OCR_WORD_CORRECTIONS} 个词`)
  }

  const correctionsByIndex = new Map<number, string>()
  for (const correction of corrections) {
    if (!Number.isInteger(correction.index) || correction.index < 0 || correction.index >= regions.length) {
      throw new Error('OCR 词框索引无效，请重新打开复核')
    }
    if (correctionsByIndex.has(correction.index)) throw new Error('同一个 OCR 词不能重复提交')
    correctionsByIndex.set(correction.index, normalizeOcrCorrectionText(correction.text))
  }

  const occurrenceCache = new Map<string, Array<{ start: number; end: number }>>()
  const replacements = [...correctionsByIndex.entries()].map(([index, text]) => {
    const sourceWord = regions[index].text
    if (!sourceWord) throw new Error('已删除的 OCR 词没有可复用文字位置，请恢复或重新识别后再校正')
    let occurrences = occurrenceCache.get(sourceWord)
    if (!occurrences) {
      occurrences = []
      let searchOffset = 0
      while (searchOffset <= sourceText.length) {
        const start = sourceText.indexOf(sourceWord, searchOffset)
        if (start < 0) break
        occurrences.push({ start, end: start + sourceWord.length })
        searchOffset = start + sourceWord.length
      }
      occurrenceCache.set(sourceWord, occurrences)
    }
    const matchingRegionIndexes = regions.flatMap((region, regionIndex) => region.text === sourceWord ? [regionIndex] : [])
    if (occurrences.length !== matchingRegionIndexes.length) {
      throw new Error(`无法在当前 OCR 文本中按出现顺序唯一定位“${sourceWord}”，请恢复或重新识别后再校正`)
    }
    const occurrenceIndex = matchingRegionIndexes.indexOf(index)
    const position = occurrences[occurrenceIndex]
    if (!position) throw new Error(`无法定位待校正文字“${sourceWord}”，请恢复或重新识别后再校正`)
    return { index, text, ...position }
  })
  const ascendingReplacements = [...replacements].sort((left, right) => left.start - right.start)
  if (ascendingReplacements.some((replacement, index) => index > 0 && replacement.start < ascendingReplacements[index - 1].end)) {
    throw new Error('待校正 OCR 文字位置互相重叠，请重新识别后再校正')
  }
  let correctedText = sourceText
  replacements.sort((left, right) => right.start - left.start).forEach(({ start, end, text }) => {
    correctedText = `${correctedText.slice(0, start)}${text}${correctedText.slice(end)}`
  })

  let changedCount = 0
  const correctedRegions = regions.map((region, index) => {
    const corrected = correctionsByIndex.get(index)
    if (corrected === undefined) return region
    if (corrected !== region.text) changedCount += 1
    return {
      ...region,
      text: corrected,
      recognizedText: region.recognizedText ?? region.text,
      humanReviewed: true,
    }
  })

  return {
    text: correctedText,
    regions: correctedRegions,
    reviewedCount: corrections.length,
    changedCount,
  }
}

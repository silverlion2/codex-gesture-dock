import type { OcrRegion } from './localOcr'

export const OCR_LAYOUT_SCHEMA_VERSION = 1

export interface OcrLayoutSource {
  filename: string
  width: number
  height: number
  language?: string
}

export interface OcrLayoutWord {
  index: number
  text: string
  confidence: number
  bbox: { x: number; y: number; width: number; height: number }
  normalized: { x: number; y: number; width: number; height: number }
}

export interface OcrLayoutLine {
  id: string
  words: OcrLayoutWord[]
}

export interface OcrLayoutDocument {
  schemaVersion: typeof OCR_LAYOUT_SCHEMA_VERSION
  type: 'ocr-word-layout'
  coordinateSpace: 'pixels-top-left'
  source: OcrLayoutSource
  wordCount: number
  lines: OcrLayoutLine[]
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value))
}

function normalized(value: number) {
  return Number(value.toFixed(6))
}

function safeStem(filename: string) {
  const stem = filename.replace(/\.[^.]+$/, '')
  const safe = [...stem]
    .map((character) => character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '-' : character)
    .join('')
    .trim()
    .slice(0, 72)
    .replace(/[. ]+$/, '')
  if (!safe || safe === '.' || safe === '..') return 'ocr-layout'
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safe) ? `${safe}-file` : safe
}

export function ocrLayoutFilename(filename: string, format: 'json' | 'csv') {
  return `${safeStem(filename)}-ocr-layout.${format}`
}

export function createOcrLayoutDocument(regions: OcrRegion[], source: OcrLayoutSource): OcrLayoutDocument {
  const width = Math.round(source.width)
  const height = Math.round(source.height)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('OCR 版面导出需要有效的原图尺寸')
  }

  const linesById = new Map<string, OcrLayoutLine>()
  let wordIndex = 0
  for (const region of regions) {
    const text = region.text.trim()
    if (!text || ![region.confidence, region.x0, region.y0, region.x1, region.y1].every(Number.isFinite)) continue
    const x0 = clamp(Math.min(region.x0, region.x1), 0, width)
    const y0 = clamp(Math.min(region.y0, region.y1), 0, height)
    const x1 = clamp(Math.max(region.x0, region.x1), 0, width)
    const y1 = clamp(Math.max(region.y0, region.y1), 0, height)
    if (x1 <= x0 || y1 <= y0) continue
    const lineId = region.lineId.trim() || `line-${wordIndex + 1}`
    let line = linesById.get(lineId)
    if (!line) {
      line = { id: lineId, words: [] }
      linesById.set(lineId, line)
    }
    const boxWidth = x1 - x0
    const boxHeight = y1 - y0
    line.words.push({
      index: wordIndex,
      text,
      confidence: Number(clamp(region.confidence, 0, 100).toFixed(2)),
      bbox: { x: x0, y: y0, width: boxWidth, height: boxHeight },
      normalized: {
        x: normalized(x0 / width),
        y: normalized(y0 / height),
        width: normalized(boxWidth / width),
        height: normalized(boxHeight / height),
      },
    })
    wordIndex += 1
  }

  return {
    schemaVersion: OCR_LAYOUT_SCHEMA_VERSION,
    type: 'ocr-word-layout',
    coordinateSpace: 'pixels-top-left',
    source: {
      filename: source.filename,
      width,
      height,
      ...(source.language ? { language: source.language } : {}),
    },
    wordCount: wordIndex,
    lines: [...linesById.values()],
  }
}

export function serializeOcrLayoutJson(document: OcrLayoutDocument) {
  return `${JSON.stringify(document, null, 2)}\n`
}

function neutralizeSpreadsheetFormula(value: string) {
  return /^\s*[=+\-@]/.test(value) ? `'${value}` : value
}

function csvCell(value: string | number) {
  const safeValue = typeof value === 'string' ? neutralizeSpreadsheetFormula(value) : String(value)
  return `"${safeValue.replace(/"/g, '""')}"`
}

export function serializeOcrLayoutCsv(document: OcrLayoutDocument) {
  const rows: Array<Array<string | number>> = [[
    'word_index', 'line_id', 'text', 'confidence',
    'x', 'y', 'width', 'height',
    'x_normalized', 'y_normalized', 'width_normalized', 'height_normalized',
  ]]
  for (const line of document.lines) {
    for (const word of line.words) {
      rows.push([
        word.index, line.id, word.text, word.confidence,
        word.bbox.x, word.bbox.y, word.bbox.width, word.bbox.height,
        word.normalized.x, word.normalized.y, word.normalized.width, word.normalized.height,
      ])
    }
  }
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}

export function readOcrImageDimensions(file: File) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('只有图像 OCR 结果包含可导出的词坐标'))
      return
    }
    const url = URL.createObjectURL(file)
    const image = new Image()
    const cleanup = () => URL.revokeObjectURL(url)
    image.onload = () => {
      cleanup()
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        reject(new Error('无法读取 OCR 原图尺寸'))
        return
      }
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => {
      cleanup()
      reject(new Error('无法读取 OCR 原图尺寸'))
    }
    image.src = url
  })
}

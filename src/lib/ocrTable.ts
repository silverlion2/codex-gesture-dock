import type { OcrRegion } from './localOcr'

export const OCR_TABLE_MAX_WORDS = 5_000
export const OCR_TABLE_MAX_COLUMNS = 8
export const OCR_TABLE_MAX_ROWS = 200

interface TableWord {
  text: string
  confidence: number
  lineId: string
  x0: number
  y0: number
  x1: number
  y1: number
  centerX: number
}

interface TableLine {
  id: string
  words: TableWord[]
  y0: number
  y1: number
  gaps: number[]
}

interface BoundaryCluster {
  x: number
  samples: number[]
  lineIds: Set<string>
}

export interface OcrTableCandidate {
  rows: string[][]
  rowLineIds: string[]
  columnCount: number
  rowCount: number
  usedWordCount: number
  ignoredWordCount: number
  confidence: number
  confidenceLabel: 'high' | 'review'
  separatorPositions: number[]
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value))
}

function median(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

function safeStem(filename: string) {
  const stem = filename.replace(/\.[^.]+$/, '')
  const safe = [...stem]
    .map((character) => character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '-' : character)
    .join('')
    .trim()
    .slice(0, 72)
    .replace(/[. ]+$/, '')
  if (!safe || safe === '.' || safe === '..') return 'ocr-table'
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safe) ? `${safe}-file` : safe
}

function validateDimensions(width: number, height: number) {
  const roundedWidth = Math.round(width)
  const roundedHeight = Math.round(height)
  if (![roundedWidth, roundedHeight].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error('OCR 表格辅助需要有效的原图尺寸')
  }
  return { width: roundedWidth, height: roundedHeight }
}

function validWords(regions: OcrRegion[], width: number, height: number) {
  if (regions.length > OCR_TABLE_MAX_WORDS) {
    throw new Error(`OCR 表格辅助最多处理 ${OCR_TABLE_MAX_WORDS} 个词框`)
  }
  const words: TableWord[] = []
  for (const [index, region] of regions.entries()) {
    const text = region.text.trim()
    if (!text || ![region.confidence, region.x0, region.y0, region.x1, region.y1].every(Number.isFinite)) continue
    const x0 = clamp(Math.min(region.x0, region.x1), 0, width)
    const y0 = clamp(Math.min(region.y0, region.y1), 0, height)
    const x1 = clamp(Math.max(region.x0, region.x1), 0, width)
    const y1 = clamp(Math.max(region.y0, region.y1), 0, height)
    if (x1 <= x0 || y1 <= y0) continue
    words.push({
      text,
      confidence: clamp(region.confidence, 0, 100),
      lineId: region.lineId.trim() || `line-${index + 1}`,
      x0,
      y0,
      x1,
      y1,
      centerX: (x0 + x1) / 2,
    })
  }
  return words
}

function buildLines(words: TableWord[], pageWidth: number) {
  const characterWidths = words.map((word) => (word.x1 - word.x0) / Math.max(1, [...word.text].length))
  const typicalCharacterWidth = Math.max(1, median(characterWidths))
  const gapThreshold = Math.max(pageWidth * 0.018, typicalCharacterWidth * 2.4)
  const linesById = new Map<string, TableWord[]>()
  for (const word of words) {
    const line = linesById.get(word.lineId) ?? []
    line.push(word)
    linesById.set(word.lineId, line)
  }
  const lines = [...linesById.entries()].map(([id, lineWords]): TableLine => {
    const sortedWords = [...lineWords].sort((a, b) => a.x0 - b.x0 || a.y0 - b.y0)
    const gaps: number[] = []
    for (let index = 1; index < sortedWords.length; index += 1) {
      const previous = sortedWords[index - 1]
      const current = sortedWords[index]
      if (current.x0 - previous.x1 >= gapThreshold) gaps.push((previous.x1 + current.x0) / 2)
    }
    return {
      id,
      words: sortedWords,
      y0: Math.min(...sortedWords.map((word) => word.y0)),
      y1: Math.max(...sortedWords.map((word) => word.y1)),
      gaps,
    }
  }).sort((a, b) => a.y0 - b.y0 || a.words[0].x0 - b.words[0].x0)
  return { lines, typicalCharacterWidth }
}

function splitVerticalBlocks(lines: TableLine[], pageHeight: number) {
  if (lines.length === 0) return []
  const typicalLineHeight = Math.max(1, median(lines.map((line) => line.y1 - line.y0)))
  const maximumGap = Math.max(pageHeight * 0.05, typicalLineHeight * 3.5)
  const blocks: TableLine[][] = []
  let active: TableLine[] = []
  for (const line of lines) {
    const previous = active.at(-1)
    if (previous && line.y0 - previous.y1 > maximumGap) {
      blocks.push(active)
      active = []
    }
    active.push(line)
  }
  if (active.length > 0) blocks.push(active)
  return blocks
}

function clusterBoundaries(lines: TableLine[], tolerance: number) {
  const samples = lines.flatMap((line) => line.gaps.map((x) => ({ x, lineId: line.id }))).sort((a, b) => a.x - b.x)
  const clusters: BoundaryCluster[] = []
  for (const sample of samples) {
    const cluster = clusters.find((candidate) => Math.abs(candidate.x - sample.x) <= tolerance)
    if (!cluster) {
      clusters.push({ x: sample.x, samples: [sample.x], lineIds: new Set([sample.lineId]) })
      continue
    }
    cluster.samples.push(sample.x)
    cluster.lineIds.add(sample.lineId)
    cluster.x = median(cluster.samples)
  }
  const minimumSupport = Math.max(2, Math.ceil(lines.length * 0.5))
  return clusters
    .filter((cluster) => cluster.lineIds.size >= minimumSupport)
    .sort((a, b) => b.lineIds.size - a.lineIds.size || a.x - b.x)
    .slice(0, OCR_TABLE_MAX_COLUMNS - 1)
    .sort((a, b) => a.x - b.x)
}

function analyzeBlock(
  block: TableLine[],
  allWordCount: number,
  pageWidth: number,
  typicalCharacterWidth: number,
): OcrTableCandidate | null {
  if (block.length < 3) return null
  const tolerance = Math.max(pageWidth * 0.022, typicalCharacterWidth * 3)
  const boundaries = clusterBoundaries(block, tolerance)
  if (boundaries.length === 0) return null
  const selectedLines = block.filter((line) => line.gaps.some((gap) => boundaries.some((boundary) => Math.abs(boundary.x - gap) <= tolerance)))
  if (selectedLines.length < 3) return null
  const separators = boundaries.map((boundary) => boundary.x)
  const rows = selectedLines.map((line) => {
    const cells = Array.from({ length: separators.length + 1 }, () => [] as string[])
    for (const word of line.words) {
      const column = separators.findIndex((separator) => word.centerX < separator)
      cells[column < 0 ? separators.length : column].push(word.text)
    }
    return cells.map((cell) => cell.join(' ').trim())
  })
  const consistentRows = rows.filter((row) => row.filter(Boolean).length >= 2).length
  if (consistentRows < 3 || consistentRows / rows.length < 0.75) return null
  const usedWords = selectedLines.flatMap((line) => line.words)
  const boundarySupport = Math.min(...boundaries.map((boundary) => boundary.lineIds.size / selectedLines.length))
  const meanConfidence = usedWords.reduce((sum, word) => sum + word.confidence, 0) / Math.max(1, usedWords.length) / 100
  const confidence = Number(clamp(boundarySupport * 0.55 + consistentRows / rows.length * 0.25 + meanConfidence * 0.2, 0, 1).toFixed(3))
  return {
    rows,
    rowLineIds: selectedLines.map((line) => line.id),
    columnCount: separators.length + 1,
    rowCount: rows.length,
    usedWordCount: usedWords.length,
    ignoredWordCount: Math.max(0, allWordCount - usedWords.length),
    confidence,
    confidenceLabel: confidence >= 0.78 && rows.length >= 4 ? 'high' : 'review',
    separatorPositions: separators.map((position) => Number((position / pageWidth).toFixed(6))),
  }
}

export function detectOcrTable(regions: OcrRegion[], sourceWidth: number, sourceHeight: number): OcrTableCandidate | null {
  const { width, height } = validateDimensions(sourceWidth, sourceHeight)
  const words = validWords(regions, width, height)
  if (words.length < 6) return null
  const { lines, typicalCharacterWidth } = buildLines(words, width)
  const candidateLines = lines.filter((line) => line.gaps.length > 0)
  const candidates = splitVerticalBlocks(candidateLines, height)
    .map((block) => analyzeBlock(block, words.length, width, typicalCharacterWidth))
    .filter((candidate): candidate is OcrTableCandidate => candidate !== null)
    .sort((a, b) => b.rowCount - a.rowCount || b.usedWordCount - a.usedWordCount || b.confidence - a.confidence)
  const candidate = candidates[0] ?? null
  if (candidate && candidate.rowCount > OCR_TABLE_MAX_ROWS) {
    throw new Error(`OCR 表格候选超过 ${OCR_TABLE_MAX_ROWS} 行，请拆分图片后重试`)
  }
  return candidate
}

function neutralizeSpreadsheetFormula(value: string) {
  return /^\s*[=+\-@]/.test(value) ? `'${value}` : value
}

function csvCell(value: string) {
  return `"${neutralizeSpreadsheetFormula(value).replace(/"/g, '""')}"`
}

export function serializeOcrTableCsv(rows: string[][]) {
  if (rows.length === 0 || rows.length > OCR_TABLE_MAX_ROWS) throw new Error(`OCR 表格 CSV 需要 1–${OCR_TABLE_MAX_ROWS} 行`)
  const columnCount = rows[0]?.length ?? 0
  if (columnCount < 2 || columnCount > OCR_TABLE_MAX_COLUMNS || rows.some((row) => row.length !== columnCount)) {
    throw new Error(`OCR 表格 CSV 需要 2–${OCR_TABLE_MAX_COLUMNS} 个等宽列`)
  }
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}

export function ocrTableFilename(filename: string) {
  return `${safeStem(filename)}-ocr-table.csv`
}

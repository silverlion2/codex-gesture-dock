import type { OcrRegion } from './localOcr'

export const OCR_LAYOUT_SCHEMA_VERSION = 1
export const ALTO_SCHEMA_VERSION = '4.4'
export const ALTO_NAMESPACE = 'http://www.loc.gov/standards/alto/ns-v4#'
export const ALTO_SCHEMA_URL = 'http://www.loc.gov/standards/alto/v4/alto-4-4.xsd'

export type OcrLayoutFormat = 'json' | 'csv' | 'hocr' | 'alto'

export interface OcrLayoutSource {
  filename: string
  width: number
  height: number
  language?: string
}

export interface OcrLayoutWord {
  index: number
  text: string
  recognizedText?: string
  humanReviewed?: boolean
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

export function ocrLayoutFilename(filename: string, format: OcrLayoutFormat) {
  return `${safeStem(filename)}-ocr-layout.${format === 'alto' ? 'alto.xml' : format}`
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
      ...(region.recognizedText !== undefined ? { recognizedText: region.recognizedText } : {}),
      ...(region.humanReviewed ? { humanReviewed: true } : {}),
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

export function serializeOcrLayoutJsonPages(documents: OcrLayoutDocument[], sourceFilename = `${documents.length}-page scanned document`) {
  if (documents.length === 0) throw new Error('多页 JSON 导出需要至少一页 OCR 版面')
  documents.forEach((document, pageIndex) => {
    if (document.wordCount === 0) throw new Error(`第 ${pageIndex + 1} 页没有有效 OCR 词框`)
  })
  return `${JSON.stringify({
    schemaVersion: OCR_LAYOUT_SCHEMA_VERSION,
    type: 'ocr-document-layout',
    coordinateSpace: 'pixels-top-left',
    sourceFilename,
    pageCount: documents.length,
    wordCount: documents.reduce((total, document) => total + document.wordCount, 0),
    pages: documents,
  }, null, 2)}\n`
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
    'word_index', 'line_id', 'text', 'recognized_text', 'human_reviewed', 'confidence',
    'x', 'y', 'width', 'height',
    'x_normalized', 'y_normalized', 'width_normalized', 'height_normalized',
  ]]
  for (const line of document.lines) {
    for (const word of line.words) {
      rows.push([
        word.index, line.id, word.text, word.recognizedText ?? word.text, word.humanReviewed ? 'true' : 'false', word.confidence,
        word.bbox.x, word.bbox.y, word.bbox.width, word.bbox.height,
        word.normalized.x, word.normalized.y, word.normalized.width, word.normalized.height,
      ])
    }
  }
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}

export function serializeOcrLayoutCsvPages(documents: OcrLayoutDocument[]) {
  if (documents.length === 0) throw new Error('多页 CSV 导出需要至少一页 OCR 版面')
  const rows: Array<Array<string | number>> = [[
    'page_number', 'source_filename', 'source_width', 'source_height', 'language',
    'word_index', 'line_id', 'text', 'recognized_text', 'human_reviewed', 'confidence',
    'x', 'y', 'width', 'height',
    'x_normalized', 'y_normalized', 'width_normalized', 'height_normalized',
  ]]
  documents.forEach((document, pageIndex) => {
    if (document.wordCount === 0) throw new Error(`第 ${pageIndex + 1} 页没有有效 OCR 词框`)
    for (const line of document.lines) {
      for (const word of line.words) {
        rows.push([
          pageIndex + 1, document.source.filename, document.source.width, document.source.height, document.source.language ?? '',
          word.index, line.id, word.text, word.recognizedText ?? word.text, word.humanReviewed ? 'true' : 'false', word.confidence,
          word.bbox.x, word.bbox.y, word.bbox.width, word.bbox.height,
          word.normalized.x, word.normalized.y, word.normalized.width, word.normalized.height,
        ])
      }
    }
  })
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function hocrLanguages(language?: string) {
  if (!language) return []
  const languageMap: Record<string, string> = {
    eng: 'en',
    chi_sim: 'zh-Hans',
    chi_tra: 'zh-Hant',
  }
  return language
    .split('+')
    .map((value) => languageMap[value.trim()] ?? '')
    .filter(Boolean)
}

function hocrImagePath(filename: string) {
  const unixPath = filename.replaceAll('\\', '/')
  const encoded = unixPath.split('/').map((segment) => [...segment].map((character) => {
    try {
      return encodeURIComponent(character)
    } catch {
      return '%EF%BF%BD'
    }
  }).join('')).join('/')
  return encoded || 'source-image'
}

function xmlAttribute(value: string) {
  return escapeHtml(value)
}

function numericConfidence(confidence: number) {
  return String(Number((confidence / 100).toFixed(4)))
}

function boundsForWords(words: OcrLayoutWord[]) {
  const x = Math.min(...words.map((word) => word.bbox.x))
  const y = Math.min(...words.map((word) => word.bbox.y))
  const right = Math.max(...words.map((word) => word.bbox.x + word.bbox.width))
  const bottom = Math.max(...words.map((word) => word.bbox.y + word.bbox.height))
  return { x, y, width: right - x, height: bottom - y }
}

function lineBounds(line: OcrLayoutLine) {
  const bounds = boundsForWords(line.words)
  return `${bounds.x} ${bounds.y} ${bounds.x + bounds.width} ${bounds.y + bounds.height}`
}

export function serializeOcrLayoutHocr(document: OcrLayoutDocument) {
  return serializeOcrLayoutHocrPages([document])
}

export function serializeOcrLayoutHocrPages(documents: OcrLayoutDocument[]) {
  if (documents.length === 0) throw new Error('多页 hOCR 导出需要至少一页 OCR 版面')
  const languages = [...new Set(documents.flatMap((document) => hocrLanguages(document.source.language)))]
  const pageLanguage = languages[0] ? ` lang="${languages[0]}"` : ''
  const metadataLanguage = languages.length > 0
    ? `\n    <meta name="ocr-langs" content="${languages.join(' ')}" />`
    : ''
  const pages = documents.map((document, pageIndex) => {
    if (document.wordCount === 0) throw new Error(`第 ${pageIndex + 1} 页没有有效 OCR 词框`)
    const idPrefix = documents.length === 1 ? '' : `page_${pageIndex + 1}_`
    const lines = document.lines.map((line, lineIndex) => {
      const words = line.words.map((word) => {
        const x1 = word.bbox.x + word.bbox.width
        const y1 = word.bbox.y + word.bbox.height
        const reviewMetadata = word.humanReviewed ? '; x_codex_human_reviewed 1' : ''
        return `        <span class="ocrx_word" id="${idPrefix}word_${word.index + 1}" title="bbox ${word.bbox.x} ${word.bbox.y} ${x1} ${y1}; x_wconf ${Math.round(word.confidence)}${reviewMetadata}">${escapeHtml(word.text)}</span>`
      }).join('\n')
      return `      <span class="ocrx_line" id="${idPrefix}line_${lineIndex + 1}" title="bbox ${lineBounds(line)}">\n${words}\n      </span>`
    }).join('\n')
    return `    <div class="ocr_page" id="page_${pageIndex + 1}" title="image &quot;${hocrImagePath(document.source.filename)}&quot;; bbox 0 0 ${document.source.width} ${document.source.height}; ppageno ${pageIndex}" data-source="${escapeHtml(document.source.filename)}">\n${lines}\n    </div>`
  }).join('\n')
  const sourceFilename = escapeHtml(documents.length === 1 ? documents[0].source.filename : `${documents.length}-page scanned document`)

  return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"${pageLanguage}>
  <head>
    <meta charset="utf-8" />
    <meta name="ocr-system" content="Tesseract.js local OCR" />
    <meta name="ocr-capabilities" content="ocr_page ocrx_line ocrx_word" />${metadataLanguage}
    <meta name="ocr-source" content="${sourceFilename}" />
    <title>${sourceFilename} OCR layout</title>
  </head>
  <body>
${pages}
  </body>
</html>
`
}

export function serializeOcrLayoutAlto(document: OcrLayoutDocument) {
  return serializeOcrLayoutAltoPages([document], document.source.filename)
}

export function serializeOcrLayoutAltoPages(documents: OcrLayoutDocument[], sourceFilename = `${documents.length}-page scanned document`) {
  if (documents.length === 0) throw new Error('多页 ALTO 导出需要至少一页 OCR 版面')
  const sourceTags = documents.map((document, pageIndex) =>
    `    <OtherTag ID="SourceImage_Page_${pageIndex + 1}" TYPE="source-image" LABEL="${xmlAttribute(document.source.filename)}" DESCRIPTION="Source raster filename for Page_${pageIndex + 1}"/>`,
  ).join('\n')
  const pages = documents.map((document, pageIndex) => {
    const languages = hocrLanguages(document.source.language)
    const idPrefix = documents.length === 1 ? '' : `Page_${pageIndex + 1}_`
    const languageAttributes = languages.length > 0
      ? ` LANG="${xmlAttribute(languages[0])}"${languages.length > 1 ? ` OTHERLANGS="${languages.slice(1).map(xmlAttribute).join(' ')}"` : ''}`
      : ''
    const allWords = document.lines.flatMap((line) => line.words)
    if (allWords.length === 0) throw new Error(`第 ${pageIndex + 1} 页没有有效 OCR 词框`)
    const blockBounds = boundsForWords(allWords)
    const lines = document.lines.map((line, lineIndex) => {
      const bounds = boundsForWords(line.words)
      const words = line.words.map((word) => {
        const attributes = `ID="${idPrefix}String_${word.index + 1}" CONTENT="${xmlAttribute(word.text)}" HPOS="${word.bbox.x}" VPOS="${word.bbox.y}" WIDTH="${word.bbox.width}" HEIGHT="${word.bbox.height}" WC="${numericConfidence(word.confidence)}"${word.humanReviewed ? ' CS="true"' : ''}`
        if (word.humanReviewed && word.recognizedText !== undefined) {
          return `          <String ${attributes}>\n            <ALTERNATIVE PURPOSE="original-recognition">${escapeHtml(word.recognizedText)}</ALTERNATIVE>\n          </String>`
        }
        return `          <String ${attributes}/>`
      }).join('\n')
      return `        <TextLine ID="${idPrefix}TextLine_${lineIndex + 1}" HPOS="${bounds.x}" VPOS="${bounds.y}" WIDTH="${bounds.width}" HEIGHT="${bounds.height}">\n${words}\n        </TextLine>`
    }).join('\n')
    return `    <Page ID="Page_${pageIndex + 1}" PHYSICAL_IMG_NR="${pageIndex + 1}" WIDTH="${document.source.width}" HEIGHT="${document.source.height}"${languageAttributes}>
      <PrintSpace ID="${idPrefix}PrintSpace_1" HPOS="0" VPOS="0" WIDTH="${document.source.width}" HEIGHT="${document.source.height}">
        <TextBlock ID="${idPrefix}TextBlock_1" TAGREFS="SourceImage_Page_${pageIndex + 1}" HPOS="${blockBounds.x}" VPOS="${blockBounds.y}" WIDTH="${blockBounds.width}" HEIGHT="${blockBounds.height}">
${lines}
        </TextBlock>
      </PrintSpace>
    </Page>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<alto xmlns="${ALTO_NAMESPACE}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${ALTO_NAMESPACE} ${ALTO_SCHEMA_URL}" SCHEMAVERSION="${ALTO_SCHEMA_VERSION}">
  <Description>
    <MeasurementUnit>pixel</MeasurementUnit>
    <sourceImageInformation>
      <fileName>${escapeHtml(sourceFilename)}</fileName>
    </sourceImageInformation>
  </Description>
  <Tags>
${sourceTags}
  </Tags>
  <Layout>
${pages}
  </Layout>
</alto>
`
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

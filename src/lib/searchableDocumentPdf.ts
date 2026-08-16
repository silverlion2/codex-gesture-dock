import type { ScannedDocumentPage } from './documentScanner'
import type { OcrRegion } from './localOcr'

const FONT_FILE_NAME = 'NotoSansSC-VF.ttf'
const FONT_FAMILY_NAME = 'NotoSansSC'
const FONT_ASSET_PATH = `fonts/${FONT_FILE_NAME}`
const CJK_CHARACTER = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

export const SEARCHABLE_PDF_FONT_SHA256 = 'A3041811A78C361B1DE50F953C805E0244951C21C5BD412F7232EF0D899AF0DA'

export interface SearchableDocumentPdfPage {
  page: ScannedDocumentPage
  regions: OcrRegion[]
}

interface SearchableDocumentPdfOptions {
  fontData?: ArrayBuffer
  now?: Date
  onProgress?: (page: number, pageCount: number) => void
}

interface NormalizedTextRegion {
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
}

let fontDataPromise: Promise<ArrayBuffer> | null = null

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function sanitizeRegionText(text: string) {
  return Array.from(text, (character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 31 || codePoint === 127 ? ' ' : character
  }).join('').trim()
}

function normalizeRegion(region: OcrRegion, page: ScannedDocumentPage): NormalizedTextRegion | null {
  const text = sanitizeRegionText(region.text)
  if (!text) return null
  if (![region.x0, region.y0, region.x1, region.y1].every(Number.isFinite)) return null
  const x0 = clamp(region.x0, 0, page.width)
  const y0 = clamp(region.y0, 0, page.height)
  const x1 = clamp(region.x1, 0, page.width)
  const y1 = clamp(region.y1, 0, page.height)
  if (x1 <= x0 || y1 <= y0) return null
  return { text, x0, y0, x1, y1 }
}

export function searchablePdfEligiblePageCount(pages: SearchableDocumentPdfPage[]) {
  return pages.filter(({ page, regions }) => regions.some((region) => normalizeRegion(region, page))).length
}

export function splitSearchablePdfTextRuns(text: string) {
  const runs: string[] = []
  let current = ''
  let currentIsCjk: boolean | null = null
  for (const character of Array.from(text)) {
    const isCjk = CJK_CHARACTER.test(character)
    if (current && currentIsCjk !== isCjk) {
      runs.push(current)
      current = ''
    }
    current += character
    currentIsCjk = isCjk
  }
  if (current) runs.push(current)
  return runs
}

function arrayBufferToBase64(data: ArrayBuffer) {
  const bytes = new Uint8Array(data)
  const chunkSize = 0x8000
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

async function loadFontData() {
  if (!fontDataPromise) {
    fontDataPromise = (async () => {
      const response = await fetch(new URL(FONT_ASSET_PATH, document.baseURI).href)
      if (!response.ok) throw new Error('无法载入本机中文 PDF 字体，请重新安装应用')
      return response.arrayBuffer()
    })().catch((error) => {
      fontDataPromise = null
      throw error
    })
  }
  return fontDataPromise
}

export async function buildSearchableScannedPdf(
  pages: SearchableDocumentPdfPage[],
  options: SearchableDocumentPdfOptions = {},
) {
  if (pages.length === 0) throw new Error('请先添加至少一页扫描图')
  const normalizedPages = pages.map(({ page, regions }) => ({
    page,
    regions: regions.map((region) => normalizeRegion(region, page)).filter((region): region is NormalizedTextRegion => Boolean(region)),
  }))
  if (normalizedPages.some(({ regions }) => regions.length === 0)) {
    throw new Error('每一页都需要先完成带版面词框的 OCR，才能生成可搜索 PDF')
  }

  const fontData = options.fontData ?? await loadFontData()
  if (fontData.byteLength < 1_024) throw new Error('本机中文 PDF 字体文件无效')
  const { jsPDF } = await import('jspdf')
  const first = normalizedPages[0].page
  const pdf = new jsPDF({
    orientation: first.width > first.height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [first.width, first.height],
    compress: true,
    hotfixes: ['px_scaling'],
    putOnlyUsedFonts: true,
  })
  pdf.addFileToVFS(FONT_FILE_NAME, arrayBufferToBase64(fontData))
  pdf.addFont(FONT_FILE_NAME, FONT_FAMILY_NAME, 'normal')
  pdf.setFont(FONT_FAMILY_NAME, 'normal')
  pdf.setProperties({
    title: 'Codex searchable scanned document',
    subject: 'Locally generated scanned PDF with an invisible OCR text layer',
    creator: 'Codex Gesture Dock',
  })

  normalizedPages.forEach(({ page, regions }, pageIndex) => {
    options.onProgress?.(pageIndex + 1, normalizedPages.length)
    if (pageIndex > 0) {
      pdf.addPage([page.width, page.height], page.width > page.height ? 'landscape' : 'portrait')
      pdf.setFont(FONT_FAMILY_NAME, 'normal')
    }
    pdf.addImage(page.dataUrl, 'PNG', 0, 0, page.width, page.height, undefined, 'FAST')

    regions.forEach((region) => {
      const fontSize = clamp(region.y1 - region.y0, 1, 240)
      pdf.setFontSize(fontSize)
      const runs = splitSearchablePdfTextRuns(region.text)
      const measuredWidths = runs.map((run) => Math.max(pdf.getTextWidth(run), 0.01))
      const measuredWidth = measuredWidths.reduce((total, width) => total + width, 0)
      const horizontalScale = clamp((region.x1 - region.x0) / measuredWidth, 0.1, 10)
      let x = region.x0
      runs.forEach((run, runIndex) => {
        pdf.text(run, x, region.y1, {
          baseline: 'bottom',
          horizontalScale,
          renderingMode: 'invisible',
        })
        x += measuredWidths[runIndex] * horizontalScale
      })
    })
  })

  return pdf.output('arraybuffer')
}

export async function downloadSearchableScannedPdf(
  pages: SearchableDocumentPdfPage[],
  options: SearchableDocumentPdfOptions = {},
) {
  const data = await buildSearchableScannedPdf(pages, options)
  const timestamp = (options.now ?? new Date()).toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z')
  const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.download = `codex-searchable-document-${timestamp}.pdf`
  link.href = url
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

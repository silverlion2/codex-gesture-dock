import type { CapturedDocument } from './cameraTools'
import { analyzeDocumentQualityPixels, type DocumentQualityReport } from './documentQuality'

export type DocumentFilter = 'color' | 'grayscale' | 'document'
export type DocumentRotation = 0 | 90 | 180 | 270
export type DocumentRotationDirection = 'left' | 'right'

export interface DocumentPoint {
  x: number
  y: number
}

export interface DocumentCorners {
  topLeft: DocumentPoint
  topRight: DocumentPoint
  bottomRight: DocumentPoint
  bottomLeft: DocumentPoint
}

export interface DocumentRedaction {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface ScannedDocumentPage {
  id: string
  sourceDataUrl: string
  dataUrl: string
  filename: string
  width: number
  height: number
  filter: DocumentFilter
  autoDetected: boolean
  correction: 'auto' | 'manual' | 'fallback'
  corners: DocumentCorners
  sourceWidth: number
  sourceHeight: number
  baseDataUrl: string
  redactions: DocumentRedaction[]
  quality?: DocumentQualityReport
  rotation?: DocumentRotation
}

export interface PdfCaptureProgress {
  page: number
  pageCount: number
}

export const DOCUMENT_MAX_FILE_BYTES = 35 * 1024 * 1024
export const DOCUMENT_MAX_PDF_PAGES = 20
const DOCUMENT_MAX_PDF_DIMENSION = 2_200

interface WorkerScanResult {
  width: number
  height: number
  pixels: ArrayBuffer
  autoDetected: boolean
  manualAdjusted: boolean
  corners: DocumentCorners
}

type ScannerWorkerResponse =
  | { type: 'progress'; id: string; message: string }
  | ({ type: 'result'; id: string } & WorkerScanResult)
  | { type: 'error'; id: string; message: string }

interface PendingScan {
  resolve: (result: WorkerScanResult) => void
  reject: (error: Error) => void
  onProgress?: (message: string) => void
}

const pendingScans = new Map<string, PendingScan>()
let scannerWorker: Worker | null = null

function localAsset(path: string) {
  return new URL(`vision/${path}`, document.baseURI).href
}

function stopScannerWorker(error: Error) {
  scannerWorker?.terminate()
  scannerWorker = null
  pendingScans.forEach((pending) => pending.reject(error))
  pendingScans.clear()
}

function getScannerWorker() {
  if (scannerWorker) return scannerWorker
  if (typeof Worker === 'undefined') throw new Error('当前浏览器不支持本机文档扫描 worker')
  scannerWorker = new Worker(localAsset('document-scanner.worker.js'))
  scannerWorker.addEventListener('message', (event: MessageEvent<ScannerWorkerResponse>) => {
    const response = event.data
    const pending = pendingScans.get(response.id)
    if (!pending) return
    if (response.type === 'progress') {
      pending.onProgress?.(response.message)
      return
    }
    pendingScans.delete(response.id)
    if (response.type === 'error') {
      pending.reject(new Error(response.message || '本机文档扫描失败'))
      return
    }
    pending.resolve({
      width: response.width,
      height: response.height,
      pixels: response.pixels,
      autoDetected: response.autoDetected,
      manualAdjusted: response.manualAdjusted,
      corners: response.corners,
    })
  })
  scannerWorker.addEventListener('error', (event) => {
    stopScannerWorker(new Error(event.message || '本机文档扫描 worker 意外停止'))
  })
  window.addEventListener('beforeunload', () => scannerWorker?.terminate(), { once: true })
  return scannerWorker
}

function processImageData(
  imageData: ImageData,
  filter: DocumentFilter,
  onProgress?: (message: string) => void,
  corners?: DocumentCorners,
) {
  const id = crypto.randomUUID()
  const pixels = imageData.data.slice().buffer
  return new Promise<WorkerScanResult>((resolve, reject) => {
    pendingScans.set(id, { resolve, reject, onProgress })
    try {
      getScannerWorker().postMessage({
        id,
        width: imageData.width,
        height: imageData.height,
        pixels,
        filter,
        corners,
      }, [pixels])
    } catch (error) {
      pendingScans.delete(id)
      reject(error instanceof Error ? error : new Error('无法启动本机文档扫描'))
    }
  })
}

export function orderDocumentCorners(points: DocumentPoint[]): DocumentCorners {
  if (points.length !== 4) throw new Error('文档边缘必须包含四个角点')
  const bySum = [...points].sort((a, b) => a.x + a.y - (b.x + b.y))
  const byDifference = [...points].sort((a, b) => a.x - a.y - (b.x - b.y))
  const ordered: DocumentCorners = {
    topLeft: bySum[0],
    topRight: byDifference[3],
    bottomRight: bySum[3],
    bottomLeft: byDifference[0],
  }
  if (new Set(Object.values(ordered)).size !== 4) {
    const byY = [...points].sort((a, b) => a.y - b.y)
    const top = byY.slice(0, 2).sort((a, b) => a.x - b.x)
    const bottom = byY.slice(2).sort((a, b) => a.x - b.x)
    return { topLeft: top[0], topRight: top[1], bottomRight: bottom[1], bottomLeft: bottom[0] }
  }
  return ordered
}

function distance(a: DocumentPoint, b: DocumentPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function calculateDocumentSize(corners: DocumentCorners, maxDimension = 2_200) {
  const naturalWidth = Math.max(
    distance(corners.topLeft, corners.topRight),
    distance(corners.bottomLeft, corners.bottomRight),
  )
  const naturalHeight = Math.max(
    distance(corners.topLeft, corners.bottomLeft),
    distance(corners.topRight, corners.bottomRight),
  )
  const scale = Math.min(1, maxDimension / Math.max(naturalWidth, naturalHeight))
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
  }
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image), { once: true })
    image.addEventListener('error', () => reject(new Error('无法读取文档图像')), { once: true })
    image.src = dataUrl
  })
}

function imagePixels(image: HTMLImageElement) {
  const maxInputDimension = 3_200
  const scale = Math.min(1, maxInputDimension / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('无法创建本机文档扫描画布')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, width, height)
  return context.getImageData(0, 0, width, height)
}

export async function scanCapturedDocument(
  capture: CapturedDocument,
  filter: DocumentFilter,
  onProgress?: (message: string) => void,
  corners?: DocumentCorners,
): Promise<ScannedDocumentPage> {
  onProgress?.('正在准备本机扫描 worker')
  const image = await loadImage(capture.dataUrl)
  const sourcePixels = imagePixels(image)
  const quality = analyzeDocumentQualityPixels(sourcePixels.data, sourcePixels.width, sourcePixels.height)
  const result = await processImageData(sourcePixels, filter, onProgress, corners)
  const canvas = document.createElement('canvas')
  canvas.width = result.width
  canvas.height = result.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法生成文档扫描预览')
  context.putImageData(
    new ImageData(new Uint8ClampedArray(result.pixels), result.width, result.height),
    0,
    0,
  )
  const dataUrl = canvas.toDataURL('image/png')
  return {
    id: crypto.randomUUID(),
    sourceDataUrl: capture.dataUrl,
    dataUrl,
    filename: capture.filename.replace(/\.png$/i, '-processed.png'),
    width: result.width,
    height: result.height,
    filter,
    autoDetected: result.autoDetected,
    correction: result.manualAdjusted ? 'manual' : result.autoDetected ? 'auto' : 'fallback',
    corners: result.corners,
    sourceWidth: sourcePixels.width,
    sourceHeight: sourcePixels.height,
    baseDataUrl: dataUrl,
    redactions: [],
    quality,
    rotation: 0,
  }
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value))
}

export function normalizeDocumentRedaction(redaction: DocumentRedaction): DocumentRedaction | null {
  const x = clampUnit(redaction.x)
  const y = clampUnit(redaction.y)
  const width = Math.max(0, Math.min(1 - x, redaction.width))
  const height = Math.max(0, Math.min(1 - y, redaction.height))
  if (width < 0.005 || height < 0.005) return null
  return { ...redaction, x, y, width, height }
}

export function rotateDocumentRedaction(
  redaction: DocumentRedaction,
  direction: DocumentRotationDirection,
): DocumentRedaction | null {
  const normalized = normalizeDocumentRedaction(redaction)
  if (!normalized) return null
  const rotated = normalizeDocumentRedaction(direction === 'right' ? {
    ...normalized,
    x: 1 - normalized.y - normalized.height,
    y: normalized.x,
    width: normalized.height,
    height: normalized.width,
  } : {
    ...normalized,
    x: normalized.y,
    y: 1 - normalized.x - normalized.width,
    width: normalized.height,
    height: normalized.width,
  })
  return rotated ? {
    ...rotated,
    x: Number(rotated.x.toFixed(8)),
    y: Number(rotated.y.toFixed(8)),
    width: Number(rotated.width.toFixed(8)),
    height: Number(rotated.height.toFixed(8)),
  } : null
}

export async function applyDocumentRedactions(
  page: ScannedDocumentPage,
  requestedRedactions: DocumentRedaction[],
): Promise<ScannedDocumentPage> {
  const redactions = requestedRedactions
    .map(normalizeDocumentRedaction)
    .filter((redaction): redaction is DocumentRedaction => redaction !== null)
  if (redactions.length === 0) {
    return {
      ...page,
      dataUrl: page.baseDataUrl,
      filename: page.filename.replace(/-redacted\.png$/i, '.png'),
      redactions: [],
    }
  }
  const image = await loadImage(page.baseDataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = page.width
  canvas.height = page.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建隐私遮盖画布')
  context.drawImage(image, 0, 0, page.width, page.height)
  context.fillStyle = '#000000'
  redactions.forEach((redaction) => {
    context.fillRect(
      Math.floor(redaction.x * page.width),
      Math.floor(redaction.y * page.height),
      Math.ceil(redaction.width * page.width),
      Math.ceil(redaction.height * page.height),
    )
  })
  return {
    ...page,
    dataUrl: canvas.toDataURL('image/png'),
    filename: page.filename.replace(/(?:-redacted)?\.png$/i, '-redacted.png'),
    redactions,
  }
}

async function rotateDocumentDataUrl(
  dataUrl: string,
  width: number,
  height: number,
  direction: DocumentRotationDirection,
) {
  const image = await loadImage(dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = height
  canvas.height = width
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建文档旋转画布')
  if (direction === 'right') {
    context.translate(canvas.width, 0)
    context.rotate(Math.PI / 2)
  } else {
    context.translate(0, canvas.height)
    context.rotate(-Math.PI / 2)
  }
  context.drawImage(image, 0, 0, width, height)
  return canvas.toDataURL('image/png')
}

export async function rotateScannedDocumentPage(
  page: ScannedDocumentPage,
  direction: DocumentRotationDirection,
): Promise<ScannedDocumentPage> {
  const baseDataUrl = await rotateDocumentDataUrl(page.baseDataUrl, page.width, page.height, direction)
  const redactions = page.redactions
    .map((redaction) => rotateDocumentRedaction(redaction, direction))
    .filter((redaction): redaction is DocumentRedaction => redaction !== null)
  const delta = direction === 'right' ? 90 : 270
  const rotation = (((page.rotation ?? 0) + delta) % 360) as DocumentRotation
  return applyDocumentRedactions({
    ...page,
    width: page.height,
    height: page.width,
    baseDataUrl,
    dataUrl: baseDataUrl,
    redactions: [],
    rotation,
  }, redactions)
}

export function captureFromImageFile(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('请选择 PNG、JPEG、WebP 或 BMP 图像')
  if (file.size > DOCUMENT_MAX_FILE_BYTES) throw new Error('图像不能超过 35 MB')
  return new Promise<CapturedDocument>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve({
      dataUrl: String(reader.result),
      filename: `${file.name.replace(/\.[^.]+$/, '') || 'document'}.png`,
    }), { once: true })
    reader.addEventListener('error', () => reject(new Error('无法读取所选图像')), { once: true })
    reader.readAsDataURL(file)
  })
}

function safeDocumentName(filename: string) {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[<>:"/\\|?*]/g, '-')
    .split('')
    .map((character) => character.charCodeAt(0) < 32 ? '-' : character)
    .join('')
    .replace(/[. ]+$/g, '')
    .slice(0, 80) || 'document'
}

export async function captureFromPdfFile(
  file: File,
  onProgress?: (progress: PdfCaptureProgress) => void,
): Promise<CapturedDocument[]> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!isPdf) throw new Error('请选择 PDF 文件')
  if (file.size > DOCUMENT_MAX_FILE_BYTES) throw new Error('PDF 不能超过 35 MB')

  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('ocr/pdf.worker.min.mjs', document.baseURI).href
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const pdf = await loadingTask.promise
  try {
    if (pdf.numPages > DOCUMENT_MAX_PDF_PAGES) {
      throw new Error(`PDF 最多支持 ${DOCUMENT_MAX_PDF_PAGES} 页，请先拆分文件`)
    }
    if (pdf.numPages < 1) throw new Error('PDF 不包含可导入的页面')

    const baseName = safeDocumentName(file.name)
    const captures: CapturedDocument[] = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      onProgress?.({ page: pageNumber, pageCount: pdf.numPages })
      const page = await pdf.getPage(pageNumber)
      try {
        const naturalViewport = page.getViewport({ scale: 1 })
        const scale = Math.min(2, DOCUMENT_MAX_PDF_DIMENSION / Math.max(naturalViewport.width, naturalViewport.height))
        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.ceil(viewport.width))
        canvas.height = Math.max(1, Math.ceil(viewport.height))
        const context = canvas.getContext('2d', { alpha: false })
        if (!context) throw new Error('当前设备无法渲染 PDF 页面')
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        await page.render({ canvas, canvasContext: context, viewport }).promise
        captures.push({
          dataUrl: canvas.toDataURL('image/png'),
          filename: `${baseName}-page-${pageNumber}.png`,
        })
        canvas.width = 1
        canvas.height = 1
      } finally {
        page.cleanup()
      }
    }
    return captures
  } finally {
    await loadingTask.destroy()
  }
}

export function downloadScannedPage(page: ScannedDocumentPage) {
  const link = document.createElement('a')
  link.download = page.filename
  link.href = page.dataUrl
  link.click()
}

export async function downloadScannedPdf(pages: ScannedDocumentPage[], now = new Date()) {
  if (pages.length === 0) throw new Error('请先添加至少一页扫描图')
  const { jsPDF } = await import('jspdf')
  const first = pages[0]
  const orientation = first.width > first.height ? 'landscape' : 'portrait'
  const pdf = new jsPDF({
    orientation,
    unit: 'px',
    format: [first.width, first.height],
    compress: true,
    hotfixes: ['px_scaling'],
  })
  pages.forEach((page, index) => {
    if (index > 0) {
      pdf.addPage([page.width, page.height], page.width > page.height ? 'landscape' : 'portrait')
    }
    pdf.addImage(page.dataUrl, 'PNG', 0, 0, page.width, page.height, undefined, 'FAST')
  })
  const timestamp = now.toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z')
  pdf.save(`codex-document-${timestamp}.pdf`)
}

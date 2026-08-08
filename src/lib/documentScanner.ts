import type { CapturedDocument } from './cameraTools'

export type DocumentFilter = 'color' | 'grayscale' | 'document'

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

export interface ScannedDocumentPage {
  id: string
  sourceDataUrl: string
  dataUrl: string
  filename: string
  width: number
  height: number
  filter: DocumentFilter
  autoDetected: boolean
}

interface WorkerScanResult {
  width: number
  height: number
  pixels: ArrayBuffer
  autoDetected: boolean
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
): Promise<ScannedDocumentPage> {
  onProgress?.('正在准备本机扫描 worker')
  const image = await loadImage(capture.dataUrl)
  const result = await processImageData(imagePixels(image), filter, onProgress)
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
  return {
    id: crypto.randomUUID(),
    sourceDataUrl: capture.dataUrl,
    dataUrl: canvas.toDataURL('image/png'),
    filename: capture.filename.replace(/\.png$/i, '-processed.png'),
    width: result.width,
    height: result.height,
    filter,
    autoDetected: result.autoDetected,
  }
}

export function captureFromImageFile(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('请选择 PNG、JPEG、WebP 或 BMP 图像')
  if (file.size > 35 * 1024 * 1024) throw new Error('图像不能超过 35 MB')
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

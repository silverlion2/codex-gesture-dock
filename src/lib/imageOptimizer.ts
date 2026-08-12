export const IMAGE_OPTIMIZER_MAX_FILE_BYTES = 35 * 1024 * 1024
export const IMAGE_OPTIMIZER_MAX_SIDE = 8_192
export const IMAGE_OPTIMIZER_MAX_PIXELS = 24_000_000

export type ImageOutputFormat = 'png' | 'jpeg' | 'webp'

export interface ImageOptimizationOptions {
  format: ImageOutputFormat
  quality: number
  maxEdge: number | null
}

export interface OptimizedImage {
  blob: Blob
  filename: string
  originalWidth: number
  originalHeight: number
  width: number
  height: number
  inputBytes: number
  outputBytes: number
  format: ImageOutputFormat
  quality: number | null
}

const supportedInputTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp'])
const mimeTypes: Record<ImageOutputFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

function assertImageFile(file: File) {
  if (!supportedInputTypes.has(file.type)) throw new Error('请选择 PNG、JPEG、WebP 或 BMP 图片')
  if (file.size > IMAGE_OPTIMIZER_MAX_FILE_BYTES) throw new Error('图片不能超过 35 MB')
}

function loadFileImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    const cleanup = () => URL.revokeObjectURL(url)
    image.onload = () => {
      cleanup()
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        reject(new Error('图片尺寸无效'))
        return
      }
      resolve(image)
    }
    image.onerror = () => {
      cleanup()
      reject(new Error(`无法读取图片：${file.name}`))
    }
    image.src = url
  })
}

export function computeOptimizedDimensions(width: number, height: number, maxEdge: number | null) {
  if (![width, height].every(Number.isFinite) || width <= 0 || height <= 0) throw new Error('图片尺寸无效')
  if (maxEdge !== null && (!Number.isFinite(maxEdge) || maxEdge < 1 || maxEdge > IMAGE_OPTIMIZER_MAX_SIDE)) {
    throw new Error(`最长边必须在 1–${IMAGE_OPTIMIZER_MAX_SIDE.toLocaleString()} 像素之间`)
  }
  const requestedScale = maxEdge === null ? 1 : Math.min(1, maxEdge / Math.max(width, height))
  const sideScale = Math.min(1, IMAGE_OPTIMIZER_MAX_SIDE / Math.max(width, height))
  const pixelScale = Math.min(1, Math.sqrt(IMAGE_OPTIMIZER_MAX_PIXELS / (width * height)))
  const scale = Math.min(requestedScale, sideScale, pixelScale)
  const scaleDimension = scale < 1 ? Math.floor : Math.round
  const outputWidth = Math.max(1, scaleDimension(width * scale))
  const outputHeight = Math.max(1, scaleDimension(height * scale))
  if (outputWidth > IMAGE_OPTIMIZER_MAX_SIDE || outputHeight > IMAGE_OPTIMIZER_MAX_SIDE) {
    throw new Error(`输出最长边不能超过 ${IMAGE_OPTIMIZER_MAX_SIDE.toLocaleString()} 像素`)
  }
  return { width: outputWidth, height: outputHeight, scale }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('当前设备无法编码所选图片格式')), type, quality)
  })
}

function safeStem(filename: string) {
  const stem = filename.replace(/\.[^.]+$/, '')
  const safe = [...stem]
    .map((character) => character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '-' : character)
    .join('')
    .trim()
    .slice(0, 64)
    .replace(/[. ]+$/, '')
  if (!safe || safe === '.' || safe === '..') return 'image'
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safe) ? `${safe}-file` : safe
}

export function optimizedImageFilename(filename: string, format: ImageOutputFormat) {
  const extension = format === 'jpeg' ? 'jpg' : format
  return `${safeStem(filename)}-optimized.${extension}`
}

export async function optimizeImage(
  file: File,
  options: ImageOptimizationOptions,
  signal?: AbortSignal,
): Promise<OptimizedImage> {
  assertImageFile(file)
  if (!mimeTypes[options.format]) throw new Error('不支持的输出格式')
  if (!Number.isFinite(options.quality) || options.quality < 0.4 || options.quality > 1) {
    throw new Error('JPEG/WebP 品质必须在 40%–100% 之间')
  }
  const image = await loadFileImage(file)
  if (signal?.aborted) throw new DOMException('已取消图片优化', 'AbortError')
  const size = computeOptimizedDimensions(image.naturalWidth, image.naturalHeight, options.maxEdge)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d', { alpha: options.format !== 'jpeg' })
  if (!context) throw new Error('当前设备无法创建图片优化画布')
  if (options.format === 'jpeg') {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, size.width, size.height)
  }
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, size.width, size.height)
  const requestedType = mimeTypes[options.format]
  const blob = await canvasToBlob(canvas, requestedType, options.quality)
  if (signal?.aborted) throw new DOMException('已取消图片优化', 'AbortError')
  if (blob.type !== requestedType) throw new Error(`当前设备不支持 ${options.format.toUpperCase()} 编码，请选择其他格式`)
  return {
    blob,
    filename: optimizedImageFilename(file.name, options.format),
    originalWidth: image.naturalWidth,
    originalHeight: image.naturalHeight,
    width: size.width,
    height: size.height,
    inputBytes: file.size,
    outputBytes: blob.size,
    format: options.format,
    quality: options.format === 'png' ? null : options.quality,
  }
}

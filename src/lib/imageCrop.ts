import { computeOptimizedDimensions, type ImageOutputFormat } from './imageOptimizer'

export const IMAGE_CROP_MAX_FILE_BYTES = 35 * 1024 * 1024
export const IMAGE_CROP_MIN_SIZE = 8

export type ImageRotation = 0 | 90 | 180 | 270

export interface PreparedCropSource {
  blob: Blob
  filename: string
  originalWidth: number
  originalHeight: number
  width: number
  height: number
  rotation: ImageRotation
  scale: number
}

export interface CropRectangle {
  x: number
  y: number
  width: number
  height: number
}

export interface CroppedImage {
  blob: Blob
  filename: string
  width: number
  height: number
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
  if (file.size > IMAGE_CROP_MAX_FILE_BYTES) throw new Error('图片不能超过 35 MB')
}

function loadBlobImage(blob: Blob, filename: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob)
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
      reject(new Error(`无法读取图片：${filename}`))
    }
    image.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality = 1) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('当前设备无法编码所选图片格式')), type, quality)
  })
}

export function normalizeRotation(rotation: number): ImageRotation {
  const normalized = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360
  return normalized as ImageRotation
}

export function rotatedDimensions(width: number, height: number, rotation: ImageRotation) {
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height }
}

export function clampCropRectangle(crop: CropRectangle, width: number, height: number) {
  if (![width, height, crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error('裁剪坐标无效')
  }
  const x = Math.max(0, Math.min(width - 1, Math.floor(crop.x)))
  const y = Math.max(0, Math.min(height - 1, Math.floor(crop.y)))
  const cropWidth = Math.min(width - x, Math.max(0, Math.round(crop.width)))
  const cropHeight = Math.min(height - y, Math.max(0, Math.round(crop.height)))
  if (cropWidth < IMAGE_CROP_MIN_SIZE || cropHeight < IMAGE_CROP_MIN_SIZE) {
    throw new Error(`裁剪区域宽高不能小于 ${IMAGE_CROP_MIN_SIZE} 像素`)
  }
  return { x, y, width: cropWidth, height: cropHeight }
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

export function croppedImageFilename(filename: string, format: ImageOutputFormat) {
  return `${safeStem(filename)}-cropped.${format === 'jpeg' ? 'jpg' : format}`
}

export async function prepareCropSource(file: File, rotation: ImageRotation, signal?: AbortSignal): Promise<PreparedCropSource> {
  assertImageFile(file)
  const image = await loadBlobImage(file, file.name)
  if (signal?.aborted) throw new DOMException('已取消图片准备', 'AbortError')
  const safeSize = computeOptimizedDimensions(image.naturalWidth, image.naturalHeight, null)
  const outputSize = rotatedDimensions(safeSize.width, safeSize.height, rotation)
  const canvas = document.createElement('canvas')
  canvas.width = outputSize.width
  canvas.height = outputSize.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前设备无法创建裁剪画布')
  context.translate(outputSize.width / 2, outputSize.height / 2)
  context.rotate(rotation * Math.PI / 180)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, -safeSize.width / 2, -safeSize.height / 2, safeSize.width, safeSize.height)
  const blob = await canvasToBlob(canvas, 'image/png')
  if (signal?.aborted) throw new DOMException('已取消图片准备', 'AbortError')
  return {
    blob,
    filename: file.name,
    originalWidth: image.naturalWidth,
    originalHeight: image.naturalHeight,
    width: outputSize.width,
    height: outputSize.height,
    rotation,
    scale: safeSize.scale,
  }
}

export async function renderCroppedImage(
  source: PreparedCropSource,
  crop: CropRectangle,
  format: ImageOutputFormat,
  quality: number,
  signal?: AbortSignal,
): Promise<CroppedImage> {
  if (!mimeTypes[format]) throw new Error('不支持的输出格式')
  if (!Number.isFinite(quality) || quality < 0.4 || quality > 1) throw new Error('JPEG/WebP 品质必须在 40%–100% 之间')
  const boundedCrop = clampCropRectangle(crop, source.width, source.height)
  const image = await loadBlobImage(source.blob, source.filename)
  if (signal?.aborted) throw new DOMException('已取消裁剪导出', 'AbortError')
  const canvas = document.createElement('canvas')
  canvas.width = boundedCrop.width
  canvas.height = boundedCrop.height
  const context = canvas.getContext('2d', { alpha: format !== 'jpeg' })
  if (!context) throw new Error('当前设备无法创建裁剪画布')
  if (format === 'jpeg') {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
  }
  context.drawImage(
    image,
    boundedCrop.x,
    boundedCrop.y,
    boundedCrop.width,
    boundedCrop.height,
    0,
    0,
    boundedCrop.width,
    boundedCrop.height,
  )
  const requestedType = mimeTypes[format]
  const blob = await canvasToBlob(canvas, requestedType, quality)
  if (signal?.aborted) throw new DOMException('已取消裁剪导出', 'AbortError')
  if (blob.type !== requestedType) throw new Error(`当前设备不支持 ${format.toUpperCase()} 编码，请选择其他格式`)
  return {
    blob,
    filename: croppedImageFilename(source.filename, format),
    width: boundedCrop.width,
    height: boundedCrop.height,
    format,
    quality: format === 'png' ? null : quality,
  }
}


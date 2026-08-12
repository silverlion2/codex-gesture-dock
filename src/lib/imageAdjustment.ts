import type { ImageOutputFormat } from './imageOptimizer'

export const IMAGE_ADJUSTMENT_MAX_FILE_BYTES = 35 * 1024 * 1024
export const IMAGE_ADJUSTMENT_MAX_SOURCE_PIXELS = 80_000_000
export const IMAGE_ADJUSTMENT_PREVIEW_MAX_SIDE = 1_600
export const IMAGE_ADJUSTMENT_PREVIEW_MAX_PIXELS = 2_400_000
export const IMAGE_ADJUSTMENT_OUTPUT_MAX_SIDE = 8_192
export const IMAGE_ADJUSTMENT_OUTPUT_MAX_PIXELS = 24_000_000

export interface ImageAdjustments {
  exposure: number
  contrast: number
  saturation: number
  temperature: number
  grayscale: number
}

export interface ImageAdjustmentDimensions {
  width: number
  height: number
  scale: number
}

export interface PreparedImageAdjustmentSource {
  file: File
  filename: string
  originalWidth: number
  originalHeight: number
  previewWidth: number
  previewHeight: number
  previewScale: number
  outputWidth: number
  outputHeight: number
  outputScale: number
  previewPixels: Uint8ClampedArray
  originalPreviewBlob: Blob
}

export interface RenderedImageAdjustmentPreview {
  blob: Blob
  width: number
  height: number
  settings: ImageAdjustments
}

export interface ExportedAdjustedImage {
  blob: Blob
  filename: string
  width: number
  height: number
  format: ImageOutputFormat
  quality: number | null
  settings: ImageAdjustments
}

export type ImageAdjustmentPresetKey = 'neutral' | 'vivid' | 'warm' | 'cool' | 'mono' | 'faded'

export const neutralImageAdjustments: ImageAdjustments = {
  exposure: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  grayscale: 0,
}

export const imageAdjustmentPresets: Record<ImageAdjustmentPresetKey, ImageAdjustments> = {
  neutral: neutralImageAdjustments,
  vivid: { exposure: 0.1, contrast: 12, saturation: 24, temperature: 4, grayscale: 0 },
  warm: { exposure: 0.05, contrast: 5, saturation: 10, temperature: 22, grayscale: 0 },
  cool: { exposure: 0, contrast: 7, saturation: 6, temperature: -22, grayscale: 0 },
  mono: { exposure: 0, contrast: 14, saturation: 0, temperature: 0, grayscale: 100 },
  faded: { exposure: 0.12, contrast: -18, saturation: -22, temperature: 7, grayscale: 0 },
}

const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp'])
const mimeTypes: Record<ImageOutputFormat, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }

interface AdjustmentFactors {
  exposure: number
  contrast: number
  saturation: number
  temperature: number
  grayscale: number
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('已取消图片调整', 'AbortError')
}

export function validateImageAdjustmentFile(file: File) {
  if (!supportedTypes.has(file.type)) throw new Error('请选择 PNG、JPEG、WebP 或 BMP 图片')
  if (file.size > IMAGE_ADJUSTMENT_MAX_FILE_BYTES) throw new Error('图片不能超过 35 MB')
}

export function assertImageAdjustments(settings: ImageAdjustments) {
  if (!Number.isFinite(settings.exposure) || settings.exposure < -2 || settings.exposure > 2) throw new Error('曝光必须在 -2.0 EV–+2.0 EV 之间')
  for (const [label, value] of [['对比度', settings.contrast], ['饱和度', settings.saturation], ['色温', settings.temperature]] as const) {
    if (!Number.isFinite(value) || value < -100 || value > 100) throw new Error(`${label}必须在 -100–+100 之间`)
  }
  if (!Number.isFinite(settings.grayscale) || settings.grayscale < 0 || settings.grayscale > 100) throw new Error('黑白必须在 0%–100% 之间')
}

export function isNeutralImageAdjustment(settings: ImageAdjustments) {
  assertImageAdjustments(settings)
  return settings.exposure === 0 && settings.contrast === 0 && settings.saturation === 0 && settings.temperature === 0 && settings.grayscale === 0
}

export function computeImageAdjustmentDimensions(
  width: number,
  height: number,
  maxSide: number,
  maxPixels: number,
): ImageAdjustmentDimensions {
  if (![width, height, maxSide, maxPixels].every((value) => Number.isFinite(value) && value > 0)) throw new Error('图片尺寸或安全预算无效')
  if (width * height > IMAGE_ADJUSTMENT_MAX_SOURCE_PIXELS) throw new Error('图片解码后超过 8000 万像素安全上限')
  const scale = Math.min(1, maxSide / Math.max(width, height), Math.sqrt(maxPixels / (width * height)))
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)), scale }
}

function adjustmentFactors(settings: ImageAdjustments): AdjustmentFactors {
  assertImageAdjustments(settings)
  const contrast255 = settings.contrast * 2.55
  return {
    exposure: 2 ** settings.exposure,
    contrast: (259 * (contrast255 + 255)) / (255 * (259 - contrast255)),
    saturation: 1 + settings.saturation / 100,
    temperature: settings.temperature * 0.72,
    grayscale: settings.grayscale / 100,
  }
}

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, value))
}

function processPixelRange(data: Uint8ClampedArray, start: number, end: number, factors: AdjustmentFactors) {
  for (let index = start; index < end; index += 4) {
    let red = data[index] * factors.exposure
    let green = data[index + 1] * factors.exposure
    let blue = data[index + 2] * factors.exposure

    red = factors.contrast * (red - 128) + 128 + factors.temperature
    green = factors.contrast * (green - 128) + 128
    blue = factors.contrast * (blue - 128) + 128 - factors.temperature

    const saturationLuminance = red * 0.2126 + green * 0.7152 + blue * 0.0722
    red = saturationLuminance + (red - saturationLuminance) * factors.saturation
    green = saturationLuminance + (green - saturationLuminance) * factors.saturation
    blue = saturationLuminance + (blue - saturationLuminance) * factors.saturation

    if (factors.grayscale > 0) {
      const grayscaleLuminance = red * 0.2126 + green * 0.7152 + blue * 0.0722
      red += (grayscaleLuminance - red) * factors.grayscale
      green += (grayscaleLuminance - green) * factors.grayscale
      blue += (grayscaleLuminance - blue) * factors.grayscale
    }

    data[index] = clampChannel(red)
    data[index + 1] = clampChannel(green)
    data[index + 2] = clampChannel(blue)
  }
}

export function adjustImagePixels(source: Uint8ClampedArray, settings: ImageAdjustments) {
  if (source.length % 4 !== 0) throw new Error('RGBA 像素数据长度无效')
  const result = new Uint8ClampedArray(source)
  processPixelRange(result, 0, result.length, adjustmentFactors(settings))
  return result
}

async function adjustImagePixelsCooperatively(source: Uint8ClampedArray, settings: ImageAdjustments, signal?: AbortSignal) {
  const result = new Uint8ClampedArray(source)
  const factors = adjustmentFactors(settings)
  const chunkLength = 200_000 * 4
  for (let start = 0; start < result.length; start += chunkLength) {
    throwIfAborted(signal)
    processPixelRange(result, start, Math.min(result.length, start + chunkLength), factors)
    if (start + chunkLength < result.length) await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
  throwIfAborted(signal)
  return result
}

function loadFileImage(file: File, signal?: AbortSignal) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    throwIfAborted(signal)
    const url = URL.createObjectURL(file)
    const image = new Image()
    const cleanup = () => {
      URL.revokeObjectURL(url)
      signal?.removeEventListener('abort', handleAbort)
    }
    const handleAbort = () => {
      cleanup()
      image.src = ''
      reject(new DOMException('已取消图片调整', 'AbortError'))
    }
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
    signal?.addEventListener('abort', handleAbort, { once: true })
    image.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number, signal?: AbortSignal) {
  return new Promise<Blob>((resolve, reject) => {
    throwIfAborted(signal)
    canvas.toBlob((blob) => {
      try {
        throwIfAborted(signal)
        if (!blob || blob.type !== type) throw new Error(`当前设备无法生成 ${type.replace('image/', '').toUpperCase()} 图片`)
        resolve(blob)
      } catch (caught) {
        reject(caught)
      }
    }, type, quality)
  })
}

function drawImageToCanvas(image: HTMLImageElement, dimensions: ImageAdjustmentDimensions) {
  const canvas = document.createElement('canvas')
  canvas.width = dimensions.width
  canvas.height = dimensions.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前设备无法创建图片调整画布')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, dimensions.width, dimensions.height)
  return { canvas, context }
}

function safeStem(filename: string) {
  const stem = filename.replace(/\.[^.]+$/, '')
  const safe = [...stem]
    .map((character) => character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '-' : character)
    .join('')
    .trim()
    .slice(0, 56)
    .replace(/[. ]+$/, '')
  if (!safe || safe === '.' || safe === '..') return 'image'
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safe) ? `${safe}-file` : safe
}

export function adjustedImageFilename(filename: string, format: ImageOutputFormat) {
  return `${safeStem(filename)}-adjusted.${format === 'jpeg' ? 'jpg' : format}`
}

export async function prepareImageAdjustmentSource(file: File, signal?: AbortSignal): Promise<PreparedImageAdjustmentSource> {
  validateImageAdjustmentFile(file)
  const image = await loadFileImage(file, signal)
  const preview = computeImageAdjustmentDimensions(image.naturalWidth, image.naturalHeight, IMAGE_ADJUSTMENT_PREVIEW_MAX_SIDE, IMAGE_ADJUSTMENT_PREVIEW_MAX_PIXELS)
  const output = computeImageAdjustmentDimensions(image.naturalWidth, image.naturalHeight, IMAGE_ADJUSTMENT_OUTPUT_MAX_SIDE, IMAGE_ADJUSTMENT_OUTPUT_MAX_PIXELS)
  const { canvas, context } = drawImageToCanvas(image, preview)
  const previewPixels = new Uint8ClampedArray(context.getImageData(0, 0, preview.width, preview.height).data)
  const originalPreviewBlob = await canvasToBlob(canvas, 'image/png', 1, signal)
  return {
    file,
    filename: file.name,
    originalWidth: image.naturalWidth,
    originalHeight: image.naturalHeight,
    previewWidth: preview.width,
    previewHeight: preview.height,
    previewScale: preview.scale,
    outputWidth: output.width,
    outputHeight: output.height,
    outputScale: output.scale,
    previewPixels,
    originalPreviewBlob,
  }
}

export async function renderImageAdjustmentPreview(
  source: PreparedImageAdjustmentSource,
  settings: ImageAdjustments,
  signal?: AbortSignal,
): Promise<RenderedImageAdjustmentPreview> {
  const pixels = await adjustImagePixelsCooperatively(source.previewPixels, settings, signal)
  const canvas = document.createElement('canvas')
  canvas.width = source.previewWidth
  canvas.height = source.previewHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前设备无法创建图片调整预览')
  context.putImageData(new ImageData(pixels, source.previewWidth, source.previewHeight), 0, 0)
  const blob = await canvasToBlob(canvas, 'image/png', 1, signal)
  return { blob, width: source.previewWidth, height: source.previewHeight, settings: { ...settings } }
}

export async function exportAdjustedImage(
  source: PreparedImageAdjustmentSource,
  settings: ImageAdjustments,
  format: ImageOutputFormat,
  quality: number,
  signal?: AbortSignal,
): Promise<ExportedAdjustedImage> {
  if (!mimeTypes[format]) throw new Error('不支持的图片输出格式')
  if (!Number.isFinite(quality) || quality < 0.4 || quality > 1) throw new Error('JPEG/WebP 质量必须在 40%–100% 之间')
  const image = await loadFileImage(source.file, signal)
  const dimensions = { width: source.outputWidth, height: source.outputHeight, scale: source.outputScale }
  const { canvas, context } = drawImageToCanvas(image, dimensions)
  const sourcePixels = context.getImageData(0, 0, canvas.width, canvas.height)
  const adjusted = await adjustImagePixelsCooperatively(sourcePixels.data, settings, signal)
  context.putImageData(new ImageData(adjusted, canvas.width, canvas.height), 0, 0)

  let outputCanvas = canvas
  if (format === 'jpeg') {
    outputCanvas = document.createElement('canvas')
    outputCanvas.width = canvas.width
    outputCanvas.height = canvas.height
    const outputContext = outputCanvas.getContext('2d', { alpha: false })
    if (!outputContext) throw new Error('当前设备无法创建 JPEG 输出画布')
    outputContext.fillStyle = '#FFFFFF'
    outputContext.fillRect(0, 0, outputCanvas.width, outputCanvas.height)
    outputContext.drawImage(canvas, 0, 0)
  }

  const requestedType = mimeTypes[format]
  const blob = await canvasToBlob(outputCanvas, requestedType, quality, signal)
  return {
    blob,
    filename: adjustedImageFilename(source.filename, format),
    width: outputCanvas.width,
    height: outputCanvas.height,
    format,
    quality: format === 'png' ? null : quality,
    settings: { ...settings },
  }
}

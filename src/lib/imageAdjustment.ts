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
  hue: number
  sharpness: number
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
  hue: 0,
  sharpness: 0,
  grayscale: 0,
}

export const imageAdjustmentPresets: Record<ImageAdjustmentPresetKey, ImageAdjustments> = {
  neutral: neutralImageAdjustments,
  vivid: { exposure: 0.1, contrast: 12, saturation: 24, temperature: 4, hue: 0, sharpness: 18, grayscale: 0 },
  warm: { exposure: 0.05, contrast: 5, saturation: 10, temperature: 22, hue: 0, sharpness: 4, grayscale: 0 },
  cool: { exposure: 0, contrast: 7, saturation: 6, temperature: -22, hue: 0, sharpness: 6, grayscale: 0 },
  mono: { exposure: 0, contrast: 14, saturation: 0, temperature: 0, hue: 0, sharpness: 12, grayscale: 100 },
  faded: { exposure: 0.12, contrast: -18, saturation: -22, temperature: 7, hue: 0, sharpness: 0, grayscale: 0 },
}

const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp'])
const mimeTypes: Record<ImageOutputFormat, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }

interface AdjustmentFactors {
  exposure: number
  contrast: number
  saturation: number
  temperature: number
  hueCos: number
  hueSin: number
  sharpness: number
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
  if (!Number.isFinite(settings.hue) || settings.hue < -180 || settings.hue > 180) throw new Error('色相必须在 -180°–180° 之间')
  if (!Number.isFinite(settings.sharpness) || settings.sharpness < 0 || settings.sharpness > 100) throw new Error('锐化必须在 0%–100% 之间')
  if (!Number.isFinite(settings.grayscale) || settings.grayscale < 0 || settings.grayscale > 100) throw new Error('黑白必须在 0%–100% 之间')
}

export function isNeutralImageAdjustment(settings: ImageAdjustments) {
  assertImageAdjustments(settings)
  return settings.exposure === 0 && settings.contrast === 0 && settings.saturation === 0 && settings.temperature === 0 && settings.hue === 0 && settings.sharpness === 0 && settings.grayscale === 0
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
  const hueRadians = settings.hue * Math.PI / 180
  return {
    exposure: 2 ** settings.exposure,
    contrast: (259 * (contrast255 + 255)) / (255 * (259 - contrast255)),
    saturation: 1 + settings.saturation / 100,
    temperature: settings.temperature * 0.72,
    hueCos: Math.cos(hueRadians),
    hueSin: Math.sin(hueRadians),
    sharpness: settings.sharpness / 100 * 0.3,
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

    if (factors.hueSin !== 0 || factors.hueCos !== 1) {
      const sourceRed = red
      const sourceGreen = green
      const sourceBlue = blue
      red = (0.213 + factors.hueCos * 0.787 - factors.hueSin * 0.213) * sourceRed
        + (0.715 - factors.hueCos * 0.715 - factors.hueSin * 0.715) * sourceGreen
        + (0.072 - factors.hueCos * 0.072 + factors.hueSin * 0.928) * sourceBlue
      green = (0.213 - factors.hueCos * 0.213 + factors.hueSin * 0.143) * sourceRed
        + (0.715 + factors.hueCos * 0.285 + factors.hueSin * 0.140) * sourceGreen
        + (0.072 - factors.hueCos * 0.072 - factors.hueSin * 0.283) * sourceBlue
      blue = (0.213 - factors.hueCos * 0.213 - factors.hueSin * 0.787) * sourceRed
        + (0.715 - factors.hueCos * 0.715 + factors.hueSin * 0.715) * sourceGreen
        + (0.072 + factors.hueCos * 0.928 + factors.hueSin * 0.072) * sourceBlue
    }

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

function sharpenRow(
  pixels: Uint8ClampedArray,
  previousRow: Uint8ClampedArray,
  currentRow: Uint8ClampedArray,
  width: number,
  y: number,
  amount: number,
) {
  const rowOffset = y * width * 4
  for (let x = 1; x < width - 1; x += 1) {
    const rowIndex = x * 4
    const index = rowOffset + rowIndex
    for (let channel = 0; channel < 3; channel += 1) {
      const center = currentRow[rowIndex + channel]
      pixels[index + channel] = clampChannel(
        center * (1 + amount * 4)
        - amount * (
          currentRow[rowIndex - 4 + channel]
          + currentRow[rowIndex + 4 + channel]
          + previousRow[rowIndex + channel]
          + pixels[index + width * 4 + channel]
        ),
      )
    }
  }
}

function sharpenPixelsInPlace(source: Uint8ClampedArray, width: number, height: number, amount: number) {
  if (amount <= 0 || width < 3 || height < 3) return source
  let previousRow = source.slice(0, width * 4)
  for (let y = 1; y < height - 1; y += 1) {
    const currentRow = source.slice(y * width * 4, (y + 1) * width * 4)
    sharpenRow(source, previousRow, currentRow, width, y, amount)
    previousRow = currentRow
  }
  return source
}

function assertPixelDimensions(source: Uint8ClampedArray, width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width * height * 4 !== source.length) {
    throw new Error('RGBA 像素尺寸无效')
  }
}

export function adjustImagePixels(source: Uint8ClampedArray, settings: ImageAdjustments, width = source.length / 4, height = 1) {
  if (source.length % 4 !== 0) throw new Error('RGBA 像素数据长度无效')
  assertPixelDimensions(source, width, height)
  const result = new Uint8ClampedArray(source)
  const factors = adjustmentFactors(settings)
  processPixelRange(result, 0, result.length, factors)
  return sharpenPixelsInPlace(result, width, height, factors.sharpness)
}

async function adjustImagePixelsCooperatively(source: Uint8ClampedArray, settings: ImageAdjustments, width: number, height: number, signal?: AbortSignal) {
  assertPixelDimensions(source, width, height)
  const result = new Uint8ClampedArray(source)
  const factors = adjustmentFactors(settings)
  const chunkLength = 200_000 * 4
  for (let start = 0; start < result.length; start += chunkLength) {
    throwIfAborted(signal)
    processPixelRange(result, start, Math.min(result.length, start + chunkLength), factors)
    if (start + chunkLength < result.length) await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
  throwIfAborted(signal)
  if (factors.sharpness <= 0 || width < 3 || height < 3) return result
  const rowsPerChunk = 32
  let previousRow = result.slice(0, width * 4)
  for (let rowStart = 1; rowStart < height - 1; rowStart += rowsPerChunk) {
    throwIfAborted(signal)
    const rowEnd = Math.min(height - 1, rowStart + rowsPerChunk)
    for (let y = rowStart; y < rowEnd; y += 1) {
      const currentRow = result.slice(y * width * 4, (y + 1) * width * 4)
      sharpenRow(result, previousRow, currentRow, width, y, factors.sharpness)
      previousRow = currentRow
    }
    if (rowEnd < height - 1) await new Promise<void>((resolve) => setTimeout(resolve, 0))
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
  const pixels = await adjustImagePixelsCooperatively(source.previewPixels, settings, source.previewWidth, source.previewHeight, signal)
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
  const adjusted = await adjustImagePixelsCooperatively(sourcePixels.data, settings, canvas.width, canvas.height, signal)
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

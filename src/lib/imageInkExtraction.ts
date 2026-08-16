export const INK_EXTRACTION_MAX_FILE_BYTES = 35 * 1024 * 1024
export const INK_EXTRACTION_MAX_SOURCE_PIXELS = 80_000_000
export const INK_EXTRACTION_PREVIEW_MAX_SIDE = 1_600
export const INK_EXTRACTION_PREVIEW_MAX_PIXELS = 2_400_000
export const INK_EXTRACTION_OUTPUT_MAX_SIDE = 8_192
export const INK_EXTRACTION_OUTPUT_MAX_PIXELS = 24_000_000

export type InkBackground = 'light' | 'dark'
export type InkColorMode = 'original' | 'solid'

export interface InkExtractionSettings {
  background: InkBackground
  threshold: number
  feather: number
  colorMode: InkColorMode
  color: string
  trim: boolean
  padding: number
}

export interface PreparedInkExtractionSource {
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

export interface InkExtractionResult {
  pixels: Uint8ClampedArray
  width: number
  height: number
  retainedPixels: number
  coverage: number
  sourceBounds: { x: number; y: number; width: number; height: number }
}

export interface RenderedInkExtraction {
  blob: Blob
  width: number
  height: number
  retainedPixels: number
  coverage: number
  sourceBounds: InkExtractionResult['sourceBounds']
  settings: InkExtractionSettings
}

export interface ExportedInkExtraction extends RenderedInkExtraction {
  filename: string
}

export const defaultInkExtractionSettings: InkExtractionSettings = {
  background: 'light',
  threshold: 220,
  feather: 24,
  colorMode: 'solid',
  color: '#111111',
  trim: true,
  padding: 16,
}

const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp'])

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('已取消线稿抠图', 'AbortError')
}

export function validateInkExtractionFile(file: File) {
  if (!supportedTypes.has(file.type.toLowerCase())) throw new Error('请选择 PNG、JPEG、WebP 或 BMP 图片')
  if (file.size > INK_EXTRACTION_MAX_FILE_BYTES) throw new Error('图片不能超过 35 MB')
}

export function assertInkExtractionSettings(settings: InkExtractionSettings) {
  if (!['light', 'dark'].includes(settings.background)) throw new Error('纸张背景模式无效')
  if (!Number.isInteger(settings.threshold) || settings.threshold < 0 || settings.threshold > 255) throw new Error('亮度阈值必须在 0–255 之间')
  if (!Number.isInteger(settings.feather) || settings.feather < 0 || settings.feather > 64) throw new Error('边缘柔化必须在 0–64 之间')
  if (!['original', 'solid'].includes(settings.colorMode)) throw new Error('线条颜色模式无效')
  if (!/^#[\da-f]{6}$/i.test(settings.color)) throw new Error('线条颜色必须是六位 HEX')
  if (typeof settings.trim !== 'boolean') throw new Error('透明裁边设置无效')
  if (!Number.isInteger(settings.padding) || settings.padding < 0 || settings.padding > 128) throw new Error('透明留边必须在 0–128px 之间')
}

export function computeInkExtractionDimensions(width: number, height: number, maxSide: number, maxPixels: number) {
  if (![width, height, maxSide, maxPixels].every((value) => Number.isFinite(value) && value > 0)) throw new Error('图片尺寸或安全预算无效')
  if (width * height > INK_EXTRACTION_MAX_SOURCE_PIXELS) throw new Error('图片解码后超过 8000 万像素安全上限')
  const scale = Math.min(1, maxSide / Math.max(width, height), Math.sqrt(maxPixels / (width * height)))
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)), scale }
}

function parseHex(value: string) {
  const integer = Number.parseInt(value.slice(1), 16)
  return { red: integer >> 16, green: (integer >> 8) & 255, blue: integer & 255 }
}

function maskAlpha(luminance: number, settings: InkExtractionSettings) {
  if (settings.feather === 0) {
    return settings.background === 'light'
      ? (luminance < settings.threshold ? 255 : 0)
      : (luminance > settings.threshold ? 255 : 0)
  }
  const distance = settings.background === 'light'
    ? settings.threshold - luminance
    : luminance - settings.threshold
  return Math.max(0, Math.min(255, Math.round(distance / settings.feather * 255)))
}

interface InkAccumulator {
  retainedPixels: number
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function processInkRange(
  result: Uint8ClampedArray,
  width: number,
  start: number,
  end: number,
  settings: InkExtractionSettings,
  solid: ReturnType<typeof parseHex>,
  accumulator: InkAccumulator,
) {
  for (let offset = start; offset < end; offset += 4) {
    const red = result[offset]
    const green = result[offset + 1]
    const blue = result[offset + 2]
    const sourceAlpha = result[offset + 3]
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722
    const alpha = Math.round(maskAlpha(luminance, settings) * sourceAlpha / 255)
    result[offset + 3] = alpha <= 4 ? 0 : alpha
    if (alpha <= 4) {
      // Canonicalize fully transparent pixels so an exported PNG cannot retain
      // visually hidden RGB data from the discarded background.
      result[offset] = 0
      result[offset + 1] = 0
      result[offset + 2] = 0
      continue
    }
    if (settings.colorMode === 'solid') {
      result[offset] = solid.red
      result[offset + 1] = solid.green
      result[offset + 2] = solid.blue
    }
    const pixel = offset / 4
    const x = pixel % width
    const y = Math.floor(pixel / width)
    accumulator.retainedPixels += 1
    accumulator.minX = Math.min(accumulator.minX, x)
    accumulator.minY = Math.min(accumulator.minY, y)
    accumulator.maxX = Math.max(accumulator.maxX, x)
    accumulator.maxY = Math.max(accumulator.maxY, y)
  }
}

function assertPixels(source: Uint8ClampedArray, width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || source.length !== width * height * 4) {
    throw new Error('线稿抠图 RGBA 像素尺寸无效')
  }
}

function newAccumulator(width: number, height: number): InkAccumulator {
  return { retainedPixels: 0, minX: width, minY: height, maxX: -1, maxY: -1 }
}

function cropResult(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  accumulator: InkAccumulator,
  settings: InkExtractionSettings,
): InkExtractionResult {
  if (accumulator.retainedPixels === 0 || accumulator.maxX < 0 || accumulator.maxY < 0) throw new Error('当前设置没有保留任何线条，请调整背景模式或亮度阈值')
  const sourceBounds = {
    x: accumulator.minX,
    y: accumulator.minY,
    width: accumulator.maxX - accumulator.minX + 1,
    height: accumulator.maxY - accumulator.minY + 1,
  }
  if (!settings.trim) {
    return { pixels, width, height, retainedPixels: accumulator.retainedPixels, coverage: accumulator.retainedPixels / (width * height), sourceBounds }
  }
  const left = Math.max(0, accumulator.minX - settings.padding)
  const top = Math.max(0, accumulator.minY - settings.padding)
  const right = Math.min(width - 1, accumulator.maxX + settings.padding)
  const bottom = Math.min(height - 1, accumulator.maxY + settings.padding)
  const outputWidth = right - left + 1
  const outputHeight = bottom - top + 1
  const cropped = new Uint8ClampedArray(outputWidth * outputHeight * 4)
  for (let y = 0; y < outputHeight; y += 1) {
    const sourceStart = ((top + y) * width + left) * 4
    cropped.set(pixels.subarray(sourceStart, sourceStart + outputWidth * 4), y * outputWidth * 4)
  }
  return { pixels: cropped, width: outputWidth, height: outputHeight, retainedPixels: accumulator.retainedPixels, coverage: accumulator.retainedPixels / (width * height), sourceBounds }
}

export function extractInkPixels(source: Uint8ClampedArray, width: number, height: number, settings: InkExtractionSettings): InkExtractionResult {
  assertPixels(source, width, height)
  assertInkExtractionSettings(settings)
  const result = new Uint8ClampedArray(source)
  const accumulator = newAccumulator(width, height)
  processInkRange(result, width, 0, result.length, settings, parseHex(settings.color), accumulator)
  return cropResult(result, width, height, accumulator, settings)
}

async function extractInkPixelsCooperatively(source: Uint8ClampedArray, width: number, height: number, settings: InkExtractionSettings, signal?: AbortSignal) {
  assertPixels(source, width, height)
  assertInkExtractionSettings(settings)
  const result = new Uint8ClampedArray(source)
  const accumulator = newAccumulator(width, height)
  const solid = parseHex(settings.color)
  const chunkLength = 200_000 * 4
  for (let start = 0; start < result.length; start += chunkLength) {
    throwIfAborted(signal)
    processInkRange(result, width, start, Math.min(result.length, start + chunkLength), settings, solid, accumulator)
    if (start + chunkLength < result.length) await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
  throwIfAborted(signal)
  return cropResult(result, width, height, accumulator, settings)
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
      reject(new DOMException('已取消线稿抠图', 'AbortError'))
    }
    image.onload = () => {
      cleanup()
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) reject(new Error('图片尺寸无效'))
      else resolve(image)
    }
    image.onerror = () => {
      cleanup()
      reject(new Error(`无法读取图片：${file.name}`))
    }
    signal?.addEventListener('abort', handleAbort, { once: true })
    image.src = url
  })
}

function drawImage(image: HTMLImageElement, width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('当前设备无法创建线稿抠图画布')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, width, height)
  return { canvas, context }
}

function pixelsToPng(result: InkExtractionResult, signal?: AbortSignal) {
  const canvas = document.createElement('canvas')
  canvas.width = result.width
  canvas.height = result.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前设备无法创建透明 PNG 画布')
  context.putImageData(new ImageData(result.pixels, result.width, result.height), 0, 0)
  return new Promise<Blob>((resolve, reject) => {
    throwIfAborted(signal)
    canvas.toBlob((blob) => {
      try {
        throwIfAborted(signal)
        if (!blob || blob.type !== 'image/png') throw new Error('当前设备无法生成透明 PNG')
        resolve(blob)
      } catch (caught) {
        reject(caught)
      }
    }, 'image/png')
  })
}

function safeStem(filename: string) {
  const stem = filename.replace(/\.[^.]+$/, '')
  const safe = [...stem].map((character) => character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '-' : character).join('').trim().slice(0, 56).replace(/[. ]+$/, '')
  if (!safe || safe === '.' || safe === '..') return 'image'
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safe) ? `${safe}-file` : safe
}

export function inkExtractionFilename(filename: string) {
  return `${safeStem(filename)}-ink.png`
}

export async function prepareInkExtractionSource(file: File, signal?: AbortSignal): Promise<PreparedInkExtractionSource> {
  validateInkExtractionFile(file)
  const image = await loadFileImage(file, signal)
  const preview = computeInkExtractionDimensions(image.naturalWidth, image.naturalHeight, INK_EXTRACTION_PREVIEW_MAX_SIDE, INK_EXTRACTION_PREVIEW_MAX_PIXELS)
  const output = computeInkExtractionDimensions(image.naturalWidth, image.naturalHeight, INK_EXTRACTION_OUTPUT_MAX_SIDE, INK_EXTRACTION_OUTPUT_MAX_PIXELS)
  const { canvas, context } = drawImage(image, preview.width, preview.height)
  const previewPixels = new Uint8ClampedArray(context.getImageData(0, 0, preview.width, preview.height).data)
  const originalPreviewBlob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('无法生成原图预览')), 'image/png'))
  throwIfAborted(signal)
  return { file, filename: file.name, originalWidth: image.naturalWidth, originalHeight: image.naturalHeight, previewWidth: preview.width, previewHeight: preview.height, previewScale: preview.scale, outputWidth: output.width, outputHeight: output.height, outputScale: output.scale, previewPixels, originalPreviewBlob }
}

export async function renderInkExtractionPreview(source: PreparedInkExtractionSource, settings: InkExtractionSettings, signal?: AbortSignal): Promise<RenderedInkExtraction> {
  const result = await extractInkPixelsCooperatively(source.previewPixels, source.previewWidth, source.previewHeight, settings, signal)
  const blob = await pixelsToPng(result, signal)
  return { blob, width: result.width, height: result.height, retainedPixels: result.retainedPixels, coverage: result.coverage, sourceBounds: result.sourceBounds, settings: { ...settings } }
}

export async function exportInkExtraction(source: PreparedInkExtractionSource, settings: InkExtractionSettings, signal?: AbortSignal): Promise<ExportedInkExtraction> {
  const image = await loadFileImage(source.file, signal)
  const { canvas, context } = drawImage(image, source.outputWidth, source.outputHeight)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  const result = await extractInkPixelsCooperatively(pixels, canvas.width, canvas.height, settings, signal)
  const blob = await pixelsToPng(result, signal)
  return { blob, filename: inkExtractionFilename(source.filename), width: result.width, height: result.height, retainedPixels: result.retainedPixels, coverage: result.coverage, sourceBounds: result.sourceBounds, settings: { ...settings } }
}

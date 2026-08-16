export const COLOR_KEY_MAX_FILE_BYTES = 35 * 1024 * 1024
export const COLOR_KEY_MAX_SOURCE_PIXELS = 80_000_000
export const COLOR_KEY_PREVIEW_MAX_SIDE = 1_600
export const COLOR_KEY_PREVIEW_MAX_PIXELS = 2_400_000
export const COLOR_KEY_OUTPUT_MAX_SIDE = 8_192
export const COLOR_KEY_OUTPUT_MAX_PIXELS = 24_000_000

export interface ColorKeySettings {
  keyColor: string
  tolerance: number
  feather: number
  despill: number
}

export interface PreparedColorKeySource {
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

export interface ColorKeyResult {
  pixels: Uint8ClampedArray
  width: number
  height: number
  visibleSourcePixels: number
  removedPixels: number
  partialPixels: number
  despilledPixels: number
  remainingPixels: number
  removedCoverage: number
}

export interface RenderedColorKey extends Omit<ColorKeyResult, 'pixels'> {
  blob: Blob
  settings: ColorKeySettings
}

export interface ExportedColorKey extends RenderedColorKey {
  filename: string
}

export const defaultColorKeySettings: ColorKeySettings = {
  keyColor: '#00FF00',
  tolerance: 12,
  feather: 8,
  despill: 0,
}

const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp'])

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('已取消色彩抠图', 'AbortError')
}

export function validateColorKeyFile(file: File) {
  if (!supportedTypes.has(file.type.toLowerCase())) throw new Error('请选择 PNG、JPEG、WebP 或 BMP 图片')
  if (file.size > COLOR_KEY_MAX_FILE_BYTES) throw new Error('图片不能超过 35 MB')
}

export function assertColorKeySettings(settings: ColorKeySettings) {
  if (!/^#[\da-f]{6}$/i.test(settings.keyColor)) throw new Error('目标颜色必须是六位 HEX')
  if (!Number.isInteger(settings.tolerance) || settings.tolerance < 0 || settings.tolerance > 100) throw new Error('颜色容差必须在 0–100 之间')
  if (!Number.isInteger(settings.feather) || settings.feather < 0 || settings.feather > 100) throw new Error('边缘柔化必须在 0–100 之间')
  if (!Number.isInteger(settings.despill) || settings.despill < 0 || settings.despill > 100) throw new Error('溢色中和必须在 0–100 之间')
}

export function computeColorKeyDimensions(width: number, height: number, maxSide: number, maxPixels: number) {
  if (![width, height, maxSide, maxPixels].every((value) => Number.isFinite(value) && value > 0)) throw new Error('图片尺寸或安全预算无效')
  if (width * height > COLOR_KEY_MAX_SOURCE_PIXELS) throw new Error('图片解码后超过 8000 万像素安全上限')
  const scale = Math.min(1, maxSide / Math.max(width, height), Math.sqrt(maxPixels / (width * height)))
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)), scale }
}

function parseHex(value: string) {
  const integer = Number.parseInt(value.slice(1), 16)
  return { red: integer >> 16, green: (integer >> 8) & 255, blue: integer & 255 }
}

function colorHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

function linearChannel(channel: number) {
  const value = Math.max(0, Math.min(255, channel)) / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

export function rgbToOklab(red: number, green: number, blue: number) {
  const r = linearChannel(red)
  const g = linearChannel(green)
  const b = linearChannel(blue)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

function oklabDistance(first: ReturnType<typeof rgbToOklab>, second: ReturnType<typeof rgbToOklab>) {
  return Math.hypot(first.l - second.l, first.a - second.a, first.b - second.b)
}

export function colorKeyDistance(first: { red: number; green: number; blue: number }, second: { red: number; green: number; blue: number }) {
  return oklabDistance(rgbToOklab(first.red, first.green, first.blue), rgbToOklab(second.red, second.green, second.blue)) * 100
}

function assertPixels(source: Uint8ClampedArray, width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || source.length !== width * height * 4) throw new Error('色彩抠图 RGBA 像素尺寸无效')
}

export function sampleColorKeyColor(source: Uint8ClampedArray, width: number, height: number, normalizedX: number, normalizedY: number, radius = 2) {
  assertPixels(source, width, height)
  if (![normalizedX, normalizedY].every(Number.isFinite)) throw new Error('颜色取样坐标无效')
  if (!Number.isInteger(radius) || radius < 0 || radius > 8) throw new Error('颜色取样半径无效')
  const centerX = Math.min(width - 1, Math.max(0, Math.floor(normalizedX * width)))
  const centerY = Math.min(height - 1, Math.max(0, Math.floor(normalizedY * height)))
  let red = 0
  let green = 0
  let blue = 0
  let weight = 0
  for (let y = Math.max(0, centerY - radius); y <= Math.min(height - 1, centerY + radius); y += 1) {
    for (let x = Math.max(0, centerX - radius); x <= Math.min(width - 1, centerX + radius); x += 1) {
      const offset = (y * width + x) * 4
      const alpha = source[offset + 3] / 255
      if (alpha <= 0) continue
      red += source[offset] * alpha
      green += source[offset + 1] * alpha
      blue += source[offset + 2] * alpha
      weight += alpha
    }
  }
  if (weight === 0) throw new Error('取样位置周围完全透明，请点击可见背景')
  return { red: Math.round(red / weight), green: Math.round(green / weight), blue: Math.round(blue / weight), hex: colorHex(red / weight, green / weight, blue / weight), x: centerX, y: centerY }
}

interface ColorKeyAccumulator {
  visibleSourcePixels: number
  removedPixels: number
  partialPixels: number
  despilledPixels: number
  remainingPixels: number
}

function maskAlpha(distance: number, settings: ColorKeySettings) {
  if (settings.feather === 0) return distance <= settings.tolerance ? 0 : 255
  return Math.max(0, Math.min(255, Math.round((distance - settings.tolerance) / settings.feather * 255)))
}

function processColorKeyRange(result: Uint8ClampedArray, start: number, end: number, keyLab: ReturnType<typeof rgbToOklab>, settings: ColorKeySettings, accumulator: ColorKeyAccumulator) {
  for (let offset = start; offset < end; offset += 4) {
    const sourceAlpha = result[offset + 3]
    if (sourceAlpha <= 4) {
      result[offset] = 0
      result[offset + 1] = 0
      result[offset + 2] = 0
      result[offset + 3] = 0
      continue
    }
    accumulator.visibleSourcePixels += 1
    const pixelLab = rgbToOklab(result[offset], result[offset + 1], result[offset + 2])
    const distance = oklabDistance(pixelLab, keyLab) * 100
    const nextAlpha = Math.round(maskAlpha(distance, settings) * sourceAlpha / 255)
    if (nextAlpha <= 4) {
      result[offset] = 0
      result[offset + 1] = 0
      result[offset + 2] = 0
      result[offset + 3] = 0
      accumulator.removedPixels += 1
      continue
    }
    result[offset + 3] = nextAlpha
    accumulator.remainingPixels += 1
    if (nextAlpha < sourceAlpha) {
      accumulator.partialPixels += 1
      const influence = settings.despill / 100 * (1 - nextAlpha / sourceAlpha)
      if (influence > 0) {
        const red = result[offset]
        const green = result[offset + 1]
        const blue = result[offset + 2]
        const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722
        result[offset] = Math.round(red + (luminance - red) * influence)
        result[offset + 1] = Math.round(green + (luminance - green) * influence)
        result[offset + 2] = Math.round(blue + (luminance - blue) * influence)
        if (result[offset] !== red || result[offset + 1] !== green || result[offset + 2] !== blue) accumulator.despilledPixels += 1
      }
    }
  }
}

function finishResult(pixels: Uint8ClampedArray, width: number, height: number, accumulator: ColorKeyAccumulator): ColorKeyResult {
  if (accumulator.visibleSourcePixels === 0) throw new Error('图片没有可处理的可见像素')
  if (accumulator.remainingPixels === 0) throw new Error('当前设置移除了全部可见像素，请降低颜色容差或柔化范围')
  return { pixels, width, height, ...accumulator, removedCoverage: accumulator.removedPixels / accumulator.visibleSourcePixels }
}

function newAccumulator(): ColorKeyAccumulator {
  return { visibleSourcePixels: 0, removedPixels: 0, partialPixels: 0, despilledPixels: 0, remainingPixels: 0 }
}

export function removeColorKeyPixels(source: Uint8ClampedArray, width: number, height: number, settings: ColorKeySettings): ColorKeyResult {
  assertPixels(source, width, height)
  assertColorKeySettings(settings)
  const key = parseHex(settings.keyColor)
  const result = new Uint8ClampedArray(source)
  const accumulator = newAccumulator()
  processColorKeyRange(result, 0, result.length, rgbToOklab(key.red, key.green, key.blue), settings, accumulator)
  return finishResult(result, width, height, accumulator)
}

async function removeColorKeyPixelsCooperatively(source: Uint8ClampedArray, width: number, height: number, settings: ColorKeySettings, signal?: AbortSignal) {
  assertPixels(source, width, height)
  assertColorKeySettings(settings)
  const key = parseHex(settings.keyColor)
  const keyLab = rgbToOklab(key.red, key.green, key.blue)
  const result = new Uint8ClampedArray(source)
  const accumulator = newAccumulator()
  const chunkLength = 200_000 * 4
  for (let start = 0; start < result.length; start += chunkLength) {
    throwIfAborted(signal)
    processColorKeyRange(result, start, Math.min(result.length, start + chunkLength), keyLab, settings, accumulator)
    if (start + chunkLength < result.length) await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
  throwIfAborted(signal)
  return finishResult(result, width, height, accumulator)
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
      reject(new DOMException('已取消色彩抠图', 'AbortError'))
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
  if (!context) throw new Error('当前设备无法创建色彩抠图画布')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, width, height)
  return { canvas, context }
}

function pixelsToPng(result: ColorKeyResult, signal?: AbortSignal) {
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

export function colorKeyFilename(filename: string) {
  return `${safeStem(filename)}-color-key.png`
}

export async function prepareColorKeySource(file: File, signal?: AbortSignal): Promise<PreparedColorKeySource> {
  validateColorKeyFile(file)
  const image = await loadFileImage(file, signal)
  const preview = computeColorKeyDimensions(image.naturalWidth, image.naturalHeight, COLOR_KEY_PREVIEW_MAX_SIDE, COLOR_KEY_PREVIEW_MAX_PIXELS)
  const output = computeColorKeyDimensions(image.naturalWidth, image.naturalHeight, COLOR_KEY_OUTPUT_MAX_SIDE, COLOR_KEY_OUTPUT_MAX_PIXELS)
  const { canvas, context } = drawImage(image, preview.width, preview.height)
  const previewPixels = new Uint8ClampedArray(context.getImageData(0, 0, preview.width, preview.height).data)
  const originalPreviewBlob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('无法生成原图预览')), 'image/png'))
  throwIfAborted(signal)
  return { file, filename: file.name, originalWidth: image.naturalWidth, originalHeight: image.naturalHeight, previewWidth: preview.width, previewHeight: preview.height, previewScale: preview.scale, outputWidth: output.width, outputHeight: output.height, outputScale: output.scale, previewPixels, originalPreviewBlob }
}

function renderedResult(blob: Blob, result: ColorKeyResult, settings: ColorKeySettings): RenderedColorKey {
  return {
    blob,
    width: result.width,
    height: result.height,
    visibleSourcePixels: result.visibleSourcePixels,
    removedPixels: result.removedPixels,
    partialPixels: result.partialPixels,
    despilledPixels: result.despilledPixels,
    remainingPixels: result.remainingPixels,
    removedCoverage: result.removedCoverage,
    settings: { ...settings },
  }
}

export async function renderColorKeyPreview(source: PreparedColorKeySource, settings: ColorKeySettings, signal?: AbortSignal): Promise<RenderedColorKey> {
  const result = await removeColorKeyPixelsCooperatively(source.previewPixels, source.previewWidth, source.previewHeight, settings, signal)
  return renderedResult(await pixelsToPng(result, signal), result, settings)
}

export async function exportColorKey(source: PreparedColorKeySource, settings: ColorKeySettings, signal?: AbortSignal): Promise<ExportedColorKey> {
  const image = await loadFileImage(source.file, signal)
  const { canvas, context } = drawImage(image, source.outputWidth, source.outputHeight)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  const result = await removeColorKeyPixelsCooperatively(pixels, canvas.width, canvas.height, settings, signal)
  return { ...renderedResult(await pixelsToPng(result, signal), result, settings), filename: colorKeyFilename(source.filename) }
}

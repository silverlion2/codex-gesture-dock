export const STICKER_MAX_FILE_BYTES = 35 * 1024 * 1024
export const STICKER_MAX_SOURCE_PIXELS = 80_000_000
export const STICKER_PREVIEW_MAX_SIDE = 1_200
export const STICKER_PREVIEW_MAX_PIXELS = 1_500_000
export const STICKER_OUTPUT_SOURCE_MAX_SIDE = 3_000
export const STICKER_OUTPUT_SOURCE_MAX_PIXELS = 8_000_000
export const STICKER_RESULT_MAX_SIDE = 4_096
export const STICKER_RESULT_MAX_PIXELS = 14_000_000

export interface StickerOutlineSettings {
  outlinePercent: number
  paddingPercent: number
  color: string
}

export interface PreparedStickerSource {
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

export interface StickerOutlineResult {
  pixels: Uint8ClampedArray
  width: number
  height: number
  visiblePixels: number
  outlinePixels: number
  outlineRadius: number
  padding: number
  sourceBounds: { x: number; y: number; width: number; height: number }
}

export interface RenderedStickerOutline extends Omit<StickerOutlineResult, 'pixels'> {
  blob: Blob
  settings: StickerOutlineSettings
}

export interface ExportedStickerOutline extends RenderedStickerOutline {
  filename: string
}

export const defaultStickerOutlineSettings: StickerOutlineSettings = {
  outlinePercent: 3,
  paddingPercent: 2,
  color: '#FFFFFF',
}

const supportedTypes = new Set(['image/png', 'image/webp'])
const DISTANCE_INFINITY = 65_535

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('已取消透明图描边', 'AbortError')
}

export function validateStickerFile(file: File) {
  if (!supportedTypes.has(file.type.toLowerCase())) throw new Error('请选择带透明通道的 PNG 或 WebP 图片')
  if (file.size > STICKER_MAX_FILE_BYTES) throw new Error('图片不能超过 35 MB')
}

export function assertStickerSettings(settings: StickerOutlineSettings) {
  if (!Number.isInteger(settings.outlinePercent) || settings.outlinePercent < 1 || settings.outlinePercent > 8) throw new Error('描边宽度必须在主体短边的 1%–8% 之间')
  if (!Number.isInteger(settings.paddingPercent) || settings.paddingPercent < 0 || settings.paddingPercent > 8) throw new Error('透明留白必须在主体短边的 0%–8% 之间')
  if (!/^#[\da-f]{6}$/i.test(settings.color)) throw new Error('描边颜色必须是六位 HEX')
}

export function computeStickerSourceDimensions(width: number, height: number, maxSide: number, maxPixels: number) {
  if (![width, height, maxSide, maxPixels].every((value) => Number.isFinite(value) && value > 0)) throw new Error('图片尺寸或安全预算无效')
  if (width * height > STICKER_MAX_SOURCE_PIXELS) throw new Error('图片解码后超过 8000 万像素安全上限')
  const scale = Math.min(1, maxSide / Math.max(width, height), Math.sqrt(maxPixels / (width * height)))
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)), scale }
}

function assertPixels(source: Uint8ClampedArray, width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || source.length !== width * height * 4) throw new Error('透明图描边 RGBA 像素尺寸无效')
}

function scanAlpha(source: Uint8ClampedArray, width: number, height: number) {
  let visiblePixels = 0
  let transparentPixels = 0
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let offset = 0; offset < source.length; offset += 4) {
    const alpha = source[offset + 3]
    if (alpha <= 4) {
      transparentPixels += 1
      continue
    }
    const pixel = offset / 4
    const x = pixel % width
    const y = Math.floor(pixel / width)
    visiblePixels += 1
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  if (visiblePixels === 0) throw new Error('图片没有可描边的可见像素')
  if (transparentPixels === 0) throw new Error('图片没有透明边界；请先使用人物、线稿或色彩抠图导出透明 PNG')
  return {
    visiblePixels,
    sourceBounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
  }
}

interface StickerWork {
  source: Uint8ClampedArray
  sourceWidth: number
  settings: StickerOutlineSettings
  visiblePixels: number
  sourceBounds: StickerOutlineResult['sourceBounds']
  outlineRadius: number
  padding: number
  inset: number
  width: number
  height: number
  distances: Uint16Array
}

function parseHex(value: string) {
  const integer = Number.parseInt(value.slice(1), 16)
  return { red: integer >> 16, green: (integer >> 8) & 255, blue: integer & 255 }
}

function createStickerWork(source: Uint8ClampedArray, width: number, height: number, settings: StickerOutlineSettings): StickerWork {
  assertPixels(source, width, height)
  assertStickerSettings(settings)
  const { visiblePixels, sourceBounds } = scanAlpha(source, width, height)
  const shortSide = Math.min(sourceBounds.width, sourceBounds.height)
  const outlineRadius = Math.max(1, Math.round(shortSide * settings.outlinePercent / 100))
  const padding = Math.round(shortSide * settings.paddingPercent / 100)
  const inset = outlineRadius + padding
  const outputWidth = sourceBounds.width + inset * 2
  const outputHeight = sourceBounds.height + inset * 2
  if (Math.max(outputWidth, outputHeight) > STICKER_RESULT_MAX_SIDE || outputWidth * outputHeight > STICKER_RESULT_MAX_PIXELS) throw new Error('描边结果超过 4096 边长或 1400 万像素安全上限，请缩小原图或降低描边/留白')
  const distances = new Uint16Array(outputWidth * outputHeight)
  distances.fill(DISTANCE_INFINITY)
  for (let y = sourceBounds.y; y < sourceBounds.y + sourceBounds.height; y += 1) {
    for (let x = sourceBounds.x; x < sourceBounds.x + sourceBounds.width; x += 1) {
      if (source[(y * width + x) * 4 + 3] > 4) distances[(y - sourceBounds.y + inset) * outputWidth + x - sourceBounds.x + inset] = 0
    }
  }
  return { source, sourceWidth: width, settings, visiblePixels, sourceBounds, outlineRadius, padding, inset, width: outputWidth, height: outputHeight, distances }
}

function lowerDistance(current: number, candidate: number) {
  return Math.min(current, Math.min(DISTANCE_INFINITY, candidate))
}

function forwardDistanceRow(work: StickerWork, y: number) {
  const { distances, width } = work
  for (let x = 0; x < width; x += 1) {
    const index = y * width + x
    let value = distances[index]
    if (x > 0) value = lowerDistance(value, distances[index - 1] + 3)
    if (y > 0) {
      value = lowerDistance(value, distances[index - width] + 3)
      if (x > 0) value = lowerDistance(value, distances[index - width - 1] + 4)
      if (x + 1 < width) value = lowerDistance(value, distances[index - width + 1] + 4)
    }
    distances[index] = value
  }
}

function backwardDistanceRow(work: StickerWork, y: number) {
  const { distances, width, height } = work
  for (let x = width - 1; x >= 0; x -= 1) {
    const index = y * width + x
    let value = distances[index]
    if (x + 1 < width) value = lowerDistance(value, distances[index + 1] + 3)
    if (y + 1 < height) {
      value = lowerDistance(value, distances[index + width] + 3)
      if (x > 0) value = lowerDistance(value, distances[index + width - 1] + 4)
      if (x + 1 < width) value = lowerDistance(value, distances[index + width + 1] + 4)
    }
    distances[index] = value
  }
}

function composeSticker(work: StickerWork) {
  const output = new Uint8ClampedArray(work.width * work.height * 4)
  const outline = parseHex(work.settings.color)
  const threshold = work.outlineRadius * 3
  let outlinePixels = 0
  for (let y = 0; y < work.height; y += 1) {
    for (let x = 0; x < work.width; x += 1) {
      const outputPixel = y * work.width + x
      const outputOffset = outputPixel * 4
      const sourceX = x - work.inset + work.sourceBounds.x
      const sourceY = y - work.inset + work.sourceBounds.y
      if (sourceX >= work.sourceBounds.x && sourceX < work.sourceBounds.x + work.sourceBounds.width && sourceY >= work.sourceBounds.y && sourceY < work.sourceBounds.y + work.sourceBounds.height) {
        const sourceOffset = (sourceY * work.sourceWidth + sourceX) * 4
        if (work.source[sourceOffset + 3] > 4) {
          output[outputOffset] = work.source[sourceOffset]
          output[outputOffset + 1] = work.source[sourceOffset + 1]
          output[outputOffset + 2] = work.source[sourceOffset + 2]
          output[outputOffset + 3] = work.source[sourceOffset + 3]
          continue
        }
      }
      if (work.distances[outputPixel] <= threshold) {
        output[outputOffset] = outline.red
        output[outputOffset + 1] = outline.green
        output[outputOffset + 2] = outline.blue
        output[outputOffset + 3] = 255
        outlinePixels += 1
      }
    }
  }
  return { pixels: output, outlinePixels }
}

function finishSticker(work: StickerWork): StickerOutlineResult {
  const { pixels, outlinePixels } = composeSticker(work)
  return { pixels, width: work.width, height: work.height, visiblePixels: work.visiblePixels, outlinePixels, outlineRadius: work.outlineRadius, padding: work.padding, sourceBounds: work.sourceBounds }
}

export function renderStickerOutlinePixels(source: Uint8ClampedArray, width: number, height: number, settings: StickerOutlineSettings): StickerOutlineResult {
  const work = createStickerWork(source, width, height, settings)
  for (let y = 0; y < work.height; y += 1) forwardDistanceRow(work, y)
  for (let y = work.height - 1; y >= 0; y -= 1) backwardDistanceRow(work, y)
  return finishSticker(work)
}

async function renderStickerOutlinePixelsCooperatively(source: Uint8ClampedArray, width: number, height: number, settings: StickerOutlineSettings, signal?: AbortSignal) {
  throwIfAborted(signal)
  const work = createStickerWork(source, width, height, settings)
  for (let y = 0; y < work.height; y += 1) {
    throwIfAborted(signal)
    forwardDistanceRow(work, y)
    if (y % 64 === 63) await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
  for (let y = work.height - 1; y >= 0; y -= 1) {
    throwIfAborted(signal)
    backwardDistanceRow(work, y)
    if (y % 64 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
  throwIfAborted(signal)
  return finishSticker(work)
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
      reject(new DOMException('已取消透明图描边', 'AbortError'))
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
  if (!context) throw new Error('当前设备无法创建透明图描边画布')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, width, height)
  return { canvas, context }
}

function pixelsToPng(result: StickerOutlineResult, signal?: AbortSignal) {
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

export function stickerOutlineFilename(filename: string) {
  return `${safeStem(filename)}-sticker.png`
}

export async function prepareStickerSource(file: File, signal?: AbortSignal): Promise<PreparedStickerSource> {
  validateStickerFile(file)
  const image = await loadFileImage(file, signal)
  const preview = computeStickerSourceDimensions(image.naturalWidth, image.naturalHeight, STICKER_PREVIEW_MAX_SIDE, STICKER_PREVIEW_MAX_PIXELS)
  const output = computeStickerSourceDimensions(image.naturalWidth, image.naturalHeight, STICKER_OUTPUT_SOURCE_MAX_SIDE, STICKER_OUTPUT_SOURCE_MAX_PIXELS)
  const { canvas, context } = drawImage(image, preview.width, preview.height)
  const previewPixels = new Uint8ClampedArray(context.getImageData(0, 0, preview.width, preview.height).data)
  scanAlpha(previewPixels, preview.width, preview.height)
  const originalPreviewBlob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('无法生成透明图预览')), 'image/png'))
  throwIfAborted(signal)
  return { file, filename: file.name, originalWidth: image.naturalWidth, originalHeight: image.naturalHeight, previewWidth: preview.width, previewHeight: preview.height, previewScale: preview.scale, outputWidth: output.width, outputHeight: output.height, outputScale: output.scale, previewPixels, originalPreviewBlob }
}

function renderedResult(blob: Blob, result: StickerOutlineResult, settings: StickerOutlineSettings): RenderedStickerOutline {
  return { blob, width: result.width, height: result.height, visiblePixels: result.visiblePixels, outlinePixels: result.outlinePixels, outlineRadius: result.outlineRadius, padding: result.padding, sourceBounds: result.sourceBounds, settings: { ...settings } }
}

export async function renderStickerOutlinePreview(source: PreparedStickerSource, settings: StickerOutlineSettings, signal?: AbortSignal): Promise<RenderedStickerOutline> {
  const result = await renderStickerOutlinePixelsCooperatively(source.previewPixels, source.previewWidth, source.previewHeight, settings, signal)
  return renderedResult(await pixelsToPng(result, signal), result, settings)
}

export async function exportStickerOutline(source: PreparedStickerSource, settings: StickerOutlineSettings, signal?: AbortSignal): Promise<ExportedStickerOutline> {
  const image = await loadFileImage(source.file, signal)
  const { canvas, context } = drawImage(image, source.outputWidth, source.outputHeight)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  const result = await renderStickerOutlinePixelsCooperatively(pixels, canvas.width, canvas.height, settings, signal)
  return { ...renderedResult(await pixelsToPng(result, signal), result, settings), filename: stickerOutlineFilename(source.filename) }
}

import type { ImageOutputFormat } from './imageOptimizer'

export const IMAGE_WATERMARK_MAX_FILES = 12
export const IMAGE_WATERMARK_MAX_FILE_BYTES = 35 * 1024 * 1024
export const IMAGE_WATERMARK_MAX_TOTAL_BYTES = 160 * 1024 * 1024
export const IMAGE_WATERMARK_MAX_LOGO_BYTES = 10 * 1024 * 1024
export const IMAGE_WATERMARK_MAX_SOURCE_PIXELS = 80_000_000
export const IMAGE_WATERMARK_PREVIEW_MAX_SIDE = 1_600
export const IMAGE_WATERMARK_PREVIEW_MAX_PIXELS = 2_400_000
export const IMAGE_WATERMARK_OUTPUT_MAX_SIDE = 8_192
export const IMAGE_WATERMARK_OUTPUT_MAX_PIXELS = 24_000_000

export type WatermarkMode = 'text' | 'logo'
export type WatermarkPosition = 'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right' | 'tile'

export interface WatermarkSettings {
  mode: WatermarkMode
  text: string
  color: '#ffffff' | '#000000'
  opacity: number
  sizePercent: number
  marginPercent: number
  rotation: number
  position: WatermarkPosition
}

export interface WatermarkDimensions {
  width: number
  height: number
  scale: number
}

export interface PreparedWatermarkBatch {
  files: File[]
  firstFilename: string
  firstOriginalWidth: number
  firstOriginalHeight: number
  previewWidth: number
  previewHeight: number
  previewScale: number
  firstPreviewBlob: Blob
}

export interface RenderedWatermarkImage {
  blob: Blob
  filename: string
  width: number
  height: number
  format: ImageOutputFormat
}

interface WatermarkAsset {
  image: HTMLImageElement | null
  width: number
  height: number
}

const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp'])
const supportedLogoTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])
const mimeTypes: Record<ImageOutputFormat, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }
const positions = new Set<WatermarkPosition>(['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right', 'tile'])

export const defaultWatermarkSettings: WatermarkSettings = {
  mode: 'text',
  text: '© Your name',
  color: '#ffffff',
  opacity: 0.72,
  sizePercent: 8,
  marginPercent: 4,
  rotation: 0,
  position: 'bottom-right',
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('已取消图片水印处理', 'AbortError')
}

export function validateWatermarkFiles(files: File[]) {
  if (files.length < 1) throw new Error('请至少选择 1 张图片')
  if (files.length > IMAGE_WATERMARK_MAX_FILES) throw new Error(`一次最多选择 ${IMAGE_WATERMARK_MAX_FILES} 张图片`)
  let totalBytes = 0
  for (const file of files) {
    if (!supportedTypes.has(file.type)) throw new Error(`${file.name} 不是受支持的 PNG、JPEG、WebP 或 BMP 图片`)
    if (file.size > IMAGE_WATERMARK_MAX_FILE_BYTES) throw new Error(`${file.name} 超过 35 MB`)
    totalBytes += file.size
  }
  if (totalBytes > IMAGE_WATERMARK_MAX_TOTAL_BYTES) throw new Error('所选图片合计不能超过 160 MB')
}

export function validateWatermarkLogo(file: File | null) {
  if (!file) throw new Error('Logo 水印需要选择一张 PNG、JPEG 或 WebP 图片')
  if (!supportedLogoTypes.has(file.type)) throw new Error('Logo 水印只支持 PNG、JPEG 或 WebP')
  if (file.size > IMAGE_WATERMARK_MAX_LOGO_BYTES) throw new Error('Logo 图片不能超过 10 MB')
}

export function validateWatermarkSettings(settings: WatermarkSettings, logoFile: File | null = null) {
  if (settings.mode !== 'text' && settings.mode !== 'logo') throw new Error('水印类型无效')
  if (settings.mode === 'text') {
    const length = [...settings.text.trim()].length
    if (length < 1 || length > 80) throw new Error('水印文字必须为 1–80 个字符')
  } else {
    validateWatermarkLogo(logoFile)
  }
  if (settings.color !== '#ffffff' && settings.color !== '#000000') throw new Error('水印文字颜色无效')
  if (!Number.isFinite(settings.opacity) || settings.opacity < 0.1 || settings.opacity > 1) throw new Error('水印不透明度必须在 10%–100% 之间')
  if (!Number.isFinite(settings.sizePercent) || settings.sizePercent < 4 || settings.sizePercent > 40) throw new Error('水印尺寸必须在 4%–40% 之间')
  if (!Number.isFinite(settings.marginPercent) || settings.marginPercent < 0 || settings.marginPercent > 15) throw new Error('水印边距必须在 0%–15% 之间')
  if (!Number.isFinite(settings.rotation) || settings.rotation < -45 || settings.rotation > 45) throw new Error('水印旋转必须在 -45°–45° 之间')
  if (!positions.has(settings.position)) throw new Error('水印位置无效')
}

export function computeWatermarkDimensions(width: number, height: number, maxSide: number, maxPixels: number): WatermarkDimensions {
  if (![width, height, maxSide, maxPixels].every((value) => Number.isFinite(value) && value > 0)) throw new Error('图片尺寸或安全预算无效')
  if (width * height > IMAGE_WATERMARK_MAX_SOURCE_PIXELS) throw new Error('图片解码后超过 8000 万像素安全上限')
  const scale = Math.min(1, maxSide / Math.max(width, height), Math.sqrt(maxPixels / (width * height)))
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)), scale }
}

export function watermarkAnchor(
  canvasWidth: number,
  canvasHeight: number,
  markWidth: number,
  markHeight: number,
  margin: number,
  position: Exclude<WatermarkPosition, 'tile'>,
) {
  if (![canvasWidth, canvasHeight, markWidth, markHeight, margin].every((value) => Number.isFinite(value) && value >= 0)) throw new Error('水印布局尺寸无效')
  const left = margin + markWidth / 2
  const centerX = canvasWidth / 2
  const right = canvasWidth - margin - markWidth / 2
  const top = margin + markHeight / 2
  const centerY = canvasHeight / 2
  const bottom = canvasHeight - margin - markHeight / 2
  const x = position.endsWith('left') || position === 'left' ? left : position.endsWith('right') || position === 'right' ? right : centerX
  const y = position.startsWith('top') || position === 'top' ? top : position.startsWith('bottom') || position === 'bottom' ? bottom : centerY
  return { x, y }
}

function safeStem(filename: string) {
  const stem = filename.replace(/\.[^.]+$/, '')
  const safe = [...stem]
    .map((character) => character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '-' : character)
    .join('')
    .trim()
    .slice(0, 52)
    .replace(/[. ]+$/, '')
  if (!safe || safe === '.' || safe === '..') return 'image'
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safe) ? `${safe}-file` : safe
}

export function watermarkedImageFilename(filename: string, format: ImageOutputFormat) {
  return `${safeStem(filename)}-watermarked.${format === 'jpeg' ? 'jpg' : format}`
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
      reject(new DOMException('已取消图片水印处理', 'AbortError'))
    }
    image.onload = () => {
      cleanup()
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) reject(new Error(`图片尺寸无效：${file.name}`))
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

function canvasToBlob(canvas: HTMLCanvasElement, format: ImageOutputFormat, quality: number, signal?: AbortSignal) {
  const type = mimeTypes[format]
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

function createOutputCanvas(image: HTMLImageElement, dimensions: WatermarkDimensions, format: ImageOutputFormat) {
  const canvas = document.createElement('canvas')
  canvas.width = dimensions.width
  canvas.height = dimensions.height
  const context = canvas.getContext('2d', { alpha: format !== 'jpeg' })
  if (!context) throw new Error('当前设备无法创建图片水印画布')
  if (format === 'jpeg') {
    context.fillStyle = '#FFFFFF'
    context.fillRect(0, 0, canvas.width, canvas.height)
  }
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return { canvas, context }
}

function textAsset(context: CanvasRenderingContext2D, settings: WatermarkSettings, canvasWidth: number, canvasHeight: number): WatermarkAsset {
  let fontSize = Math.max(10, Math.round(Math.min(canvasWidth, canvasHeight) * settings.sizePercent / 100))
  context.font = `700 ${fontSize}px sans-serif`
  const maximumWidth = canvasWidth * 0.82
  const measured = context.measureText(settings.text).width
  if (measured > maximumWidth) {
    fontSize = Math.max(10, Math.floor(fontSize * maximumWidth / measured))
    context.font = `700 ${fontSize}px sans-serif`
  }
  return { image: null, width: Math.min(maximumWidth, context.measureText(settings.text).width), height: fontSize * 1.25 }
}

function logoAsset(image: HTMLImageElement, settings: WatermarkSettings, canvasWidth: number, canvasHeight: number): WatermarkAsset {
  const targetWidth = Math.min(canvasWidth * 0.8, canvasWidth * settings.sizePercent / 100)
  const scale = Math.min(targetWidth / image.naturalWidth, canvasHeight * 0.55 / image.naturalHeight)
  return { image, width: image.naturalWidth * scale, height: image.naturalHeight * scale }
}

function drawOneWatermark(
  context: CanvasRenderingContext2D,
  asset: WatermarkAsset,
  settings: WatermarkSettings,
  x: number,
  y: number,
) {
  context.save()
  context.globalAlpha = settings.opacity
  context.translate(x, y)
  context.rotate(settings.rotation * Math.PI / 180)
  if (settings.mode === 'logo' && asset.image) {
    context.drawImage(asset.image, -asset.width / 2, -asset.height / 2, asset.width, asset.height)
  } else {
    const fontSize = asset.height / 1.25
    context.font = `700 ${fontSize}px sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.lineJoin = 'round'
    context.lineWidth = Math.max(1, fontSize * 0.07)
    context.strokeStyle = settings.color === '#ffffff' ? '#000000' : '#ffffff'
    context.fillStyle = settings.color
    context.strokeText(settings.text, 0, 0, asset.width)
    context.fillText(settings.text, 0, 0, asset.width)
  }
  context.restore()
}

function drawWatermark(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  settings: WatermarkSettings,
  logoImage: HTMLImageElement | null,
) {
  const asset = settings.mode === 'logo' && logoImage
    ? logoAsset(logoImage, settings, canvas.width, canvas.height)
    : textAsset(context, settings, canvas.width, canvas.height)
  const margin = Math.min(canvas.width, canvas.height) * settings.marginPercent / 100
  if (settings.position !== 'tile') {
    const anchor = watermarkAnchor(canvas.width, canvas.height, asset.width, asset.height, margin, settings.position)
    drawOneWatermark(context, asset, settings, anchor.x, anchor.y)
    return
  }
  const rotationPadding = Math.max(asset.width, asset.height) * 0.45
  const stepX = Math.max(48, asset.width + rotationPadding + margin * 2)
  const stepY = Math.max(40, asset.height + rotationPadding + margin * 2)
  for (let row = -1, y = -stepY / 2; y < canvas.height + stepY; row += 1, y += stepY) {
    for (let x = (row % 2 === 0 ? 0 : -stepX / 2); x < canvas.width + stepX; x += stepX) {
      drawOneWatermark(context, asset, settings, x, y)
    }
  }
}

async function renderFile(
  file: File,
  settings: WatermarkSettings,
  logoFile: File | null,
  format: ImageOutputFormat,
  quality: number,
  maxSide: number,
  maxPixels: number,
  signal?: AbortSignal,
) {
  validateWatermarkSettings(settings, logoFile)
  if (!mimeTypes[format]) throw new Error('不支持的图片输出格式')
  if (!Number.isFinite(quality) || quality < 0.4 || quality > 1) throw new Error('JPEG/WebP 质量必须在 40%–100% 之间')
  const sourceImage = await loadFileImage(file, signal)
  const dimensions = computeWatermarkDimensions(sourceImage.naturalWidth, sourceImage.naturalHeight, maxSide, maxPixels)
  const logoImage = settings.mode === 'logo' && logoFile ? await loadFileImage(logoFile, signal) : null
  throwIfAborted(signal)
  const { canvas, context } = createOutputCanvas(sourceImage, dimensions, format)
  drawWatermark(context, canvas, settings, logoImage)
  const blob = await canvasToBlob(canvas, format, quality, signal)
  return { blob, width: canvas.width, height: canvas.height }
}

export async function prepareWatermarkBatch(files: File[], signal?: AbortSignal): Promise<PreparedWatermarkBatch> {
  validateWatermarkFiles(files)
  const image = await loadFileImage(files[0], signal)
  const dimensions = computeWatermarkDimensions(image.naturalWidth, image.naturalHeight, IMAGE_WATERMARK_PREVIEW_MAX_SIDE, IMAGE_WATERMARK_PREVIEW_MAX_PIXELS)
  const { canvas } = createOutputCanvas(image, dimensions, 'png')
  const firstPreviewBlob = await canvasToBlob(canvas, 'png', 1, signal)
  return {
    files: [...files],
    firstFilename: files[0].name,
    firstOriginalWidth: image.naturalWidth,
    firstOriginalHeight: image.naturalHeight,
    previewWidth: canvas.width,
    previewHeight: canvas.height,
    previewScale: dimensions.scale,
    firstPreviewBlob,
  }
}

export async function renderWatermarkPreview(
  batch: PreparedWatermarkBatch,
  settings: WatermarkSettings,
  logoFile: File | null,
  signal?: AbortSignal,
): Promise<RenderedWatermarkImage> {
  const result = await renderFile(
    batch.files[0],
    settings,
    logoFile,
    'png',
    1,
    IMAGE_WATERMARK_PREVIEW_MAX_SIDE,
    IMAGE_WATERMARK_PREVIEW_MAX_PIXELS,
    signal,
  )
  return { ...result, filename: watermarkedImageFilename(batch.firstFilename, 'png'), format: 'png' }
}

export async function renderWatermarkedImage(
  file: File,
  settings: WatermarkSettings,
  logoFile: File | null,
  format: ImageOutputFormat,
  quality: number,
  signal?: AbortSignal,
): Promise<RenderedWatermarkImage> {
  validateWatermarkFiles([file])
  const result = await renderFile(
    file,
    settings,
    logoFile,
    format,
    quality,
    IMAGE_WATERMARK_OUTPUT_MAX_SIDE,
    IMAGE_WATERMARK_OUTPUT_MAX_PIXELS,
    signal,
  )
  return { ...result, filename: watermarkedImageFilename(file.name, format), format }
}

import type { ImageOutputFormat } from './imageOptimizer'

export const SCREENSHOT_BEAUTIFIER_MAX_FILE_BYTES = 35 * 1024 * 1024
export const SCREENSHOT_BEAUTIFIER_MAX_SOURCE_PIXELS = 80_000_000
export const SCREENSHOT_BEAUTIFIER_PREVIEW_MAX_SIDE = 1_600
export const SCREENSHOT_BEAUTIFIER_PREVIEW_MAX_PIXELS = 2_400_000
export const SCREENSHOT_BEAUTIFIER_OUTPUT_MAX_SIDE = 8_192
export const SCREENSHOT_BEAUTIFIER_OUTPUT_MAX_PIXELS = 24_000_000

export type BeautifierBackground = 'forest' | 'ocean' | 'sunset' | 'plum' | 'paper' | 'dark'
export type BeautifierAspect = 'auto' | 'square' | '4:3' | '16:9'
export type BeautifierFrame = 'none' | 'window'

export interface ScreenshotBeautifierSettings {
  background: BeautifierBackground
  aspect: BeautifierAspect
  frame: BeautifierFrame
  paddingPercent: number
  cornerPercent: number
  shadow: number
  title: string
}

export interface ScreenshotBeautifierLayout {
  width: number
  height: number
  scale: number
  imageX: number
  imageY: number
  imageWidth: number
  imageHeight: number
  frameHeight: number
  cornerRadius: number
  padding: number
}

export interface PreparedScreenshotSource {
  file: File
  filename: string
  originalWidth: number
  originalHeight: number
  previewWidth: number
  previewHeight: number
  previewBlob: Blob
}

export interface RenderedBeautifiedScreenshot {
  blob: Blob
  filename: string
  width: number
  height: number
  format: ImageOutputFormat
  quality: number | null
  settings: ScreenshotBeautifierSettings
}

export const defaultScreenshotBeautifierSettings: ScreenshotBeautifierSettings = {
  background: 'forest',
  aspect: 'auto',
  frame: 'window',
  paddingPercent: 12,
  cornerPercent: 3,
  shadow: 55,
  title: '',
}

const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp'])
const mimeTypes: Record<ImageOutputFormat, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }
const aspectRatios: Record<Exclude<BeautifierAspect, 'auto'>, number> = { square: 1, '4:3': 4 / 3, '16:9': 16 / 9 }

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('已取消截图美化', 'AbortError')
}

export function validateScreenshotBeautifierFile(file: File) {
  if (!supportedTypes.has(file.type)) throw new Error('请选择 PNG、JPEG、WebP 或 BMP 图片')
  if (file.size > SCREENSHOT_BEAUTIFIER_MAX_FILE_BYTES) throw new Error('图片不能超过 35 MB')
}

export function assertScreenshotBeautifierSettings(settings: ScreenshotBeautifierSettings) {
  if (!['forest', 'ocean', 'sunset', 'plum', 'paper', 'dark'].includes(settings.background)) throw new Error('截图背景设置无效')
  if (!['auto', 'square', '4:3', '16:9'].includes(settings.aspect)) throw new Error('截图画布比例无效')
  if (!['none', 'window'].includes(settings.frame)) throw new Error('截图边框设置无效')
  if (!Number.isFinite(settings.paddingPercent) || settings.paddingPercent < 4 || settings.paddingPercent > 24) throw new Error('留白必须在 4%–24% 之间')
  if (!Number.isFinite(settings.cornerPercent) || settings.cornerPercent < 0 || settings.cornerPercent > 8) throw new Error('圆角必须在 0%–8% 之间')
  if (!Number.isFinite(settings.shadow) || settings.shadow < 0 || settings.shadow > 100) throw new Error('阴影必须在 0%–100% 之间')
  if (settings.title.length > 50) throw new Error('窗口标题不能超过 50 个字符')
}

export function computeScreenshotBeautifierLayout(
  imageWidth: number,
  imageHeight: number,
  settings: ScreenshotBeautifierSettings,
  maxSide: number,
  maxPixels: number,
): ScreenshotBeautifierLayout {
  assertScreenshotBeautifierSettings(settings)
  if (![imageWidth, imageHeight, maxSide, maxPixels].every((value) => Number.isFinite(value) && value > 0)) throw new Error('截图尺寸或安全预算无效')
  if (imageWidth * imageHeight > SCREENSHOT_BEAUTIFIER_MAX_SOURCE_PIXELS) throw new Error('图片解码后超过 8000 万像素安全上限')
  const shortSide = Math.min(imageWidth, imageHeight)
  const padding = Math.max(8, Math.round(shortSide * settings.paddingPercent / 100))
  const frameHeight = settings.frame === 'window' ? Math.max(20, Math.round(shortSide * 0.065)) : 0
  const contentWidth = imageWidth
  const contentHeight = imageHeight + frameHeight
  let rawWidth = contentWidth + padding * 2
  let rawHeight = contentHeight + padding * 2
  if (settings.aspect !== 'auto') {
    const ratio = aspectRatios[settings.aspect]
    if (rawWidth / rawHeight < ratio) rawWidth = Math.ceil(rawHeight * ratio)
    else rawHeight = Math.ceil(rawWidth / ratio)
  }
  const scale = Math.min(1, maxSide / Math.max(rawWidth, rawHeight), Math.sqrt(maxPixels / (rawWidth * rawHeight)))
  const width = Math.max(1, Math.floor(rawWidth * scale))
  const height = Math.max(1, Math.floor(rawHeight * scale))
  const scaledContentWidth = contentWidth * scale
  const scaledContentHeight = contentHeight * scale
  return {
    width,
    height,
    scale,
    imageX: (width - scaledContentWidth) / 2,
    imageY: (height - scaledContentHeight) / 2 + frameHeight * scale,
    imageWidth: imageWidth * scale,
    imageHeight: imageHeight * scale,
    frameHeight: frameHeight * scale,
    cornerRadius: shortSide * settings.cornerPercent / 100 * scale,
    padding: padding * scale,
  }
}

function safeStem(filename: string) {
  const stem = filename.replace(/\.[^.]+$/, '')
  const safe = [...stem].map((character) => character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '-' : character).join('').trim().slice(0, 48).replace(/[. ]+$/, '')
  if (!safe || safe === '.' || safe === '..') return 'screenshot'
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safe) ? `${safe}-file` : safe
}

export function beautifiedScreenshotFilename(filename: string, format: ImageOutputFormat) {
  return `${safeStem(filename)}-beautified.${format === 'jpeg' ? 'jpg' : format}`
}

function loadImage(source: Blob, label: string, signal?: AbortSignal) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    throwIfAborted(signal)
    const url = URL.createObjectURL(source)
    const image = new Image()
    const cleanup = () => { URL.revokeObjectURL(url); signal?.removeEventListener('abort', abort) }
    const abort = () => { cleanup(); image.src = ''; reject(new DOMException('已取消截图美化', 'AbortError')) }
    image.onload = () => { cleanup(); resolve(image) }
    image.onerror = () => { cleanup(); reject(new Error(`无法读取图片：${label}`)) }
    signal?.addEventListener('abort', abort, { once: true })
    image.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, format: ImageOutputFormat, quality: number, signal?: AbortSignal) {
  return new Promise<Blob>((resolve, reject) => {
    throwIfAborted(signal)
    const type = mimeTypes[format]
    canvas.toBlob((blob) => {
      try {
        throwIfAborted(signal)
        if (!blob || blob.type !== type) throw new Error(`当前设备无法生成 ${format.toUpperCase()} 图片`)
        resolve(blob)
      } catch (caught) { reject(caught) }
    }, type, quality)
  })
}

function fillBackground(context: CanvasRenderingContext2D, width: number, height: number, background: BeautifierBackground) {
  if (background === 'paper' || background === 'dark') {
    context.fillStyle = background === 'paper' ? '#F4F0E8' : '#17211B'
  } else {
    const gradient = context.createLinearGradient(0, 0, width, height)
    const colors: Record<Exclude<BeautifierBackground, 'paper' | 'dark'>, [string, string, string]> = {
      forest: ['#183D2A', '#3F8A59', '#B7D7A8'],
      ocean: ['#0B3C5D', '#2F80A3', '#9DE0E6'],
      sunset: ['#7A284B', '#E06B5F', '#F7C96B'],
      plum: ['#35234B', '#7E4E8C', '#D7A6CB'],
    }
    const selected = colors[background]
    gradient.addColorStop(0, selected[0]); gradient.addColorStop(0.55, selected[1]); gradient.addColorStop(1, selected[2])
    context.fillStyle = gradient
  }
  context.fillRect(0, 0, width, height)
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath()
  context.roundRect(x, y, width, height, Math.max(0, Math.min(radius, width / 2, height / 2)))
}

async function renderScreenshot(
  source: Blob,
  label: string,
  settings: ScreenshotBeautifierSettings,
  format: ImageOutputFormat,
  quality: number,
  maxSide: number,
  maxPixels: number,
  signal?: AbortSignal,
) {
  assertScreenshotBeautifierSettings(settings)
  if (!mimeTypes[format]) throw new Error('截图导出格式无效')
  if (!Number.isFinite(quality) || quality < 0.4 || quality > 1) throw new Error('JPEG/WebP 品质必须在 40%–100% 之间')
  const image = await loadImage(source, label, signal)
  const layout = computeScreenshotBeautifierLayout(image.naturalWidth, image.naturalHeight, settings, maxSide, maxPixels)
  const canvas = document.createElement('canvas')
  canvas.width = layout.width
  canvas.height = layout.height
  const context = canvas.getContext('2d', { alpha: format !== 'jpeg' })
  if (!context) throw new Error('当前设备无法创建截图美化画布')
  fillBackground(context, canvas.width, canvas.height, settings.background)
  const outerY = layout.imageY - layout.frameHeight
  const outerHeight = layout.imageHeight + layout.frameHeight
  context.save()
  if (settings.shadow > 0) {
    context.shadowColor = `rgba(0, 0, 0, ${0.12 + settings.shadow / 250})`
    context.shadowBlur = layout.padding * (0.35 + settings.shadow / 160)
    context.shadowOffsetY = layout.padding * 0.18
  }
  roundedRect(context, layout.imageX, outerY, layout.imageWidth, outerHeight, layout.cornerRadius)
  context.fillStyle = settings.frame === 'window' ? '#F8FAF8' : '#FFFFFF'
  context.fill()
  context.restore()
  context.save()
  roundedRect(context, layout.imageX, outerY, layout.imageWidth, outerHeight, layout.cornerRadius)
  context.clip()
  if (settings.frame === 'window') {
    context.fillStyle = '#F4F6F4'
    context.fillRect(layout.imageX, outerY, layout.imageWidth, layout.frameHeight)
    const dotRadius = Math.max(2, layout.frameHeight * 0.12)
    const dotY = outerY + layout.frameHeight / 2
    const dotStart = layout.imageX + layout.frameHeight * 0.42
    ;['#FF605C', '#FFBD44', '#00CA4E'].forEach((color, index) => {
      context.beginPath(); context.arc(dotStart + index * dotRadius * 2.7, dotY, dotRadius, 0, Math.PI * 2); context.fillStyle = color; context.fill()
    })
    if (settings.title.trim()) {
      context.fillStyle = '#56645B'
      context.font = `${Math.max(7, layout.frameHeight * 0.3)}px system-ui, sans-serif`
      context.textAlign = 'center'; context.textBaseline = 'middle'
      context.fillText(settings.title.trim(), layout.imageX + layout.imageWidth / 2, dotY, layout.imageWidth * 0.58)
    }
  }
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, layout.imageX, layout.imageY, layout.imageWidth, layout.imageHeight)
  context.restore()
  const blob = await canvasToBlob(canvas, format, quality, signal)
  return { blob, width: canvas.width, height: canvas.height }
}

export async function prepareScreenshotBeautifierSource(file: File, signal?: AbortSignal): Promise<PreparedScreenshotSource> {
  validateScreenshotBeautifierFile(file)
  const image = await loadImage(file, file.name, signal)
  if (image.naturalWidth * image.naturalHeight > SCREENSHOT_BEAUTIFIER_MAX_SOURCE_PIXELS) throw new Error('图片解码后超过 8000 万像素安全上限')
  const scale = Math.min(1, SCREENSHOT_BEAUTIFIER_PREVIEW_MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight), Math.sqrt(SCREENSHOT_BEAUTIFIER_PREVIEW_MAX_PIXELS / (image.naturalWidth * image.naturalHeight)))
  const previewWidth = Math.max(1, Math.floor(image.naturalWidth * scale))
  const previewHeight = Math.max(1, Math.floor(image.naturalHeight * scale))
  const canvas = document.createElement('canvas'); canvas.width = previewWidth; canvas.height = previewHeight
  const context = canvas.getContext('2d'); if (!context) throw new Error('当前设备无法创建截图预览画布')
  context.drawImage(image, 0, 0, previewWidth, previewHeight)
  const previewBlob = await canvasToBlob(canvas, 'png', 1, signal)
  return { file, filename: file.name, originalWidth: image.naturalWidth, originalHeight: image.naturalHeight, previewWidth, previewHeight, previewBlob }
}

export async function renderScreenshotBeautifierPreview(source: PreparedScreenshotSource, settings: ScreenshotBeautifierSettings, signal?: AbortSignal): Promise<RenderedBeautifiedScreenshot> {
  const rendered = await renderScreenshot(source.previewBlob, source.filename, settings, 'png', 1, SCREENSHOT_BEAUTIFIER_PREVIEW_MAX_SIDE, SCREENSHOT_BEAUTIFIER_PREVIEW_MAX_PIXELS, signal)
  return { ...rendered, filename: beautifiedScreenshotFilename(source.filename, 'png'), format: 'png', quality: null, settings: { ...settings } }
}

export async function exportBeautifiedScreenshot(source: PreparedScreenshotSource, settings: ScreenshotBeautifierSettings, format: ImageOutputFormat, quality: number, signal?: AbortSignal): Promise<RenderedBeautifiedScreenshot> {
  const rendered = await renderScreenshot(source.file, source.filename, settings, format, quality, SCREENSHOT_BEAUTIFIER_OUTPUT_MAX_SIDE, SCREENSHOT_BEAUTIFIER_OUTPUT_MAX_PIXELS, signal)
  return { ...rendered, filename: beautifiedScreenshotFilename(source.filename, format), format, quality: format === 'png' ? null : quality, settings: { ...settings } }
}

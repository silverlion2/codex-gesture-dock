export const CONTACT_SHEET_MAX_FILES = 20
export const CONTACT_SHEET_MAX_FILE_BYTES = 35 * 1024 * 1024
export const CONTACT_SHEET_MAX_TOTAL_BYTES = 200 * 1024 * 1024
export const CONTACT_SHEET_MAX_SIDE = 8_192
export const CONTACT_SHEET_MAX_PIXELS = 24_000_000

export type ContactSheetAspect = 'square' | 'landscape' | 'portrait'
export type ContactSheetFit = 'contain' | 'cover'
export type ContactSheetBackground = 'light' | 'dark'
export type ContactSheetSpacing = 'compact' | 'regular' | 'wide'

export interface ContactSheetOptions {
  columns: number
  width: number
  aspect: ContactSheetAspect
  fit: ContactSheetFit
  background: ContactSheetBackground
  spacing: ContactSheetSpacing
  showLabels: boolean
}

export interface ContactSheetSlot {
  x: number
  y: number
  width: number
  imageHeight: number
  labelHeight: number
}

export interface ContactSheetLayout {
  width: number
  height: number
  columns: number
  rows: number
  scale: number
  padding: number
  gap: number
  slots: ContactSheetSlot[]
}

export interface RenderedContactSheet {
  blob: Blob
  filename: string
  width: number
  height: number
  imageCount: number
  scale: number
}

interface RenderContactSheetHooks {
  signal?: AbortSignal
  onProgress?: (completed: number, total: number, filename: string) => void
}

const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp'])
const aspectRatios: Record<ContactSheetAspect, number> = { square: 1, landscape: 4 / 3, portrait: 3 / 4 }
const spacingRatios: Record<ContactSheetSpacing, number> = { compact: 0.006, regular: 0.012, wide: 0.02 }

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('已取消联系表生成', 'AbortError')
}

export function validateContactSheetFiles(files: File[]) {
  if (files.length < 2) throw new Error('请至少选择 2 张图片')
  if (files.length > CONTACT_SHEET_MAX_FILES) throw new Error(`一次最多选择 ${CONTACT_SHEET_MAX_FILES} 张图片`)
  let totalBytes = 0
  for (const file of files) {
    if (!supportedTypes.has(file.type)) throw new Error(`${file.name} 不是受支持的 PNG、JPEG、WebP 或 BMP 图片`)
    if (file.size > CONTACT_SHEET_MAX_FILE_BYTES) throw new Error(`${file.name} 超过 35 MB`)
    totalBytes += file.size
  }
  if (totalBytes > CONTACT_SHEET_MAX_TOTAL_BYTES) throw new Error('所选图片合计不能超过 200 MB')
}

function assertOptions(options: ContactSheetOptions) {
  if (!Number.isInteger(options.columns) || options.columns < 2 || options.columns > 5) throw new Error('联系表列数必须在 2–5 之间')
  if (!Number.isInteger(options.width) || options.width < 800 || options.width > 3_200) throw new Error('联系表宽度必须在 800–3200 像素之间')
  if (!aspectRatios[options.aspect] || !spacingRatios[options.spacing]) throw new Error('联系表布局设置无效')
  if (options.fit !== 'contain' && options.fit !== 'cover') throw new Error('联系表图片适配设置无效')
  if (options.background !== 'light' && options.background !== 'dark') throw new Error('联系表背景设置无效')
}

export function computeContactSheetLayout(itemCount: number, options: ContactSheetOptions): ContactSheetLayout {
  if (!Number.isInteger(itemCount) || itemCount < 2 || itemCount > CONTACT_SHEET_MAX_FILES) throw new Error('联系表必须包含 2–20 张图片')
  assertOptions(options)
  const columns = Math.min(options.columns, itemCount)
  const rows = Math.ceil(itemCount / columns)
  const rawGap = Math.max(6, Math.round(options.width * spacingRatios[options.spacing]))
  const rawPadding = rawGap
  const rawCellWidth = Math.floor((options.width - rawPadding * 2 - rawGap * (columns - 1)) / columns)
  const rawImageHeight = Math.max(1, Math.round(rawCellWidth / aspectRatios[options.aspect]))
  const rawLabelHeight = options.showLabels ? Math.max(28, Math.round(rawCellWidth * 0.14)) : 0
  const rawCellHeight = rawImageHeight + rawLabelHeight
  const rawHeight = rawPadding * 2 + rawCellHeight * rows + rawGap * (rows - 1)
  const scale = Math.min(
    1,
    CONTACT_SHEET_MAX_SIDE / Math.max(options.width, rawHeight),
    Math.sqrt(CONTACT_SHEET_MAX_PIXELS / (options.width * rawHeight)),
  )
  const width = Math.max(1, Math.floor(options.width * scale))
  const height = Math.max(1, Math.floor(rawHeight * scale))
  const gap = rawGap * scale
  const padding = rawPadding * scale
  const cellWidth = rawCellWidth * scale
  const imageHeight = rawImageHeight * scale
  const labelHeight = rawLabelHeight * scale
  const cellHeight = rawCellHeight * scale
  const slots = Array.from({ length: itemCount }, (_, index) => ({
    x: padding + (index % columns) * (cellWidth + gap),
    y: padding + Math.floor(index / columns) * (cellHeight + gap),
    width: cellWidth,
    imageHeight,
    labelHeight,
  }))
  return { width, height, columns, rows, scale, padding, gap, slots }
}

export function fitContactSheetImage(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  fit: ContactSheetFit,
) {
  if (![sourceWidth, sourceHeight, targetWidth, targetHeight].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error('联系表图片尺寸无效')
  }
  if (fit !== 'contain' && fit !== 'cover') throw new Error('联系表图片适配设置无效')
  if (fit === 'contain') {
    const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight)
    const width = sourceWidth * scale
    const height = sourceHeight * scale
    return {
      sx: 0,
      sy: 0,
      sw: sourceWidth,
      sh: sourceHeight,
      dx: (targetWidth - width) / 2,
      dy: (targetHeight - height) / 2,
      dw: width,
      dh: height,
    }
  }
  const sourceRatio = sourceWidth / sourceHeight
  const targetRatio = targetWidth / targetHeight
  if (sourceRatio > targetRatio) {
    const width = sourceHeight * targetRatio
    return { sx: (sourceWidth - width) / 2, sy: 0, sw: width, sh: sourceHeight, dx: 0, dy: 0, dw: targetWidth, dh: targetHeight }
  }
  const height = sourceWidth / targetRatio
  return { sx: 0, sy: (sourceHeight - height) / 2, sw: sourceWidth, sh: height, dx: 0, dy: 0, dw: targetWidth, dh: targetHeight }
}

function safeStem(filename: string) {
  const stem = filename.replace(/\.[^.]+$/, '')
  const safe = [...stem]
    .map((character) => character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '-' : character)
    .join('')
    .trim()
    .slice(0, 48)
    .replace(/[. ]+$/, '')
  if (!safe || safe === '.' || safe === '..') return 'images'
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safe) ? `${safe}-file` : safe
}

export function contactSheetFilename(firstFilename: string, count: number) {
  return `${safeStem(firstFilename)}-contact-sheet-${Math.max(2, Math.min(CONTACT_SHEET_MAX_FILES, Math.round(count)))}.png`
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
      reject(new DOMException('已取消联系表生成', 'AbortError'))
    }
    image.onload = () => {
      cleanup()
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        reject(new Error(`图片尺寸无效：${file.name}`))
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

function canvasToPng(canvas: HTMLCanvasElement, signal?: AbortSignal) {
  return new Promise<Blob>((resolve, reject) => {
    throwIfAborted(signal)
    canvas.toBlob((blob) => {
      try {
        throwIfAborted(signal)
        if (!blob || blob.type !== 'image/png') throw new Error('当前设备无法生成联系表 PNG')
        resolve(blob)
      } catch (caught) {
        reject(caught)
      }
    }, 'image/png')
  })
}

function drawFittedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  slot: ContactSheetSlot,
  fit: ContactSheetFit,
) {
  const placement = fitContactSheetImage(image.naturalWidth, image.naturalHeight, slot.width, slot.imageHeight, fit)
  context.drawImage(
    image,
    placement.sx,
    placement.sy,
    placement.sw,
    placement.sh,
    slot.x + placement.dx,
    slot.y + placement.dy,
    placement.dw,
    placement.dh,
  )
}

function drawLabel(
  context: CanvasRenderingContext2D,
  slot: ContactSheetSlot,
  filename: string,
  index: number,
  dark: boolean,
) {
  if (slot.labelHeight <= 0) return
  const y = slot.y + slot.imageHeight
  const fontSize = Math.max(11, Math.min(24, slot.labelHeight * 0.36))
  const badgeRadius = Math.max(8, fontSize * 0.72)
  const padding = Math.max(7, slot.labelHeight * 0.16)
  context.fillStyle = dark ? '#151D18' : '#F1F4F2'
  context.fillRect(slot.x, y, slot.width, slot.labelHeight)
  context.fillStyle = dark ? '#78C68E' : '#278A52'
  context.beginPath()
  context.arc(slot.x + padding + badgeRadius, y + slot.labelHeight / 2, badgeRadius, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = '#FFFFFF'
  context.font = `700 ${fontSize.toFixed(1)}px sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(String(index + 1), slot.x + padding + badgeRadius, y + slot.labelHeight / 2)
  const textX = slot.x + padding + badgeRadius * 2 + padding
  const maxTextWidth = Math.max(1, slot.x + slot.width - padding - textX)
  context.fillStyle = dark ? '#F2F7F3' : '#263C2D'
  context.textAlign = 'left'
  let label = filename
  while (label.length > 1 && context.measureText(label).width > maxTextWidth) label = `${label.slice(0, -2)}…`
  context.fillText(label, textX, y + slot.labelHeight / 2, maxTextWidth)
}

export async function renderContactSheet(
  files: File[],
  options: ContactSheetOptions,
  { signal, onProgress }: RenderContactSheetHooks = {},
): Promise<RenderedContactSheet> {
  validateContactSheetFiles(files)
  const layout = computeContactSheetLayout(files.length, options)
  const canvas = document.createElement('canvas')
  canvas.width = layout.width
  canvas.height = layout.height
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('当前设备无法创建联系表画布')
  const dark = options.background === 'dark'
  context.fillStyle = dark ? '#202923' : '#FFFFFF'
  context.fillRect(0, 0, layout.width, layout.height)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'

  for (let index = 0; index < files.length; index += 1) {
    throwIfAborted(signal)
    const file = files[index]
    const slot = layout.slots[index]
    const image = await loadFileImage(file, signal)
    context.fillStyle = dark ? '#101713' : '#E8ECE9'
    context.fillRect(slot.x, slot.y, slot.width, slot.imageHeight)
    drawFittedImage(context, image, slot, options.fit)
    drawLabel(context, slot, file.name, index, dark)
    onProgress?.(index + 1, files.length, file.name)
  }

  const blob = await canvasToPng(canvas, signal)
  return {
    blob,
    filename: contactSheetFilename(files[0].name, files.length),
    width: layout.width,
    height: layout.height,
    imageCount: files.length,
    scale: layout.scale,
  }
}

export const LONG_IMAGE_MAX_JOIN_FILES = 12
export const LONG_IMAGE_MAX_FILE_BYTES = 35 * 1024 * 1024
export const LONG_IMAGE_MAX_TOTAL_BYTES = 160 * 1024 * 1024
export const LONG_IMAGE_MAX_SOURCE_PIXELS = 80_000_000
export const LONG_IMAGE_MAX_SIDE = 8_192
export const LONG_IMAGE_MAX_PIXELS = 24_000_000

export type LongImageDirection = 'vertical' | 'horizontal'
export type LongImageBackground = 'light' | 'dark' | 'transparent'

export interface LongImageDimensions {
  width: number
  height: number
}

export interface LongImageJoinOptions {
  direction: LongImageDirection
  gap: 0 | 8 | 24
  background: LongImageBackground
}

export interface LongImageJoinSlot {
  sx: number
  sy: number
  sw: number
  sh: number
  dx: number
  dy: number
  dw: number
  dh: number
}

export interface LongImageJoinLayout {
  width: number
  height: number
  scale: number
  commonCrossAxis: number
  slots: LongImageJoinSlot[]
}

export interface LongImageSplitPart {
  index: number
  sx: number
  sy: number
  sw: number
  sh: number
  width: number
  height: number
}

export interface LongImageSplitLayout {
  sourceWidth: number
  sourceHeight: number
  scale: number
  parts: LongImageSplitPart[]
}

export interface RenderedLongImageJoin {
  blob: Blob
  filename: string
  width: number
  height: number
  imageCount: number
  scale: number
}

export interface RenderedLongImageSplitPart extends LongImageSplitPart {
  blob: Blob
  filename: string
}

export interface RenderedLongImageSplit {
  parts: RenderedLongImageSplitPart[]
  sourceWidth: number
  sourceHeight: number
  scale: number
}

interface RenderHooks {
  signal?: AbortSignal
  onProgress?: (completed: number, total: number, filename: string) => void
}

const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp'])

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('已取消长图处理', 'AbortError')
}

function assertDirection(direction: LongImageDirection) {
  if (direction !== 'vertical' && direction !== 'horizontal') throw new Error('长图方向设置无效')
}

function assertDimensions({ width, height }: LongImageDimensions) {
  if (![width, height].every((value) => Number.isFinite(value) && value > 0)) throw new Error('图片尺寸无效')
  if (width * height > LONG_IMAGE_MAX_SOURCE_PIXELS) throw new Error('图片解码后超过 8000 万像素安全上限')
}

function assertFile(file: File) {
  if (!supportedTypes.has(file.type)) throw new Error(`${file.name} 不是受支持的 PNG、JPEG、WebP 或 BMP 图片`)
  if (file.size > LONG_IMAGE_MAX_FILE_BYTES) throw new Error(`${file.name} 超过 35 MB`)
}

export function validateLongImageJoinFiles(files: File[]) {
  if (files.length < 2) throw new Error('请至少选择 2 张图片')
  if (files.length > LONG_IMAGE_MAX_JOIN_FILES) throw new Error(`一次最多选择 ${LONG_IMAGE_MAX_JOIN_FILES} 张图片`)
  let total = 0
  for (const file of files) {
    assertFile(file)
    total += file.size
  }
  if (total > LONG_IMAGE_MAX_TOTAL_BYTES) throw new Error('所选图片合计不能超过 160 MB')
}

export function validateLongImageSplitFile(file: File) {
  assertFile(file)
}

function assertTrimPercent(value: number, index: number) {
  if (!Number.isFinite(value) || value < 0 || value > 50) throw new Error(`第 ${index + 1} 张图片的裁去比例必须在 0%–50% 之间`)
}

export function computeLongImageJoinLayout(
  dimensions: LongImageDimensions[],
  trimPercents: number[],
  options: LongImageJoinOptions,
): LongImageJoinLayout {
  if (dimensions.length < 2 || dimensions.length > LONG_IMAGE_MAX_JOIN_FILES) throw new Error('长图拼接必须包含 2–12 张图片')
  if (trimPercents.length !== dimensions.length) throw new Error('图片与裁去设置数量不一致')
  assertDirection(options.direction)
  if (![0, 8, 24].includes(options.gap)) throw new Error('长图间距设置无效')
  if (!['light', 'dark', 'transparent'].includes(options.background)) throw new Error('长图背景设置无效')
  dimensions.forEach(assertDimensions)
  trimPercents.forEach(assertTrimPercent)

  const vertical = options.direction === 'vertical'
  const commonCrossAxis = Math.min(...dimensions.map((item) => vertical ? item.width : item.height))
  const rawSlots: LongImageJoinSlot[] = []
  let cursor = 0

  dimensions.forEach((item, index) => {
    const trim = index === 0 ? 0 : trimPercents[index] / 100
    const sx = vertical ? 0 : item.width * trim
    const sy = vertical ? item.height * trim : 0
    const sw = vertical ? item.width : item.width - sx
    const sh = vertical ? item.height - sy : item.height
    const crossScale = commonCrossAxis / (vertical ? sw : sh)
    const dw = sw * crossScale
    const dh = sh * crossScale
    rawSlots.push({ sx, sy, sw, sh, dx: vertical ? 0 : cursor, dy: vertical ? cursor : 0, dw, dh })
    cursor += (vertical ? dh : dw) + (index < dimensions.length - 1 ? options.gap : 0)
  })

  const rawWidth = vertical ? commonCrossAxis : cursor
  const rawHeight = vertical ? cursor : commonCrossAxis
  const scale = Math.min(
    1,
    LONG_IMAGE_MAX_SIDE / Math.max(rawWidth, rawHeight),
    Math.sqrt(LONG_IMAGE_MAX_PIXELS / (rawWidth * rawHeight)),
  )
  const width = Math.max(1, Math.floor(rawWidth * scale))
  const height = Math.max(1, Math.floor(rawHeight * scale))
  const slots = rawSlots.map((slot) => ({
    ...slot,
    dx: slot.dx * scale,
    dy: slot.dy * scale,
    dw: slot.dw * scale,
    dh: slot.dh * scale,
  }))
  return { width, height, scale, commonCrossAxis, slots }
}

export function computeLongImageSplitLayout(
  dimensions: LongImageDimensions,
  direction: LongImageDirection,
  count: number,
): LongImageSplitLayout {
  assertDimensions(dimensions)
  assertDirection(direction)
  if (!Number.isInteger(count) || count < 2 || count > 12) throw new Error('长图拆分份数必须在 2–12 之间')
  const vertical = direction === 'vertical'
  const main = vertical ? dimensions.height : dimensions.width
  const cross = vertical ? dimensions.width : dimensions.height
  const largestPartMain = Math.ceil(main / count)
  const scale = Math.min(
    1,
    LONG_IMAGE_MAX_SIDE / Math.max(cross, largestPartMain),
    Math.sqrt(LONG_IMAGE_MAX_PIXELS / (cross * largestPartMain)),
  )
  const parts = Array.from({ length: count }, (_, index) => {
    const start = Math.round(index * main / count)
    const end = Math.round((index + 1) * main / count)
    const partMain = end - start
    return {
      index,
      sx: vertical ? 0 : start,
      sy: vertical ? start : 0,
      sw: vertical ? dimensions.width : partMain,
      sh: vertical ? partMain : dimensions.height,
      width: Math.max(1, Math.round((vertical ? cross : partMain) * scale)),
      height: Math.max(1, Math.round((vertical ? partMain : cross) * scale)),
    }
  })
  return { sourceWidth: dimensions.width, sourceHeight: dimensions.height, scale, parts }
}

function safeStem(filename: string) {
  const stem = filename.replace(/\.[^.]+$/, '')
  const safe = [...stem]
    .map((character) => character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '-' : character)
    .join('')
    .trim()
    .slice(0, 48)
    .replace(/[. ]+$/, '')
  if (!safe || safe === '.' || safe === '..') return 'image'
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safe) ? `${safe}-file` : safe
}

export function longImageJoinFilename(firstFilename: string, direction: LongImageDirection) {
  return `${safeStem(firstFilename)}-${direction === 'vertical' ? 'vertical' : 'horizontal'}-long-image.png`
}

export function longImageSplitFilename(filename: string, index: number, count: number) {
  const width = String(count).length
  return `${safeStem(filename)}-part-${String(index + 1).padStart(width, '0')}-of-${count}.png`
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
      reject(new DOMException('已取消长图处理', 'AbortError'))
    }
    image.onload = () => {
      cleanup()
      try {
        assertDimensions({ width: image.naturalWidth, height: image.naturalHeight })
        resolve(image)
      } catch (caught) {
        reject(caught)
      }
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
        if (!blob || blob.type !== 'image/png') throw new Error('当前设备无法生成长图 PNG')
        resolve(blob)
      } catch (caught) {
        reject(caught)
      }
    }, 'image/png')
  })
}

export async function renderLongImageJoin(
  files: File[],
  trimPercents: number[],
  options: LongImageJoinOptions,
  { signal, onProgress }: RenderHooks = {},
): Promise<RenderedLongImageJoin> {
  validateLongImageJoinFiles(files)
  const dimensions: LongImageDimensions[] = []
  for (let index = 0; index < files.length; index += 1) {
    const image = await loadFileImage(files[index], signal)
    dimensions.push({ width: image.naturalWidth, height: image.naturalHeight })
  }
  const layout = computeLongImageJoinLayout(dimensions, trimPercents, options)
  const canvas = document.createElement('canvas')
  canvas.width = layout.width
  canvas.height = layout.height
  const context = canvas.getContext('2d', { alpha: options.background === 'transparent' })
  if (!context) throw new Error('当前设备无法创建长图画布')
  if (options.background !== 'transparent') {
    context.fillStyle = options.background === 'dark' ? '#202923' : '#FFFFFF'
    context.fillRect(0, 0, canvas.width, canvas.height)
  }
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  for (let index = 0; index < files.length; index += 1) {
    throwIfAborted(signal)
    const image = await loadFileImage(files[index], signal)
    const slot = layout.slots[index]
    context.drawImage(image, slot.sx, slot.sy, slot.sw, slot.sh, slot.dx, slot.dy, slot.dw, slot.dh)
    onProgress?.(index + 1, files.length, files[index].name)
  }
  const blob = await canvasToPng(canvas, signal)
  return {
    blob,
    filename: longImageJoinFilename(files[0].name, options.direction),
    width: layout.width,
    height: layout.height,
    imageCount: files.length,
    scale: layout.scale,
  }
}

export async function renderLongImageSplit(
  file: File,
  direction: LongImageDirection,
  count: number,
  { signal, onProgress }: RenderHooks = {},
): Promise<RenderedLongImageSplit> {
  validateLongImageSplitFile(file)
  const image = await loadFileImage(file, signal)
  const layout = computeLongImageSplitLayout({ width: image.naturalWidth, height: image.naturalHeight }, direction, count)
  const parts: RenderedLongImageSplitPart[] = []
  for (const part of layout.parts) {
    throwIfAborted(signal)
    const canvas = document.createElement('canvas')
    canvas.width = part.width
    canvas.height = part.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前设备无法创建长图拆分画布')
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, part.sx, part.sy, part.sw, part.sh, 0, 0, part.width, part.height)
    const blob = await canvasToPng(canvas, signal)
    parts.push({ ...part, blob, filename: longImageSplitFilename(file.name, part.index, count) })
    onProgress?.(part.index + 1, count, file.name)
  }
  return { parts, sourceWidth: layout.sourceWidth, sourceHeight: layout.sourceHeight, scale: layout.scale }
}

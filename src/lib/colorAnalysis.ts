import { getPalette } from 'colorthief'

export const COLOR_ANALYSIS_MAX_FILE_BYTES = 35 * 1024 * 1024
export const COLOR_ANALYSIS_MAX_SIDE = 2_400
export const COLOR_ANALYSIS_MAX_PIXELS = 4_000_000

export interface RgbColor {
  r: number
  g: number
  b: number
}

export interface SampledColor extends RgbColor {
  hex: string
}

export interface PaletteColor extends SampledColor {
  oklch: { l: number; c: number; h: number }
  proportion: number
  textColor: string
  contrastWhite: number
  contrastBlack: number
}

export interface PreparedColorAnalysis {
  filename: string
  dataUrl: string
  originalWidth: number
  originalHeight: number
  width: number
  height: number
  scale: number
  pixels: Uint8ClampedArray
  palette: PaletteColor[]
}

export interface ContrastReport {
  ratio: number
  aaNormal: boolean
  aaLarge: boolean
  aaaNormal: boolean
  aaaLarge: boolean
}

const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp'])

function assertImageFile(file: File) {
  if (!supportedTypes.has(file.type)) throw new Error('请选择 PNG、JPEG、WebP 或 BMP 图片')
  if (file.size > COLOR_ANALYSIS_MAX_FILE_BYTES) throw new Error('图片不能超过 35 MB')
}

function loadFileImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        reject(new Error('图片尺寸无效'))
        return
      }
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`无法读取图片：${file.name}`))
    }
    image.src = url
  })
}

export function computeColorCanvasSize(width: number, height: number) {
  if (![width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error('图片尺寸无效')
  }
  const scale = Math.min(
    1,
    COLOR_ANALYSIS_MAX_SIDE / Math.max(width, height),
    Math.sqrt(COLOR_ANALYSIS_MAX_PIXELS / (width * height)),
  )
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  }
}

function channelLuminance(channel: number) {
  const value = Math.max(0, Math.min(255, channel)) / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(color: RgbColor) {
  return channelLuminance(color.r) * 0.2126
    + channelLuminance(color.g) * 0.7152
    + channelLuminance(color.b) * 0.0722
}

export function contrastRatio(first: RgbColor, second: RgbColor) {
  const firstLuminance = relativeLuminance(first)
  const secondLuminance = relativeLuminance(second)
  const lighter = Math.max(firstLuminance, secondLuminance)
  const darker = Math.min(firstLuminance, secondLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

export function evaluateContrast(foreground: RgbColor, background: RgbColor): ContrastReport {
  const ratio = contrastRatio(foreground, background)
  return {
    ratio,
    aaNormal: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaaNormal: ratio >= 7,
    aaaLarge: ratio >= 4.5,
  }
}

function boundedChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

export function rgbToHex(color: RgbColor) {
  return `#${[color.r, color.g, color.b]
    .map((value) => boundedChannel(value).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase()
}

export function hexToRgb(hex: string): SampledColor | null {
  const match = /^#?([\da-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const value = Number.parseInt(match[1], 16)
  const color = {
    r: value >> 16,
    g: (value >> 8) & 255,
    b: value & 255,
  }
  return { ...color, hex: rgbToHex(color) }
}

export function sampleColor(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  normalizedX: number,
  normalizedY: number,
): SampledColor {
  if (width <= 0 || height <= 0 || pixels.length !== width * height * 4) {
    throw new Error('图片采样像素尺寸不一致')
  }
  const x = Math.min(width - 1, Math.max(0, Math.floor(normalizedX * width)))
  const y = Math.min(height - 1, Math.max(0, Math.floor(normalizedY * height)))
  const offset = (y * width + x) * 4
  const color = { r: pixels[offset], g: pixels[offset + 1], b: pixels[offset + 2] }
  return { ...color, hex: rgbToHex(color) }
}

export function paletteCss(colors: PaletteColor[]) {
  return `:root {\n${colors.map((color, index) => `  --image-color-${index + 1}: ${color.hex};`).join('\n')}\n}`
}

export function paletteJson(colors: PaletteColor[]) {
  return JSON.stringify(colors.map(({ hex, r, g, b, oklch, proportion }) => ({
    hex,
    rgb: { r, g, b },
    oklch,
    proportion,
  })), null, 2)
}

export async function prepareColorAnalysis(file: File, signal?: AbortSignal): Promise<PreparedColorAnalysis> {
  assertImageFile(file)
  const image = await loadFileImage(file)
  if (signal?.aborted) throw new DOMException('已取消颜色分析', 'AbortError')
  const size = computeColorCanvasSize(image.naturalWidth, image.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true })
  if (!context) throw new Error('当前设备无法创建颜色分析画布')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, size.width, size.height)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, size.width, size.height)
  const extracted = await getPalette(canvas, {
    colorCount: 6,
    quality: 8,
    colorSpace: 'oklch',
    ignoreWhite: true,
    signal,
  })
  if (!extracted?.length) throw new Error('未能从图片中提取有效颜色')
  const seenColors = new Set<string>()
  const palette = extracted.flatMap((color) => {
    if (color.proportion <= 0) return []
    const rgb = color.rgb()
    const oklch = color.oklch()
    const hex = color.hex().toUpperCase()
    if (seenColors.has(hex)) return []
    seenColors.add(hex)
    return [{
      r: boundedChannel(rgb.r),
      g: boundedChannel(rgb.g),
      b: boundedChannel(rgb.b),
      hex,
      oklch: {
        l: Number(oklch.l.toFixed(4)),
        c: Number(oklch.c.toFixed(4)),
        h: Number(oklch.h.toFixed(2)),
      },
      proportion: color.proportion,
      textColor: color.textColor,
      contrastWhite: color.contrast.white,
      contrastBlack: color.contrast.black,
    }]
  })
  if (!palette.length) throw new Error('未能从图片中提取有效颜色')
  return {
    filename: file.name,
    dataUrl: canvas.toDataURL('image/png'),
    originalWidth: image.naturalWidth,
    originalHeight: image.naturalHeight,
    width: size.width,
    height: size.height,
    scale: size.scale,
    pixels: context.getImageData(0, 0, size.width, size.height).data,
    palette,
  }
}

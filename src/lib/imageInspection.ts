export const IMAGE_INSPECTION_MAX_FILE_BYTES = 35 * 1024 * 1024
export const IMAGE_INSPECTION_MAX_SIDE = 2_400
export const IMAGE_INSPECTION_MAX_PIXELS = 4_000_000
export const IMAGE_INSPECTION_HISTOGRAM_BINS = 64

export type ImageOrientation = 'landscape' | 'portrait' | 'square'
export type ImageInspectionSignalCode =
  | 'shadow-clipping'
  | 'highlight-clipping'
  | 'low-contrast'
  | 'low-edge-detail'
  | 'transparency'

export interface ImageInspectionSignal {
  code: ImageInspectionSignalCode
  label: string
  guidance: string
}

export interface ImageHistogram {
  bins: number
  luminance: number[]
  red: number[]
  green: number[]
  blue: number[]
}

export interface ImageInspectionReport {
  filename: string
  mimeType: string
  fileSize: number
  originalWidth: number
  originalHeight: number
  analysisWidth: number
  analysisHeight: number
  scale: number
  orientation: ImageOrientation
  aspectRatio: string
  visiblePixels: number
  meanLuminance: number
  contrast: number
  sharpness: number
  shadowClipRatio: number
  highlightClipRatio: number
  transparentRatio: number
  partialTransparencyRatio: number
  histogram: ImageHistogram
  signals: ImageInspectionSignal[]
}

export interface PreparedImageInspection {
  report: ImageInspectionReport
  previewBlob: Blob
}

const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp'])

const signalDetails: Record<ImageInspectionSignalCode, Omit<ImageInspectionSignal, 'code'>> = {
  'shadow-clipping': {
    label: '暗部可能截断',
    guidance: '接近纯黑的可见像素超过 1%；请检查阴影中是否仍保留需要的细节。',
  },
  'highlight-clipping': {
    label: '亮部可能截断',
    guidance: '接近纯白的可见像素超过 1%；请检查高光或浅色文字是否丢失细节。',
  },
  'low-contrast': {
    label: '整体亮度变化较小',
    guidance: '亮度标准差较低；这可能是低对比照片，也可能只是刻意使用平坦色块。',
  },
  'low-edge-detail': {
    label: '边缘响应较低',
    guidance: '拉普拉斯边缘响应较低；照片可能失焦，但纯色、插画和柔焦内容也会得到相同信号。',
  },
  transparency: {
    label: '包含透明像素',
    guidance: '曝光和直方图排除完全透明像素；在不同背景上显示时，视觉结果可能变化。',
  },
}

function signal(code: ImageInspectionSignalCode): ImageInspectionSignal {
  return { code, ...signalDetails[code] }
}

function assertImageFile(file: File) {
  if (!supportedTypes.has(file.type)) throw new Error('请选择 PNG、JPEG、WebP 或 BMP 图片')
  if (file.size > IMAGE_INSPECTION_MAX_FILE_BYTES) throw new Error('图片不能超过 35 MB')
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

function canvasToBlob(canvas: HTMLCanvasElement, signal?: AbortSignal) {
  return new Promise<Blob>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('已取消图片检查', 'AbortError'))
      return
    }
    canvas.toBlob((blob) => {
      if (signal?.aborted) {
        reject(new DOMException('已取消图片检查', 'AbortError'))
        return
      }
      if (!blob || blob.type !== 'image/png') {
        reject(new Error('当前设备无法生成检查预览'))
        return
      }
      resolve(blob)
    }, 'image/png')
  })
}

function gcd(first: number, second: number) {
  let a = Math.max(1, Math.round(first))
  let b = Math.max(1, Math.round(second))
  while (b !== 0) {
    const remainder = a % b
    a = b
    b = remainder
  }
  return a
}

function rounded(value: number, digits = 1) {
  return Number(value.toFixed(digits))
}

function luminance(red: number, green: number, blue: number) {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722
}

function visibleLuminanceAt(pixels: Uint8ClampedArray, width: number, x: number, y: number) {
  const offset = (y * width + x) * 4
  if (pixels[offset + 3] === 0) return null
  return luminance(pixels[offset], pixels[offset + 1], pixels[offset + 2])
}

export function computeImageInspectionSize(width: number, height: number) {
  if (![width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error('图片尺寸无效')
  }
  const scale = Math.min(
    1,
    IMAGE_INSPECTION_MAX_SIDE / Math.max(width, height),
    Math.sqrt(IMAGE_INSPECTION_MAX_PIXELS / (width * height)),
  )
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
    scale,
  }
}

interface PixelAnalysisMetadata {
  filename?: string
  mimeType?: string
  fileSize?: number
  originalWidth?: number
  originalHeight?: number
  scale?: number
}

export function analyzeImageInspectionPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  metadata: PixelAnalysisMetadata = {},
): ImageInspectionReport {
  if (width < 1 || height < 1 || pixels.byteLength < width * height * 4) {
    throw new Error('无法分析无效的图像像素数据')
  }
  const histogram = {
    luminance: new Uint32Array(IMAGE_INSPECTION_HISTOGRAM_BINS),
    red: new Uint32Array(IMAGE_INSPECTION_HISTOGRAM_BINS),
    green: new Uint32Array(IMAGE_INSPECTION_HISTOGRAM_BINS),
    blue: new Uint32Array(IMAGE_INSPECTION_HISTOGRAM_BINS),
  }
  let visiblePixels = 0
  let transparentPixels = 0
  let partialTransparencyPixels = 0
  let luminanceSum = 0
  let luminanceSquaredSum = 0
  let shadowPixels = 0
  let highlightPixels = 0

  for (let offset = 0; offset < width * height * 4; offset += 4) {
    const alpha = pixels[offset + 3]
    if (alpha === 0) {
      transparentPixels += 1
      continue
    }
    if (alpha < 255) partialTransparencyPixels += 1
    const red = pixels[offset]
    const green = pixels[offset + 1]
    const blue = pixels[offset + 2]
    const light = luminance(red, green, blue)
    visiblePixels += 1
    luminanceSum += light
    luminanceSquaredSum += light * light
    if (light <= 5) shadowPixels += 1
    if (light >= 250) highlightPixels += 1
    histogram.luminance[Math.min(63, Math.floor(light / 4))] += 1
    histogram.red[Math.min(63, Math.floor(red / 4))] += 1
    histogram.green[Math.min(63, Math.floor(green / 4))] += 1
    histogram.blue[Math.min(63, Math.floor(blue / 4))] += 1
  }

  if (visiblePixels === 0) throw new Error('图片没有可分析的可见像素')

  const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / 60_000)))
  let laplacianSum = 0
  let laplacianCount = 0
  for (let y = stride; y + stride < height; y += stride) {
    for (let x = stride; x + stride < width; x += stride) {
      const center = visibleLuminanceAt(pixels, width, x, y)
      const left = visibleLuminanceAt(pixels, width, x - stride, y)
      const right = visibleLuminanceAt(pixels, width, x + stride, y)
      const top = visibleLuminanceAt(pixels, width, x, y - stride)
      const bottom = visibleLuminanceAt(pixels, width, x, y + stride)
      if ([center, left, right, top, bottom].some((value) => value === null)) continue
      laplacianSum += Math.abs(4 * center! - left! - right! - top! - bottom!)
      laplacianCount += 1
    }
  }

  const meanLuminance = luminanceSum / visiblePixels
  const variance = Math.max(0, luminanceSquaredSum / visiblePixels - meanLuminance * meanLuminance)
  const contrast = Math.sqrt(variance)
  const sharpness = laplacianCount > 0 ? laplacianSum / laplacianCount : 0
  const shadowClipRatio = shadowPixels / visiblePixels
  const highlightClipRatio = highlightPixels / visiblePixels
  const totalPixels = width * height
  const transparentRatio = transparentPixels / totalPixels
  const partialTransparencyRatio = partialTransparencyPixels / totalPixels
  const originalWidth = metadata.originalWidth ?? width
  const originalHeight = metadata.originalHeight ?? height
  const divisor = gcd(originalWidth, originalHeight)
  const orientation: ImageOrientation = originalWidth === originalHeight
    ? 'square'
    : originalWidth > originalHeight ? 'landscape' : 'portrait'
  const signals: ImageInspectionSignal[] = []
  if (shadowClipRatio > 0.01) signals.push(signal('shadow-clipping'))
  if (highlightClipRatio > 0.01) signals.push(signal('highlight-clipping'))
  if (contrast < 22) signals.push(signal('low-contrast'))
  if (laplacianCount > 0 && contrast >= 22 && sharpness < 5.5) signals.push(signal('low-edge-detail'))
  if (transparentRatio > 0 || partialTransparencyRatio > 0) signals.push(signal('transparency'))

  return {
    filename: metadata.filename ?? 'image',
    mimeType: metadata.mimeType ?? 'application/octet-stream',
    fileSize: metadata.fileSize ?? 0,
    originalWidth,
    originalHeight,
    analysisWidth: width,
    analysisHeight: height,
    scale: metadata.scale ?? 1,
    orientation,
    aspectRatio: `${originalWidth / divisor}:${originalHeight / divisor}`,
    visiblePixels,
    meanLuminance: rounded(meanLuminance),
    contrast: rounded(contrast),
    sharpness: rounded(sharpness),
    shadowClipRatio: rounded(shadowClipRatio, 6),
    highlightClipRatio: rounded(highlightClipRatio, 6),
    transparentRatio: rounded(transparentRatio, 6),
    partialTransparencyRatio: rounded(partialTransparencyRatio, 6),
    histogram: {
      bins: IMAGE_INSPECTION_HISTOGRAM_BINS,
      luminance: Array.from(histogram.luminance),
      red: Array.from(histogram.red),
      green: Array.from(histogram.green),
      blue: Array.from(histogram.blue),
    },
    signals,
  }
}

export function imageInspectionFilename(filename: string) {
  const cleaned = filename.replace(/\.[^.]+$/, '').split('').map((character) => (
    character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? '-' : character
  )).join('').trim().slice(0, 64).replace(/[. ]+$/, '')
  const fallback = !cleaned || cleaned === '.' || cleaned === '..' ? 'image' : cleaned
  const stem = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(fallback) ? `${fallback}-file` : fallback
  return `${stem.slice(0, 120)}-inspection.json`
}

export function imageInspectionJson(report: ImageInspectionReport) {
  return JSON.stringify({
    schema: 'local-image-inspection',
    version: 1,
    source: {
      filename: report.filename,
      mimeType: report.mimeType,
      fileSize: report.fileSize,
      width: report.originalWidth,
      height: report.originalHeight,
      orientation: report.orientation,
      aspectRatio: report.aspectRatio,
    },
    analysis: {
      width: report.analysisWidth,
      height: report.analysisHeight,
      scale: report.scale,
      visiblePixels: report.visiblePixels,
      meanLuminance: report.meanLuminance,
      contrast: report.contrast,
      sharpness: report.sharpness,
      shadowClipRatio: report.shadowClipRatio,
      highlightClipRatio: report.highlightClipRatio,
      transparentRatio: report.transparentRatio,
      partialTransparencyRatio: report.partialTransparencyRatio,
      histogram: report.histogram,
      signals: report.signals.map(({ code, label }) => ({ code, label })),
    },
    limitations: 'Pixel diagnostics only; not a subjective quality, focus, authenticity, or accessibility verdict.',
  }, null, 2)
}

export async function prepareImageInspection(file: File, signal?: AbortSignal): Promise<PreparedImageInspection> {
  assertImageFile(file)
  const image = await loadFileImage(file)
  if (signal?.aborted) throw new DOMException('已取消图片检查', 'AbortError')
  const size = computeImageInspectionSize(image.naturalWidth, image.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true })
  if (!context) throw new Error('当前设备无法创建图片检查画布')
  context.clearRect(0, 0, size.width, size.height)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, size.width, size.height)
  const pixels = context.getImageData(0, 0, size.width, size.height).data
  const report = analyzeImageInspectionPixels(pixels, size.width, size.height, {
    filename: file.name,
    mimeType: file.type,
    fileSize: file.size,
    originalWidth: image.naturalWidth,
    originalHeight: image.naturalHeight,
    scale: size.scale,
  })
  const previewBlob = await canvasToBlob(canvas, signal)
  return { report, previewBlob }
}

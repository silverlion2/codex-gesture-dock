import pixelmatch from 'pixelmatch'

export const IMAGE_COMPARISON_MAX_FILE_BYTES = 35 * 1024 * 1024
export const IMAGE_COMPARISON_MAX_SIDE = 2_400
export const IMAGE_COMPARISON_MAX_PIXELS = 4_000_000

export interface ComparisonImageInfo {
  filename: string
  originalWidth: number
  originalHeight: number
  dataUrl: string
}

export interface PreparedImageComparison {
  baseline: ComparisonImageInfo
  candidate: ComparisonImageInfo
  baselinePixels: Uint8ClampedArray
  candidatePixels: Uint8ClampedArray
  width: number
  height: number
  scale: number
  dimensionsDiffer: boolean
}

export interface ChangedBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface PixelComparison {
  mismatchPixels: number
  mismatchPercentage: number
  matchPercentage: number
  changedBounds: ChangedBounds | null
  diffPixels: Uint8ClampedArray
}

export interface RenderedImageComparison extends PixelComparison {
  diffDataUrl: string
}

const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp'])

function assertImageFile(file: File) {
  if (!supportedTypes.has(file.type)) throw new Error('请选择 PNG、JPEG、WebP 或 BMP 图片')
  if (file.size > IMAGE_COMPARISON_MAX_FILE_BYTES) throw new Error('每张图片不能超过 35 MB')
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

export function computeComparisonCanvasSize(
  baselineWidth: number,
  baselineHeight: number,
  candidateWidth: number,
  candidateHeight: number,
) {
  const sourceWidth = Math.max(baselineWidth, candidateWidth)
  const sourceHeight = Math.max(baselineHeight, candidateHeight)
  if (![sourceWidth, sourceHeight].every(Number.isFinite) || sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error('图片尺寸无效')
  }
  const scale = Math.min(
    1,
    IMAGE_COMPARISON_MAX_SIDE / Math.max(sourceWidth, sourceHeight),
    Math.sqrt(IMAGE_COMPARISON_MAX_PIXELS / (sourceWidth * sourceHeight)),
  )
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
    scale,
  }
}

function normalizeImage(image: HTMLImageElement, width: number, height: number, scale: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true })
  if (!context) throw new Error('当前设备无法创建图片对比画布')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(
    image,
    0,
    0,
    Math.max(1, Math.round(image.naturalWidth * scale)),
    Math.max(1, Math.round(image.naturalHeight * scale)),
  )
  return {
    dataUrl: canvas.toDataURL('image/png'),
    pixels: context.getImageData(0, 0, width, height).data,
  }
}

export async function prepareImageComparison(
  baselineFile: File,
  candidateFile: File,
): Promise<PreparedImageComparison> {
  assertImageFile(baselineFile)
  assertImageFile(candidateFile)
  const [baselineImage, candidateImage] = await Promise.all([
    loadFileImage(baselineFile),
    loadFileImage(candidateFile),
  ])
  const { width, height, scale } = computeComparisonCanvasSize(
    baselineImage.naturalWidth,
    baselineImage.naturalHeight,
    candidateImage.naturalWidth,
    candidateImage.naturalHeight,
  )
  const baseline = normalizeImage(baselineImage, width, height, scale)
  const candidate = normalizeImage(candidateImage, width, height, scale)
  return {
    baseline: {
      filename: baselineFile.name,
      originalWidth: baselineImage.naturalWidth,
      originalHeight: baselineImage.naturalHeight,
      dataUrl: baseline.dataUrl,
    },
    candidate: {
      filename: candidateFile.name,
      originalWidth: candidateImage.naturalWidth,
      originalHeight: candidateImage.naturalHeight,
      dataUrl: candidate.dataUrl,
    },
    baselinePixels: baseline.pixels,
    candidatePixels: candidate.pixels,
    width,
    height,
    scale,
    dimensionsDiffer: baselineImage.naturalWidth !== candidateImage.naturalWidth
      || baselineImage.naturalHeight !== candidateImage.naturalHeight,
  }
}

export function findChangedBounds(mask: Uint8ClampedArray, width: number, height: number) {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    if (mask[pixel * 4 + 3] === 0) continue
    const x = pixel % width
    const y = Math.floor(pixel / width)
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return maxX < 0 ? null : {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  }
}

export function comparePixelBuffers(
  baselinePixels: Uint8ClampedArray,
  candidatePixels: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number,
): PixelComparison {
  const expectedLength = width * height * 4
  if (width <= 0 || height <= 0 || baselinePixels.length !== expectedLength || candidatePixels.length !== expectedLength) {
    throw new Error('图片对比像素尺寸不一致')
  }
  const normalizedThreshold = Math.max(0.01, Math.min(0.5, threshold))
  const mask = new Uint8ClampedArray(expectedLength)
  const mismatchPixels = pixelmatch(
    baselinePixels,
    candidatePixels,
    mask,
    width,
    height,
    {
      threshold: normalizedThreshold,
      includeAA: false,
      diffColor: [226, 54, 72],
      diffColorAlt: [47, 111, 191],
      diffMask: true,
      checkerboard: false,
    },
  )
  const diffPixels = new Uint8ClampedArray(expectedLength)
  for (let offset = 0; offset < expectedLength; offset += 4) {
    if (mask[offset + 3] > 0) {
      diffPixels[offset] = mask[offset]
      diffPixels[offset + 1] = mask[offset + 1]
      diffPixels[offset + 2] = mask[offset + 2]
    } else {
      const luminance = Math.round(
        baselinePixels[offset] * 0.299
        + baselinePixels[offset + 1] * 0.587
        + baselinePixels[offset + 2] * 0.114,
      )
      const faded = Math.round(238 + luminance * 0.067)
      diffPixels[offset] = faded
      diffPixels[offset + 1] = faded
      diffPixels[offset + 2] = faded
    }
    diffPixels[offset + 3] = 255
  }
  const mismatchPercentage = mismatchPixels / (width * height) * 100
  return {
    mismatchPixels,
    mismatchPercentage,
    matchPercentage: 100 - mismatchPercentage,
    changedBounds: findChangedBounds(mask, width, height),
    diffPixels,
  }
}

export function renderPreparedComparison(
  prepared: PreparedImageComparison,
  threshold: number,
): RenderedImageComparison {
  const comparison = comparePixelBuffers(
    prepared.baselinePixels,
    prepared.candidatePixels,
    prepared.width,
    prepared.height,
    threshold,
  )
  const canvas = document.createElement('canvas')
  canvas.width = prepared.width
  canvas.height = prepared.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前设备无法生成差异图')
  const imageData = context.createImageData(prepared.width, prepared.height)
  imageData.data.set(comparison.diffPixels)
  context.putImageData(imageData, 0, 0)
  return { ...comparison, diffDataUrl: canvas.toDataURL('image/png') }
}

function safeStem(filename: string) {
  const stem = filename.replace(/\.[^.]+$/, '')
  return [...stem]
    .map((character) => character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '-' : character)
    .join('')
    .trim()
    .slice(0, 48) || 'image'
}

export function comparisonFilename(baselineFilename: string, candidateFilename: string) {
  return `${safeStem(baselineFilename)}-vs-${safeStem(candidateFilename)}-diff.png`
}

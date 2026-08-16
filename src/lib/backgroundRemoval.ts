import type { ImageSegmenter } from '@mediapipe/tasks-vision'
import { loadVisionRuntime } from './visionRuntime'

export type BackgroundEffect = 'transparent' | 'blur' | 'solid' | 'image'
export type BackgroundImageFit = 'cover' | 'contain'
export type IdPhotoPreset = 'original' | 'one-inch' | 'two-inch' | '35x45' | 'us-2x2'

export const BACKGROUND_MAX_FILE_BYTES = 35 * 1024 * 1024
export const BACKGROUND_MAX_DECODED_PIXELS = 80_000_000
export const BACKGROUND_BATCH_MAX_FILES = 12
export const BACKGROUND_BATCH_MAX_BYTES = 160 * 1024 * 1024
const BACKGROUND_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp'])

export interface IdPhotoSpec {
  label: string
  width: number
  height: number
  physicalSize: string
}

export const idPhotoSpecs: Record<Exclude<IdPhotoPreset, 'original'>, IdPhotoSpec> = {
  'one-inch': { label: '一寸', width: 295, height: 413, physicalSize: '25 × 35 mm' },
  'two-inch': { label: '二寸', width: 413, height: 579, physicalSize: '35 × 49 mm' },
  '35x45': { label: '35 × 45 mm', width: 413, height: 531, physicalSize: '35 × 45 mm' },
  'us-2x2': { label: '2 × 2 inch', width: 600, height: 600, physicalSize: '2 × 2 inch' },
}

export interface PersonSegmentation {
  mask: Float32Array
  width: number
  height: number
  personCoverage: number
}

export interface BackgroundRenderOptions {
  effect: BackgroundEffect
  color: string
  blurRadius: number
  threshold: number
  feather: number
  idPhotoPreset?: IdPhotoPreset
  verticalPosition?: number
  idPhotoSheet?: boolean
  corrections?: BackgroundMaskStroke[]
  backgroundImageDataUrl?: string
  backgroundImageFit?: BackgroundImageFit
  backgroundImagePositionX?: number
  backgroundImagePositionY?: number
  outputMaxDimension?: number
}

export type BackgroundMaskMode = 'keep' | 'remove'

export interface BackgroundMaskPoint {
  x: number
  y: number
}

export interface BackgroundMaskStroke {
  id: string
  mode: BackgroundMaskMode
  radius: number
  points: BackgroundMaskPoint[]
}

let segmenterPromise: Promise<ImageSegmenter> | null = null

function localAsset(path: string) {
  return new URL(path, window.location.href).toString()
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image), { once: true })
    image.addEventListener('error', () => reject(new Error('无法读取背景处理图像')), { once: true })
    image.src = dataUrl
  })
}

export function validateBackgroundImageFile(file: File) {
  if (!BACKGROUND_IMAGE_TYPES.has(file.type)) throw new Error('请选择 PNG、JPEG、WebP 或 BMP 图像')
  if (file.size > BACKGROUND_MAX_FILE_BYTES) throw new Error('图像不能超过 35 MB')
}

export function validateBackgroundImageBatch(files: readonly File[]) {
  if (files.length < 2 || files.length > BACKGROUND_BATCH_MAX_FILES) {
    throw new Error(`批量人物背景请选择 2–${BACKGROUND_BATCH_MAX_FILES} 张图片`)
  }
  files.forEach(validateBackgroundImageFile)
  const totalBytes = files.reduce((total, file) => total + file.size, 0)
  if (totalBytes > BACKGROUND_BATCH_MAX_BYTES) throw new Error('批量人物背景图片合计不能超过 160 MB')
}

function assertSafeDecodedImage(image: HTMLImageElement) {
  if (!Number.isFinite(image.naturalWidth) || !Number.isFinite(image.naturalHeight) || image.naturalWidth < 1 || image.naturalHeight < 1) {
    throw new Error('图像尺寸无效')
  }
  if (image.naturalWidth * image.naturalHeight > BACKGROUND_MAX_DECODED_PIXELS) {
    throw new Error('图像解码后超过 8000 万像素，请先缩小尺寸')
  }
}

async function getSegmenter() {
  if (segmenterPromise) return segmenterPromise
  segmenterPromise = (async () => {
    const { FilesetResolver, ImageSegmenter } = await loadVisionRuntime()
    const vision = await FilesetResolver.forVisionTasks(localAsset('./wasm/'))
    return ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: localAsset('./models/selfie_segmenter.tflite'),
      },
      runningMode: 'IMAGE',
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    })
  })()
  try {
    return await segmenterPromise
  } catch (error) {
    segmenterPromise = null
    throw error
  }
}

export async function segmentPerson(dataUrl: string): Promise<PersonSegmentation> {
  const image = await loadImage(dataUrl)
  assertSafeDecodedImage(image)
  const segmenter = await getSegmenter()
  const result = segmenter.segment(image)
  const masks = result.confidenceMasks
  if (!masks?.length) throw new Error('本地模型没有返回人物分割结果')
  const labels = segmenter.getLabels().map((label) => label.toLowerCase())
  const labelledIndex = labels.findIndex((label) => label.includes('person'))
  const personIndex = labelledIndex >= 0 ? labelledIndex : Math.min(1, masks.length - 1)
  const personMask = masks[personIndex]
  const width = personMask.width
  const height = personMask.height
  const mask = new Float32Array(personMask.getAsFloat32Array())
  masks.forEach((resultMask) => resultMask.close())
  let foreground = 0
  for (const confidence of mask) if (confidence >= 0.5) foreground += 1
  return {
    mask,
    width,
    height,
    personCoverage: mask.length > 0 ? foreground / mask.length : 0,
  }
}

export interface BackgroundImageLayout {
  drawX: number
  drawY: number
  drawWidth: number
  drawHeight: number
}

export function computeBackgroundImageLayout(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  fit: BackgroundImageFit = 'cover',
  positionX = 50,
  positionY = 50,
): BackgroundImageLayout {
  if (![sourceWidth, sourceHeight, targetWidth, targetHeight].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error('自定义背景尺寸无效')
  }
  if (![positionX, positionY].every((value) => Number.isFinite(value) && value >= 0 && value <= 100)) {
    throw new Error('自定义背景位置必须在 0%–100% 之间')
  }
  const scale = fit === 'contain'
    ? Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight)
    : Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight)
  const drawWidth = sourceWidth * scale
  const drawHeight = sourceHeight * scale
  const drawX = (targetWidth - drawWidth) * positionX / 100
  const drawY = (targetHeight - drawHeight) * positionY / 100
  return {
    drawX: Math.abs(drawX) < Number.EPSILON ? 0 : drawX,
    drawY: Math.abs(drawY) < Number.EPSILON ? 0 : drawY,
    drawWidth,
    drawHeight,
  }
}

function smoothstep(edge0: number, edge1: number, value: number) {
  if (edge0 === edge1) return value >= edge1 ? 1 : 0
  const unit = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return unit * unit * (3 - 2 * unit)
}

export function buildPersonAlpha(mask: Float32Array, threshold: number, feather: number) {
  const safeThreshold = Math.max(0, Math.min(1, threshold))
  const safeFeather = Math.max(0, Math.min(0.5, feather))
  const lower = safeThreshold - safeFeather
  const upper = safeThreshold + safeFeather
  return Uint8ClampedArray.from(mask, (confidence) => Math.round(smoothstep(lower, upper, confidence) * 255))
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value))
}

export function applyMaskCorrections(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  corrections: BackgroundMaskStroke[] = [],
) {
  if (width < 1 || height < 1 || alpha.length !== width * height) {
    throw new Error('人物分割蒙版尺寸无效')
  }
  const corrected = new Uint8ClampedArray(alpha)
  const paintDisc = (point: BackgroundMaskPoint, radius: number, mode: BackgroundMaskMode) => {
    const centerX = clampUnit(point.x) * Math.max(0, width - 1)
    const centerY = clampUnit(point.y) * Math.max(0, height - 1)
    const radiusPixels = Math.max(1, Math.min(Math.min(width, height) * 0.25, radius * Math.min(width, height)))
    const minX = Math.max(0, Math.floor(centerX - radiusPixels))
    const maxX = Math.min(width - 1, Math.ceil(centerX + radiusPixels))
    const minY = Math.max(0, Math.floor(centerY - radiusPixels))
    const maxY = Math.min(height - 1, Math.ceil(centerY + radiusPixels))
    const target = mode === 'keep' ? 255 : 0
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const distance = Math.hypot(x - centerX, y - centerY) / radiusPixels
        if (distance > 1) continue
        const weight = 1 - smoothstep(0.72, 1, distance)
        const index = y * width + x
        corrected[index] = Math.round(corrected[index] * (1 - weight) + target * weight)
      }
    }
  }

  corrections.slice(0, 200).forEach((stroke) => {
    const points = stroke.points.slice(0, 500)
    if (points.length === 0) return
    const radius = Math.max(0.005, Math.min(0.25, stroke.radius))
    const radiusPixels = Math.max(1, radius * Math.min(width, height))
    paintDisc(points[0], radius, stroke.mode)
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1]
      const current = points[index]
      const distancePixels = Math.hypot(
        (current.x - previous.x) * width,
        (current.y - previous.y) * height,
      )
      const steps = Math.max(1, Math.ceil(distancePixels / Math.max(1, radiusPixels * 0.45)))
      for (let step = 1; step <= steps; step += 1) {
        const progress = step / steps
        paintDisc({
          x: previous.x + (current.x - previous.x) * progress,
          y: previous.y + (current.y - previous.y) * progress,
        }, radius, stroke.mode)
      }
    }
  })
  return corrected
}

function makeScaledMask(segmentation: PersonSegmentation, options: BackgroundRenderOptions) {
  if (segmentation.mask.length !== segmentation.width * segmentation.height) {
    throw new Error('人物分割蒙版尺寸无效')
  }
  const canvas = document.createElement('canvas')
  canvas.width = segmentation.width
  canvas.height = segmentation.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建人物蒙版画布')
  const pixels = context.createImageData(canvas.width, canvas.height)
  const alpha = applyMaskCorrections(
    buildPersonAlpha(segmentation.mask, options.threshold, options.feather),
    segmentation.width,
    segmentation.height,
    options.corrections,
  )
  for (let index = 0; index < alpha.length; index += 1) {
    const offset = index * 4
    pixels.data[offset] = 255
    pixels.data[offset + 1] = 255
    pixels.data[offset + 2] = 255
    pixels.data[offset + 3] = alpha[index]
  }
  context.putImageData(pixels, 0, 0)
  return canvas
}

function drawSubject(
  image: HTMLImageElement,
  mask: HTMLCanvasElement,
  width: number,
  height: number,
) {
  const subject = document.createElement('canvas')
  subject.width = width
  subject.height = height
  const context = subject.getContext('2d')
  if (!context) throw new Error('无法创建人物图层')
  context.drawImage(image, 0, 0, width, height)
  context.globalCompositeOperation = 'destination-in'
  context.imageSmoothingEnabled = true
  context.drawImage(mask, 0, 0, width, height)
  return subject
}

export interface IdPhotoLayout {
  targetWidth: number
  targetHeight: number
  drawX: number
  drawY: number
  drawWidth: number
  drawHeight: number
}

export interface IdPhotoFaceBox {
  x: number
  y: number
  width: number
  height: number
  confidence: number
}

export interface IdPhotoFaceAssessment {
  status: 'no-face' | 'multiple-faces' | 'review'
  faceCount: number
  faceHeightPercent: number | null
  horizontalOffsetPercent: number | null
  signals: string[]
}

export function assessIdPhotoFaceLayout(
  faces: IdPhotoFaceBox[],
  sourceWidth: number,
  sourceHeight: number,
  preset: Exclude<IdPhotoPreset, 'original'>,
  verticalPosition = 50,
): IdPhotoFaceAssessment {
  if (faces.length === 0) return { status: 'no-face', faceCount: 0, faceHeightPercent: null, horizontalOffsetPercent: null, signals: ['未检测到人脸，请检查照片清晰度与正面角度'] }
  if (faces.length > 1) return { status: 'multiple-faces', faceCount: faces.length, faceHeightPercent: null, horizontalOffsetPercent: null, signals: ['检测到多张人脸，证件照辅助只适合单人照片'] }
  const layout = computeIdPhotoLayout(sourceWidth, sourceHeight, preset, verticalPosition)
  const face = faces[0]
  const left = Math.max(0, layout.drawX + face.x * layout.drawWidth)
  const right = Math.min(layout.targetWidth, layout.drawX + (face.x + face.width) * layout.drawWidth)
  const top = Math.max(0, layout.drawY + face.y * layout.drawHeight)
  const bottom = Math.min(layout.targetHeight, layout.drawY + (face.y + face.height) * layout.drawHeight)
  const faceHeightPercent = Math.max(0, bottom - top) / layout.targetHeight * 100
  const faceCenter = (left + right) / 2 / layout.targetWidth
  const horizontalOffsetPercent = (faceCenter - 0.5) * 100
  const signals: string[] = []
  if (faceHeightPercent < 25) signals.push('脸部在画布中可能偏小')
  if (faceHeightPercent > 55) signals.push('脸部在画布中可能偏大或被裁切')
  if (Math.abs(horizontalOffsetPercent) > 8) signals.push(`脸部明显偏${horizontalOffsetPercent < 0 ? '左' : '右'}`)
  if (top <= 0 || bottom >= layout.targetHeight) signals.push('脸部边界接近或超出画布')
  if (signals.length === 0) signals.push('未发现明显的单人居中或脸部大小问题')
  return { status: 'review', faceCount: 1, faceHeightPercent, horizontalOffsetPercent, signals }
}

export interface IdPhotoSheetLayout {
  width: number
  height: number
  columns: number
  rows: number
  count: number
  startX: number
  startY: number
  gap: number
}

export function computeIdPhotoSheetLayout(photoWidth: number, photoHeight: number): IdPhotoSheetLayout {
  if (![photoWidth, photoHeight].every((value) => Number.isFinite(value) && value > 0)) throw new Error('证件照排版尺寸无效')
  const width = 1_800
  const height = 1_200
  const margin = 48
  const gap = 24
  const columns = Math.floor((width - margin * 2 + gap) / (photoWidth + gap))
  const rows = Math.floor((height - margin * 2 + gap) / (photoHeight + gap))
  if (columns < 1 || rows < 1) throw new Error('当前证件照尺寸无法放入 4 × 6 inch 排版')
  const gridWidth = columns * photoWidth + (columns - 1) * gap
  const gridHeight = rows * photoHeight + (rows - 1) * gap
  return { width, height, columns, rows, count: columns * rows, startX: (width - gridWidth) / 2, startY: (height - gridHeight) / 2, gap }
}

export function computeIdPhotoLayout(
  sourceWidth: number,
  sourceHeight: number,
  preset: Exclude<IdPhotoPreset, 'original'>,
  verticalPosition = 50,
): IdPhotoLayout {
  if (![sourceWidth, sourceHeight].every((value) => Number.isFinite(value) && value > 0)) throw new Error('证件照源尺寸无效')
  if (!Number.isFinite(verticalPosition) || verticalPosition < 0 || verticalPosition > 100) throw new Error('证件照垂直位置必须在 0%–100% 之间')
  const spec = idPhotoSpecs[preset]
  if (!spec) throw new Error('不支持的证件照尺寸')
  const scale = Math.max(spec.width / sourceWidth, spec.height / sourceHeight)
  const drawWidth = sourceWidth * scale
  const drawHeight = sourceHeight * scale
  const verticalOverflow = Math.max(0, drawHeight - spec.height)
  return {
    targetWidth: spec.width,
    targetHeight: spec.height,
    drawX: (spec.width - drawWidth) / 2,
    drawY: verticalOverflow === 0 || verticalPosition === 0 ? 0 : -verticalOverflow * verticalPosition / 100,
    drawWidth,
    drawHeight,
  }
}

export async function applyBackgroundEffect(
  dataUrl: string,
  segmentation: PersonSegmentation,
  options: BackgroundRenderOptions,
) {
  const image = await loadImage(dataUrl)
  assertSafeDecodedImage(image)
  const maxDimension = Math.max(320, Math.min(4_096, Math.round(options.outputMaxDimension ?? 4_096)))
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const output = document.createElement('canvas')
  output.width = width
  output.height = height
  const context = output.getContext('2d')
  if (!context) throw new Error('无法创建背景处理画布')
  const mask = makeScaledMask(segmentation, options)
  const subject = drawSubject(image, mask, width, height)

  if (options.effect === 'blur') {
    context.save()
    context.filter = `blur(${Math.max(4, Math.min(80, options.blurRadius))}px)`
    const overscan = Math.max(8, Math.min(96, options.blurRadius * 2))
    context.drawImage(image, -overscan, -overscan, width + overscan * 2, height + overscan * 2)
    context.restore()
  } else if (options.effect === 'solid') {
    context.fillStyle = /^#[0-9a-f]{6}$/i.test(options.color) ? options.color : '#ffffff'
    context.fillRect(0, 0, width, height)
  } else if (options.effect === 'image') {
    if (!options.backgroundImageDataUrl) throw new Error('请先选择一张自定义背景图片')
    const background = await loadImage(options.backgroundImageDataUrl)
    assertSafeDecodedImage(background)
    context.fillStyle = /^#[0-9a-f]{6}$/i.test(options.color) ? options.color : '#ffffff'
    context.fillRect(0, 0, width, height)
    const layout = computeBackgroundImageLayout(
      background.naturalWidth,
      background.naturalHeight,
      width,
      height,
      options.backgroundImageFit ?? 'cover',
      options.backgroundImagePositionX ?? 50,
      options.backgroundImagePositionY ?? 50,
    )
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(background, layout.drawX, layout.drawY, layout.drawWidth, layout.drawHeight)
  }
  context.drawImage(subject, 0, 0)

  let finalOutput = output
  const idPhotoPreset = options.idPhotoPreset ?? 'original'
  if (options.effect === 'solid' && idPhotoPreset !== 'original') {
    const layout = computeIdPhotoLayout(width, height, idPhotoPreset, options.verticalPosition ?? 50)
    finalOutput = document.createElement('canvas')
    finalOutput.width = layout.targetWidth
    finalOutput.height = layout.targetHeight
    const finalContext = finalOutput.getContext('2d', { alpha: false })
    if (!finalContext) throw new Error('无法创建证件照排版画布')
    finalContext.imageSmoothingEnabled = true
    finalContext.imageSmoothingQuality = 'high'
    finalContext.drawImage(output, layout.drawX, layout.drawY, layout.drawWidth, layout.drawHeight)
    if (options.idPhotoSheet) {
      const photo = finalOutput
      const sheetLayout = computeIdPhotoSheetLayout(photo.width, photo.height)
      finalOutput = document.createElement('canvas')
      finalOutput.width = sheetLayout.width
      finalOutput.height = sheetLayout.height
      const sheetContext = finalOutput.getContext('2d', { alpha: false })
      if (!sheetContext) throw new Error('无法创建证件照打印排版画布')
      sheetContext.fillStyle = '#ffffff'
      sheetContext.fillRect(0, 0, finalOutput.width, finalOutput.height)
      for (let row = 0; row < sheetLayout.rows; row += 1) {
        for (let column = 0; column < sheetLayout.columns; column += 1) {
          const x = sheetLayout.startX + column * (photo.width + sheetLayout.gap)
          const y = sheetLayout.startY + row * (photo.height + sheetLayout.gap)
          sheetContext.drawImage(photo, x, y)
          sheetContext.strokeStyle = '#b8b8b8'
          sheetContext.lineWidth = 1
          sheetContext.strokeRect(x + 0.5, y + 0.5, photo.width - 1, photo.height - 1)
        }
      }
    }
  }

  return {
    dataUrl: finalOutput.toDataURL('image/png'),
    width: finalOutput.width,
    height: finalOutput.height,
    sourceWidth: width,
    sourceHeight: height,
  }
}

export function backgroundFilename(filename: string, effect: BackgroundEffect, preset: IdPhotoPreset = 'original', sheet = false) {
  const base = [...filename.replace(/\.[^.]+$/, '')]
    .map((character) => character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '-' : character)
    .join('')
  const suffix = effect === 'solid' && preset !== 'original' ? `id-photo-${preset}${sheet ? '-4x6-sheet' : ''}` : `background-${effect}`
  return `${base || 'photo'}-${suffix}.png`
}

import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'

export type BackgroundEffect = 'transparent' | 'blur' | 'solid'

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
  corrections?: BackgroundMaskStroke[]
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

async function getSegmenter() {
  if (segmenterPromise) return segmenterPromise
  segmenterPromise = (async () => {
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

export async function applyBackgroundEffect(
  dataUrl: string,
  segmentation: PersonSegmentation,
  options: BackgroundRenderOptions,
) {
  const image = await loadImage(dataUrl)
  const maxDimension = 4_096
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
  }
  context.drawImage(subject, 0, 0)

  return {
    dataUrl: output.toDataURL('image/png'),
    width,
    height,
  }
}

export function backgroundFilename(filename: string, effect: BackgroundEffect) {
  const base = [...filename.replace(/\.[^.]+$/, '')]
    .map((character) => character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '-' : character)
    .join('')
  return `${base || 'photo'}-background-${effect}.png`
}

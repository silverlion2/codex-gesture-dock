import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision'

export type FacePrivacyEffect = 'blur' | 'pixelate' | 'blackout'

export interface FacePrivacyBox {
  id: string
  x: number
  y: number
  width: number
  height: number
  confidence: number
  enabled: boolean
  source?: 'detected' | 'manual'
}

let detectorPromise: Promise<FaceDetector> | null = null

function localAsset(path: string) {
  return new URL(path, window.location.href).toString()
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image), { once: true })
    image.addEventListener('error', () => reject(new Error('无法读取隐私处理图像')), { once: true })
    image.src = dataUrl
  })
}

async function getDetector() {
  if (detectorPromise) return detectorPromise
  detectorPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks(localAsset('./wasm/'))
    const detector = await FaceDetector.createFromModelPath(
      vision,
      localAsset('./models/face_detection_short_range.tflite'),
    )
    await detector.setOptions({
      runningMode: 'IMAGE',
      // Privacy tooling favors recall. Every candidate remains user-reviewable,
      // so a lower threshold is safer than silently missing a face.
      minDetectionConfidence: 0.3,
      minSuppressionThreshold: 0.3,
    })
    return detector
  })()
  try {
    return await detectorPromise
  } catch (error) {
    detectorPromise = null
    throw error
  }
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value))
}

export function normalizeFacePrivacyBox(box: FacePrivacyBox): FacePrivacyBox | null {
  const x = clampUnit(box.x)
  const y = clampUnit(box.y)
  const width = Math.max(0, Math.min(1 - x, box.width))
  const height = Math.max(0, Math.min(1 - y, box.height))
  if (width < 0.005 || height < 0.005) return null
  return { ...box, x, y, width, height }
}

export function expandFacePrivacyBox(box: FacePrivacyBox, margin: number) {
  const horizontal = box.width * margin
  const vertical = box.height * margin
  return normalizeFacePrivacyBox({
    ...box,
    x: box.x - horizontal,
    y: box.y - vertical,
    width: box.width + horizontal * 2,
    height: box.height + vertical * 2,
  }) ?? box
}

export async function detectPrivateFaces(dataUrl: string): Promise<FacePrivacyBox[]> {
  const image = await loadImage(dataUrl)
  const result = (await getDetector()).detect(image)
  return result.detections.flatMap((detection, index) => {
    const bounds = detection.boundingBox
    if (!bounds) return []
    const box = normalizeFacePrivacyBox({
      id: `face-${index + 1}`,
      x: bounds.originX / image.naturalWidth,
      y: bounds.originY / image.naturalHeight,
      width: bounds.width / image.naturalWidth,
      height: bounds.height / image.naturalHeight,
      confidence: detection.categories[0]?.score ?? 0,
      enabled: true,
      source: 'detected',
    })
    return box ? [box] : []
  })
}

function pixelateFace(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const pixelSize = Math.max(8, Math.round(Math.min(width, height) / 12))
  const small = document.createElement('canvas')
  small.width = Math.max(1, Math.ceil(width / pixelSize))
  small.height = Math.max(1, Math.ceil(height / pixelSize))
  const smallContext = small.getContext('2d')
  if (!smallContext) throw new Error('无法创建人脸像素化画布')
  smallContext.drawImage(context.canvas, x, y, width, height, 0, 0, small.width, small.height)
  context.save()
  context.imageSmoothingEnabled = false
  context.drawImage(small, 0, 0, small.width, small.height, x, y, width, height)
  context.restore()
}

export async function applyFacePrivacy(
  dataUrl: string,
  boxes: FacePrivacyBox[],
  effect: FacePrivacyEffect,
  margin = 0.18,
) {
  const image = await loadImage(dataUrl)
  const maxDimension = 4_096
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建人脸隐私处理画布')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  boxes.filter((box) => box.enabled).forEach((box) => {
    const expanded = expandFacePrivacyBox(box, margin)
    const x = Math.floor(expanded.x * canvas.width)
    const y = Math.floor(expanded.y * canvas.height)
    const width = Math.ceil(expanded.width * canvas.width)
    const height = Math.ceil(expanded.height * canvas.height)
    if (effect === 'blackout') {
      context.fillStyle = '#000000'
      context.fillRect(x, y, width, height)
    } else if (effect === 'pixelate') {
      pixelateFace(context, x, y, width, height)
    } else {
      context.save()
      context.beginPath()
      context.rect(x, y, width, height)
      context.clip()
      context.filter = `blur(${Math.max(12, Math.round(Math.min(width, height) * 0.12))}px)`
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      context.restore()
    }
  })

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
  }
}

export function facePrivateFilename(filename: string) {
  const base = [...filename.replace(/\.[^.]+$/, '')]
    .map((character) => character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '-' : character)
    .join('')
  return `${base || 'photo'}-face-private.png`
}

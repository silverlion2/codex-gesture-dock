import { prepareCropSource, type PreparedCropSource } from './imageCrop'

export type AnnotationTool = 'rectangle' | 'arrow' | 'marker' | 'text' | 'blur'
export type AnnotationStroke = 'thin' | 'medium' | 'thick'
export type AnnotationColor = '#D43F3A' | '#F2B134' | '#278A52' | '#3478C7' | '#202923'

interface AnnotationBase {
  id: string
  color: AnnotationColor
  stroke: AnnotationStroke
}

interface RectangleImageAnnotation extends AnnotationBase {
  type: 'rectangle'
  x: number
  y: number
  width: number
  height: number
}

interface BlurImageAnnotation extends AnnotationBase {
  type: 'blur'
  x: number
  y: number
  width: number
  height: number
}

export type BoxImageAnnotation = RectangleImageAnnotation | BlurImageAnnotation

export interface ArrowImageAnnotation extends AnnotationBase {
  type: 'arrow'
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface MarkerImageAnnotation extends AnnotationBase {
  type: 'marker'
  x: number
  y: number
  number: number
}

export interface TextImageAnnotation extends AnnotationBase {
  type: 'text'
  x: number
  y: number
  text: string
}

export type ImageAnnotation = BoxImageAnnotation | ArrowImageAnnotation | MarkerImageAnnotation | TextImageAnnotation

export interface NormalizedPoint {
  x: number
  y: number
}

export interface AnnotatedImage {
  blob: Blob
  filename: string
  width: number
  height: number
  annotationCount: number
}

const validColors = new Set<AnnotationColor>(['#D43F3A', '#F2B134', '#278A52', '#3478C7', '#202923'])
const validStrokes = new Set<AnnotationStroke>(['thin', 'medium', 'thick'])

function clamp(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
}

export function clampAnnotationPoint(point: NormalizedPoint): NormalizedPoint {
  return { x: clamp(point.x), y: clamp(point.y) }
}

export function normalizedAnnotationBox(start: NormalizedPoint, end: NormalizedPoint) {
  const first = clampAnnotationPoint(start)
  const second = clampAnnotationPoint(end)
  return {
    x: Math.min(first.x, second.x),
    y: Math.min(first.y, second.y),
    width: Math.abs(second.x - first.x),
    height: Math.abs(second.y - first.y),
  }
}

export function annotationIsLargeEnough(
  annotation: ImageAnnotation,
  width: number,
  height: number,
  minimumPixels = 8,
) {
  if (annotation.type === 'rectangle' || annotation.type === 'blur') {
    return annotation.width * width >= minimumPixels && annotation.height * height >= minimumPixels
  }
  if (annotation.type === 'arrow') {
    return Math.hypot((annotation.x2 - annotation.x1) * width, (annotation.y2 - annotation.y1) * height) >= minimumPixels
  }
  return true
}

export function defaultImageAnnotation(
  id: string,
  tool: AnnotationTool,
  color: AnnotationColor,
  stroke: AnnotationStroke,
  markerNumber: number,
  text: string,
): ImageAnnotation {
  if (tool === 'rectangle') return { id, type: tool, color, stroke, x: 0.25, y: 0.25, width: 0.5, height: 0.5 }
  if (tool === 'blur') return { id, type: tool, color, stroke, x: 0.3, y: 0.3, width: 0.4, height: 0.4 }
  if (tool === 'arrow') return { id, type: tool, color, stroke, x1: 0.25, y1: 0.5, x2: 0.75, y2: 0.5 }
  if (tool === 'marker') return { id, type: tool, color, stroke, x: 0.5, y: 0.5, number: Math.max(1, Math.round(markerNumber)) }
  return { id, type: tool, color, stroke, x: 0.4, y: 0.5, text: text.trim().slice(0, 80) || '说明' }
}

export function nudgeImageAnnotation(annotation: ImageAnnotation, deltaX: number, deltaY: number): ImageAnnotation {
  if (annotation.type === 'rectangle' || annotation.type === 'blur') {
    return {
      ...annotation,
      x: Math.min(1 - annotation.width, Math.max(0, annotation.x + deltaX)),
      y: Math.min(1 - annotation.height, Math.max(0, annotation.y + deltaY)),
    }
  }
  if (annotation.type === 'arrow') {
    const minimumX = Math.min(annotation.x1, annotation.x2)
    const maximumX = Math.max(annotation.x1, annotation.x2)
    const minimumY = Math.min(annotation.y1, annotation.y2)
    const maximumY = Math.max(annotation.y1, annotation.y2)
    const boundedDeltaX = Math.min(1 - maximumX, Math.max(-minimumX, deltaX))
    const boundedDeltaY = Math.min(1 - maximumY, Math.max(-minimumY, deltaY))
    return {
      ...annotation,
      x1: annotation.x1 + boundedDeltaX,
      y1: annotation.y1 + boundedDeltaY,
      x2: annotation.x2 + boundedDeltaX,
      y2: annotation.y2 + boundedDeltaY,
    }
  }
  return { ...annotation, x: clamp(annotation.x + deltaX), y: clamp(annotation.y + deltaY) }
}

export function orderedImageAnnotations(annotations: ImageAnnotation[]) {
  return [
    ...annotations.filter((annotation) => annotation.type === 'blur'),
    ...annotations.filter((annotation) => annotation.type !== 'blur'),
  ]
}

function safeStem(filename: string) {
  const stem = filename.replace(/\.[^.]+$/, '')
  const safe = [...stem]
    .map((character) => character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '-' : character)
    .join('')
    .trim()
    .slice(0, 64)
    .replace(/[. ]+$/, '')
  if (!safe || safe === '.' || safe === '..') return 'image'
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safe) ? `${safe}-file` : safe
}

export function annotatedImageFilename(filename: string) {
  return `${safeStem(filename)}-annotated.png`
}

function loadPreparedImage(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('无法读取标注工作图'))
    }
    image.src = url
  })
}

function canvasToPng(canvas: HTMLCanvasElement, signal?: AbortSignal) {
  return new Promise<Blob>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('已取消图片标注', 'AbortError'))
      return
    }
    canvas.toBlob((blob) => {
      if (signal?.aborted) {
        reject(new DOMException('已取消图片标注', 'AbortError'))
        return
      }
      if (!blob || blob.type !== 'image/png') {
        reject(new Error('当前设备无法生成标注 PNG'))
        return
      }
      resolve(blob)
    }, 'image/png')
  })
}

function assertAnnotation(annotation: ImageAnnotation) {
  if (!annotation.id || !validColors.has(annotation.color) || !validStrokes.has(annotation.stroke)) {
    throw new Error('标注数据无效')
  }
  if (annotation.type === 'text' && (!annotation.text.trim() || annotation.text.length > 80)) {
    throw new Error('文字标注必须包含 1–80 个字符')
  }
  if (annotation.type === 'marker' && (!Number.isInteger(annotation.number) || annotation.number < 1 || annotation.number > 999)) {
    throw new Error('编号标注必须在 1–999 之间')
  }
  const numericValues = annotation.type === 'rectangle' || annotation.type === 'blur'
    ? [annotation.x, annotation.y, annotation.width, annotation.height]
    : annotation.type === 'arrow'
      ? [annotation.x1, annotation.y1, annotation.x2, annotation.y2]
      : [annotation.x, annotation.y]
  if (numericValues.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new Error('标注坐标无效')
  }
  if (
    (annotation.type === 'rectangle' || annotation.type === 'blur')
    && (annotation.x + annotation.width > 1 || annotation.y + annotation.height > 1)
  ) {
    throw new Error('标注区域超出图片边界')
  }
}

function strokePixels(stroke: AnnotationStroke, minimumSide: number) {
  const ratio = stroke === 'thin' ? 0.003 : stroke === 'medium' ? 0.006 : 0.01
  return Math.max(2, minimumSide * ratio)
}

function drawRoundedRectangle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const boundedRadius = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.roundRect(x, y, width, height, boundedRadius)
}

export async function prepareAnnotationSource(file: File, signal?: AbortSignal): Promise<PreparedCropSource> {
  return prepareCropSource(file, 0, signal)
}

export async function renderAnnotatedImage(
  source: PreparedCropSource,
  annotations: ImageAnnotation[],
  signal?: AbortSignal,
): Promise<AnnotatedImage> {
  if (annotations.length < 1 || annotations.length > 100) throw new Error('请保留 1–100 个有效标注')
  annotations.forEach((annotation) => {
    assertAnnotation(annotation)
    if (!annotationIsLargeEnough(annotation, source.width, source.height)) throw new Error('矩形、箭头或模糊区域不能小于 8 像素')
  })
  const image = await loadPreparedImage(source.blob)
  if (signal?.aborted) throw new DOMException('已取消图片标注', 'AbortError')
  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = source.width
  sourceCanvas.height = source.height
  const sourceContext = sourceCanvas.getContext('2d')
  if (!sourceContext) throw new Error('当前设备无法创建标注源画布')
  sourceContext.drawImage(image, 0, 0, source.width, source.height)

  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前设备无法创建标注输出画布')
  context.drawImage(sourceCanvas, 0, 0)
  const minimumSide = Math.min(source.width, source.height)

  for (const annotation of orderedImageAnnotations(annotations)) {
    if (signal?.aborted) throw new DOMException('已取消图片标注', 'AbortError')
    if (annotation.type === 'blur') {
      const x = annotation.x * source.width
      const y = annotation.y * source.height
      const width = annotation.width * source.width
      const height = annotation.height * source.height
      context.save()
      context.beginPath()
      context.rect(x, y, width, height)
      context.clip()
      context.filter = `blur(${Math.max(6, minimumSide * 0.018).toFixed(1)}px)`
      context.drawImage(sourceCanvas, 0, 0)
      context.restore()
      continue
    }

    const lineWidth = strokePixels(annotation.stroke, minimumSide)
    context.save()
    context.strokeStyle = annotation.color
    context.fillStyle = annotation.color
    context.lineWidth = lineWidth
    context.lineCap = 'round'
    context.lineJoin = 'round'

    if (annotation.type === 'rectangle') {
      context.strokeRect(
        annotation.x * source.width,
        annotation.y * source.height,
        annotation.width * source.width,
        annotation.height * source.height,
      )
    } else if (annotation.type === 'arrow') {
      const x1 = annotation.x1 * source.width
      const y1 = annotation.y1 * source.height
      const x2 = annotation.x2 * source.width
      const y2 = annotation.y2 * source.height
      const angle = Math.atan2(y2 - y1, x2 - x1)
      const head = Math.max(lineWidth * 4, minimumSide * 0.025)
      context.beginPath()
      context.moveTo(x1, y1)
      context.lineTo(x2, y2)
      context.stroke()
      context.beginPath()
      context.moveTo(x2, y2)
      context.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6))
      context.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6))
      context.closePath()
      context.fill()
    } else if (annotation.type === 'marker') {
      const x = annotation.x * source.width
      const y = annotation.y * source.height
      const radius = Math.max(lineWidth * 3, minimumSide * 0.026)
      context.beginPath()
      context.arc(x, y, radius, 0, Math.PI * 2)
      context.fill()
      context.fillStyle = annotation.color === '#F2B134' ? '#202923' : '#ffffff'
      context.font = `700 ${Math.max(12, radius * 1.15).toFixed(1)}px sans-serif`
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText(String(annotation.number), x, y)
    } else {
      const fontSize = Math.max(16, minimumSide * 0.035)
      context.font = `700 ${fontSize.toFixed(1)}px sans-serif`
      const paddingX = fontSize * 0.38
      const paddingY = fontSize * 0.25
      const textWidth = context.measureText(annotation.text).width
      const boxWidth = Math.min(source.width, textWidth + paddingX * 2)
      const boxHeight = fontSize + paddingY * 2
      const x = Math.max(0, Math.min(source.width - boxWidth, annotation.x * source.width))
      const y = Math.max(0, Math.min(source.height - boxHeight, annotation.y * source.height))
      drawRoundedRectangle(context, x, y, boxWidth, boxHeight, fontSize * 0.2)
      context.fill()
      context.fillStyle = annotation.color === '#F2B134' ? '#202923' : '#ffffff'
      context.textAlign = 'left'
      context.textBaseline = 'middle'
      context.fillText(annotation.text, x + paddingX, y + boxHeight / 2, boxWidth - paddingX * 2)
    }
    context.restore()
  }

  const blob = await canvasToPng(canvas, signal)
  return {
    blob,
    filename: annotatedImageFilename(source.filename),
    width: source.width,
    height: source.height,
    annotationCount: annotations.length,
  }
}

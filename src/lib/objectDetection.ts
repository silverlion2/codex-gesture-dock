import type { ObjectDetector } from '@mediapipe/tasks-vision'
import { loadVisionRuntime } from './visionRuntime'

export interface DetectedObject {
  id: string
  category: string
  label: string
  confidence: number
  x: number
  y: number
  width: number
  height: number
  enabled: boolean
}

export interface ObjectDetectionModel {
  id: string
  kind: 'bundled' | 'custom'
  name: string
  size: number
  bytes?: Uint8Array
  labels?: string[]
  labelsFilename?: string
}

export const OBJECT_MODEL_MAX_FILE_BYTES = 100 * 1024 * 1024
export const OBJECT_LABELS_MAX_FILE_BYTES = 256 * 1024

export const BUNDLED_OBJECT_MODEL: ObjectDetectionModel = {
  id: 'bundled-efficientdet-lite0',
  kind: 'bundled',
  name: '内置 EfficientDet-Lite0（80 类 COCO）',
  size: 0,
}

const labelTranslations: Record<string, string> = {
  person: '人物', bicycle: '自行车', car: '汽车', motorcycle: '摩托车', airplane: '飞机',
  bus: '公交车', train: '火车', truck: '卡车', boat: '船', 'traffic light': '交通灯',
  'fire hydrant': '消防栓', 'stop sign': '停车标志', 'parking meter': '停车计时器', bench: '长椅',
  bird: '鸟', cat: '猫', dog: '狗', horse: '马', sheep: '羊', cow: '牛', elephant: '大象',
  bear: '熊', zebra: '斑马', giraffe: '长颈鹿', backpack: '背包', umbrella: '雨伞',
  handbag: '手提包', tie: '领带', suitcase: '行李箱', frisbee: '飞盘', skis: '滑雪板',
  snowboard: '单板滑雪板', 'sports ball': '球', kite: '风筝', 'baseball bat': '棒球棒',
  'baseball glove': '棒球手套', skateboard: '滑板', surfboard: '冲浪板',
  'tennis racket': '网球拍', bottle: '瓶子', 'wine glass': '酒杯', cup: '杯子', fork: '叉子',
  knife: '刀', spoon: '勺子', bowl: '碗', banana: '香蕉', apple: '苹果', sandwich: '三明治',
  orange: '橙子', broccoli: '西兰花', carrot: '胡萝卜', 'hot dog': '热狗', pizza: '披萨',
  donut: '甜甜圈', cake: '蛋糕', chair: '椅子', couch: '沙发', 'potted plant': '盆栽',
  bed: '床', 'dining table': '餐桌', toilet: '马桶', tv: '电视', laptop: '笔记本电脑',
  mouse: '鼠标', remote: '遥控器', keyboard: '键盘', 'cell phone': '手机', microwave: '微波炉',
  oven: '烤箱', toaster: '烤面包机', sink: '水槽', refrigerator: '冰箱', book: '书', clock: '时钟',
  vase: '花瓶', scissors: '剪刀', 'teddy bear': '泰迪熊', 'hair drier': '吹风机', toothbrush: '牙刷',
}

type VisionFileset = Awaited<ReturnType<(typeof import('@mediapipe/tasks-vision'))['FilesetResolver']['forVisionTasks']>>

let visionFilesetPromise: Promise<VisionFileset> | null = null
let bundledDetectorPromise: Promise<ObjectDetector> | null = null
let customDetectorEntry: { id: string; promise: Promise<ObjectDetector> } | null = null
let customModelSequence = 0

function localAsset(path: string) {
  return new URL(path, window.location.href).toString()
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image), { once: true })
    image.addEventListener('error', () => reject(new Error('无法读取物体识别图像')), { once: true })
    image.src = dataUrl
  })
}

async function getVisionFileset() {
  if (!visionFilesetPromise) {
    visionFilesetPromise = loadVisionRuntime().then(({ FilesetResolver }) => FilesetResolver.forVisionTasks(localAsset('./wasm/')))
  }
  try {
    return await visionFilesetPromise
  } catch (error) {
    visionFilesetPromise = null
    throw error
  }
}

async function createDetector(model: ObjectDetectionModel) {
  const [{ ObjectDetector }, vision] = await Promise.all([loadVisionRuntime(), getVisionFileset()])
  return ObjectDetector.createFromOptions(vision, detectorOptions(model))
}

function detectorOptions(model: ObjectDetectionModel) {
  return {
    baseOptions: model.kind === 'custom'
      ? { modelAssetBuffer: model.bytes }
      : { modelAssetPath: localAsset('./models/efficientdet_lite0_uint8.tflite') },
    runningMode: 'IMAGE' as const,
    scoreThreshold: 0.25,
    maxResults: 30,
  }
}

function closeDetectorEntry(entry: { promise: Promise<ObjectDetector> } | null) {
  if (!entry) return
  void entry.promise.then((detector) => detector.close()).catch(() => undefined)
}

async function getDetector(model: ObjectDetectionModel) {
  if (model.kind === 'bundled') {
    if (!bundledDetectorPromise) {
      bundledDetectorPromise = createDetector(model)
    }
    try {
      return await bundledDetectorPromise
    } catch (error) {
      bundledDetectorPromise = null
      throw error
    }
  }

  if (!model.bytes?.byteLength) throw new Error('自定义物体模型没有可读取的数据')
  if (customDetectorEntry?.id !== model.id) {
    closeDetectorEntry(customDetectorEntry)
    customDetectorEntry = {
      id: model.id,
      promise: createDetector(model),
    }
  }
  const entry = customDetectorEntry
  try {
    return await entry.promise
  } catch (error) {
    if (customDetectorEntry === entry) customDetectorEntry = null
    throw error
  }
}

function cleanDisplayFilename(filename: string, fallback: string) {
  const cleaned = [...filename]
    .map((character) => character.charCodeAt(0) < 32 ? ' ' : character)
    .join('')
    .trim()
  return [...(cleaned || fallback)].slice(0, 100).join('')
}

function hasTfliteIdentifier(bytes: Uint8Array) {
  return bytes.byteLength >= 8
    && bytes[4] === 0x54
    && bytes[5] === 0x46
    && bytes[6] === 0x4c
    && bytes[7] === 0x33
}

export async function importObjectDetectionModel(file: File): Promise<ObjectDetectionModel> {
  if (!file.name.toLowerCase().endsWith('.tflite')) {
    throw new Error('请选择扩展名为 .tflite 的 MediaPipe 物体检测模型')
  }
  if (file.size <= 0) throw new Error('模型文件为空')
  if (file.size > OBJECT_MODEL_MAX_FILE_BYTES) throw new Error('自定义模型不能超过 100 MB')
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!hasTfliteIdentifier(bytes)) throw new Error('文件不是有效的 TensorFlow Lite 模型')
  customModelSequence += 1
  return {
    id: `custom-object-model-${customModelSequence}`,
    kind: 'custom',
    name: cleanDisplayFilename(file.name, 'custom-model.tflite'),
    size: bytes.byteLength,
    bytes,
  }
}

export async function loadObjectDetectionLabels(file: File): Promise<string[]> {
  if (!file.name.toLowerCase().endsWith('.txt')) throw new Error('标签映射必须是 UTF-8 TXT 文件')
  if (file.size <= 0) throw new Error('标签文件为空')
  if (file.size > OBJECT_LABELS_MAX_FILE_BYTES) throw new Error('标签文件不能超过 256 KB')
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()).replace(/^\uFEFF/, '')
  } catch {
    throw new Error('标签文件必须使用 UTF-8 编码')
  }
  const labels = text.split(/\r?\n/)
  if (labels.at(-1) === '') labels.pop()
  if (labels.length === 0) throw new Error('标签文件没有可用标签')
  if (labels.length > 10_000) throw new Error('标签文件最多包含 10000 行')
  return labels.map((label, index) => {
    const normalized = [...label.trim()].slice(0, 160).join('')
    return normalized || `类别 ${index}`
  })
}

export async function prepareObjectDetectionModel(model: ObjectDetectionModel) {
  try {
    await getDetector(model)
  } catch {
    if (model.kind === 'custom') {
      throw new Error('模型与 MediaPipe ObjectDetector 不兼容；请确认它包含物体检测元数据和受支持的输入、输出张量')
    }
    throw new Error('无法加载随包物体检测模型')
  }
}

export function releaseObjectDetectionModel(model: ObjectDetectionModel) {
  if (model.kind !== 'custom' || customDetectorEntry?.id !== model.id) return
  const entry = customDetectorEntry
  customDetectorEntry = null
  closeDetectorEntry(entry)
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value))
}

export function objectLabel(category: string) {
  const normalized = category.trim().toLowerCase()
  return labelTranslations[normalized] ?? (category.trim() || '未知物体')
}

export function normalizeDetectedObject(detection: DetectedObject): DetectedObject | null {
  const x = clampUnit(detection.x)
  const y = clampUnit(detection.y)
  const width = Math.max(0, Math.min(1 - x, detection.width))
  const height = Math.max(0, Math.min(1 - y, detection.height))
  if (width < 0.003 || height < 0.003) return null
  return { ...detection, x, y, width, height }
}

export async function detectObjects(
  dataUrl: string,
  model: ObjectDetectionModel = BUNDLED_OBJECT_MODEL,
): Promise<DetectedObject[]> {
  const image = await loadImage(dataUrl)
  const result = (await getDetector(model)).detect(image)
  return result.detections.flatMap((detection, index) => {
    const bounds = detection.boundingBox
    const category = detection.categories[0]
    if (!bounds || !category) return []
    const embeddedCategory = category.categoryName.trim()
    const categoryName = embeddedCategory || `class-${category.index}`
    const externalLabel = model.labels?.[category.index]?.trim()
    const normalized = normalizeDetectedObject({
      id: `object-${index + 1}`,
      category: categoryName,
      label: externalLabel || objectLabel(embeddedCategory || `类别 ${category.index}`),
      confidence: category.score,
      x: bounds.originX / image.naturalWidth,
      y: bounds.originY / image.naturalHeight,
      width: bounds.width / image.naturalWidth,
      height: bounds.height / image.naturalHeight,
      enabled: true,
    })
    return normalized ? [normalized] : []
  })
}

const colors = ['#f4b942', '#2ba86f', '#4a83e3', '#d65c7a', '#845ec2', '#e07a32']

export async function renderObjectAnnotations(dataUrl: string, detections: DetectedObject[]) {
  const image = await loadImage(dataUrl)
  const maxDimension = 4_096
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建物体标注画布')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  const fontSize = Math.max(14, Math.round(Math.min(canvas.width, canvas.height) * 0.026))
  context.font = `700 ${fontSize}px system-ui, sans-serif`
  context.textBaseline = 'top'
  detections.filter((detection) => detection.enabled).forEach((detection, index) => {
    const color = colors[index % colors.length]
    const x = Math.round(detection.x * canvas.width)
    const y = Math.round(detection.y * canvas.height)
    const width = Math.round(detection.width * canvas.width)
    const height = Math.round(detection.height * canvas.height)
    context.strokeStyle = color
    context.lineWidth = Math.max(3, Math.round(fontSize * 0.18))
    context.strokeRect(x, y, width, height)
    const text = `${detection.label} ${Math.round(detection.confidence * 100)}%`
    const padding = Math.max(4, Math.round(fontSize * 0.3))
    const textWidth = Math.ceil(context.measureText(text).width)
    const labelY = Math.max(0, y - fontSize - padding * 2)
    context.fillStyle = color
    context.fillRect(x, labelY, Math.min(canvas.width - x, textWidth + padding * 2), fontSize + padding * 2)
    context.fillStyle = '#101713'
    context.fillText(text, x + padding, labelY + padding)
  })

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
  }
}

export function buildObjectDetectionJson(detections: DetectedObject[]) {
  return JSON.stringify(detections.filter((detection) => detection.enabled).map((detection) => ({
    label: detection.label,
    category: detection.category,
    confidence: Number(detection.confidence.toFixed(4)),
    box: {
      x: Number(detection.x.toFixed(4)),
      y: Number(detection.y.toFixed(4)),
      width: Number(detection.width.toFixed(4)),
      height: Number(detection.height.toFixed(4)),
    },
  })), null, 2)
}

export function objectAnnotatedFilename(filename: string) {
  const base = [...filename.replace(/\.[^.]+$/, '')]
    .map((character) => character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '-' : character)
    .join('')
  return `${base || 'photo'}-objects.png`
}

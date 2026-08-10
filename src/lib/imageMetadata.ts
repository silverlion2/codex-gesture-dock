export type ImageMetadataInspectionStatus = 'inspected' | 'unsupported' | 'failed'

export type ImageMetadataRisk = 'high' | 'medium'

export interface ImageMetadataItem {
  id: string
  label: string
  value: string
  risk: ImageMetadataRisk
}

export interface ImageMetadataReport {
  status: ImageMetadataInspectionStatus
  items: ImageMetadataItem[]
  hasGps: boolean
  message?: string
}

type RawMetadata = Record<string, unknown>

const INSPECTED_MIME_TYPES = new Set(['image/jpeg', 'image/png'])

const PRIVACY_TAGS = [
  'Make',
  'Model',
  'Software',
  'DateTime',
  'DateTimeOriginal',
  'CreateDate',
  'ModifyDate',
  'Artist',
  'Copyright',
  'ImageDescription',
  'XPComment',
  'OwnerName',
  'SerialNumber',
  'CameraSerialNumber',
  'LensModel',
  'LensSerialNumber',
  'UserComment',
] as const

function compactText(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.valueOf())) {
    const pad = (part: number) => String(part).padStart(2, '0')
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
  }
  if (typeof value === 'string') return value.replace(/\0/g, '').replace(/\s+/g, ' ').trim().slice(0, 240)
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function firstValue(raw: RawMetadata, keys: readonly string[]) {
  for (const key of keys) {
    const value = compactText(raw[key])
    if (value) return value
  }
  return ''
}

function uniqueValues(raw: RawMetadata, keys: readonly string[]) {
  return [...new Set(keys.map((key) => compactText(raw[key])).filter(Boolean))]
}

function finiteCoordinate(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function summarizeImageMetadata(
  raw: RawMetadata = {},
  gps?: { latitude?: unknown; longitude?: unknown },
): Pick<ImageMetadataReport, 'items' | 'hasGps'> {
  const items: ImageMetadataItem[] = []
  const latitude = finiteCoordinate(gps?.latitude ?? raw.latitude)
  const longitude = finiteCoordinate(gps?.longitude ?? raw.longitude)
  const hasGps = latitude !== undefined && longitude !== undefined

  if (hasGps) {
    items.push({
      id: 'gps',
      label: '拍摄位置',
      value: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
      risk: 'high',
    })
  }

  const device = uniqueValues(raw, ['Make', 'Model']).join(' ')
  if (device) items.push({ id: 'device', label: '相机或设备', value: device, risk: 'medium' })

  const serials = uniqueValues(raw, ['SerialNumber', 'CameraSerialNumber', 'LensSerialNumber'])
  if (serials.length > 0) {
    items.push({ id: 'serial', label: '设备序列号', value: serials.join(' / '), risk: 'high' })
  }

  const capturedAt = firstValue(raw, ['DateTimeOriginal', 'CreateDate', 'DateTime', 'ModifyDate'])
  if (capturedAt) items.push({ id: 'time', label: '拍摄时间', value: capturedAt, risk: 'medium' })

  const owner = uniqueValues(raw, ['OwnerName', 'Artist', 'Copyright']).join(' / ')
  if (owner) items.push({ id: 'owner', label: '作者或版权', value: owner, risk: 'medium' })

  const software = firstValue(raw, ['Software'])
  if (software) items.push({ id: 'software', label: '处理软件', value: software, risk: 'medium' })

  const lens = firstValue(raw, ['LensModel'])
  if (lens) items.push({ id: 'lens', label: '镜头型号', value: lens, risk: 'medium' })

  const description = firstValue(raw, ['ImageDescription', 'XPComment', 'UserComment'])
  if (description) items.push({ id: 'description', label: '描述或备注', value: description, risk: 'medium' })

  return { items, hasGps }
}

function supportsCommonMetadataInspection(file: File) {
  if (INSPECTED_MIME_TYPES.has(file.type.toLowerCase())) return true
  return /\.(?:jpe?g|png)$/i.test(file.name)
}

export async function inspectImageMetadata(file: File): Promise<ImageMetadataReport> {
  if (!supportsCommonMetadataInspection(file)) {
    return {
      status: 'unsupported',
      items: [],
      hasGps: false,
      message: 'WebP/BMP 可继续安全重编码，但当前只检查 JPEG/PNG 的常见 EXIF 隐私字段。',
    }
  }

  try {
    const exifr = await import('exifr')
    const [raw, gps] = await Promise.all([
      exifr.parse(file, { pick: [...PRIVACY_TAGS], userComment: true }),
      exifr.gps(file),
    ])
    const summary = summarizeImageMetadata(raw ?? {}, gps)
    return { status: 'inspected', ...summary }
  } catch {
    return {
      status: 'failed',
      items: [],
      hasGps: false,
      message: '无法完整读取这张照片的常见 EXIF 字段；仍可通过重新编码导出不携带原文件元数据的 PNG。',
    }
  }
}

export function metadataFreeFilename(filename: string) {
  const base = [...filename.replace(/\.[^.]+$/, '')]
    .map((character) => character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '-' : character)
    .join('')
    .replace(/[. ]+$/g, '')
    .slice(0, 80)
  return `${base || 'photo'}-metadata-free.png`
}

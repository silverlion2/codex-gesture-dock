import {
  IMAGE_OPTIMIZER_MAX_FILE_BYTES,
  optimizeImage,
  type ImageOptimizationOptions,
  type ImageOutputFormat,
  type OptimizedImage,
} from './imageOptimizer'

export const IMAGE_BATCH_MAX_FILES = 20
export const IMAGE_BATCH_MAX_TOTAL_BYTES = 200 * 1024 * 1024

export type BatchRenameMode = 'keep' | 'sequence'

export interface ImageBatchOptions extends ImageOptimizationOptions {
  renameMode: BatchRenameMode
  prefix: string
  suffix: string
  startNumber: number
}

export interface ProcessedBatchImage extends OptimizedImage {
  sourceFilename: string
  index: number
}

const supportedInputTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp'])

function safeNamePart(value: string, fallback = '') {
  const safe = [...value]
    .map((character) => character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '-' : character)
    .join('')
    .trim()
    .slice(0, 48)
    .replace(/[. ]+$/, '')
  if (!safe || safe === '.' || safe === '..') return fallback
  return safe
}

function safeStem(filename: string) {
  const stem = safeNamePart(filename.replace(/\.[^.]+$/, ''), 'image')
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem) ? `${stem}-file` : stem
}

function outputExtension(format: ImageOutputFormat) {
  return format === 'jpeg' ? 'jpg' : format
}

export function validateImageBatch(files: File[]) {
  if (files.length < 1) throw new Error('请至少选择 1 张图片')
  if (files.length > IMAGE_BATCH_MAX_FILES) throw new Error(`一次最多处理 ${IMAGE_BATCH_MAX_FILES} 张图片`)
  let totalBytes = 0
  for (const file of files) {
    if (!supportedInputTypes.has(file.type)) throw new Error(`不支持的图片格式：${file.name}`)
    if (file.size > IMAGE_OPTIMIZER_MAX_FILE_BYTES) throw new Error(`图片不能超过 35 MB：${file.name}`)
    totalBytes += file.size
  }
  if (totalBytes > IMAGE_BATCH_MAX_TOTAL_BYTES) throw new Error('所选图片合计不能超过 200 MB')
  return { files: [...files], totalBytes }
}

export function batchImageFilename(filename: string, index: number, options: Pick<ImageBatchOptions, 'format' | 'renameMode' | 'prefix' | 'suffix' | 'startNumber'>) {
  if (!Number.isInteger(index) || index < 0) throw new Error('图片序号无效')
  if (!Number.isInteger(options.startNumber) || options.startNumber < 0 || options.startNumber > 999_999) {
    throw new Error('起始编号必须是 0–999999 的整数')
  }
  const prefix = safeNamePart(options.prefix)
  const suffix = safeNamePart(options.suffix)
  const sequence = String(options.startNumber + index).padStart(3, '0')
  const core = options.renameMode === 'sequence' ? sequence : `${safeStem(filename)}-${sequence}`
  const stem = safeNamePart(`${prefix}${core}${suffix}`, 'image')
  const windowsSafeStem = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem) ? `${stem}-file` : stem
  return `${windowsSafeStem}.${outputExtension(options.format)}`
}

export async function processBatchImage(file: File, index: number, options: ImageBatchOptions, signal?: AbortSignal): Promise<ProcessedBatchImage> {
  validateImageBatch([file])
  const result = await optimizeImage(file, options, signal)
  return {
    ...result,
    filename: batchImageFilename(file.name, index, options),
    sourceFilename: file.name,
    index,
  }
}

export const IMAGE_SIMILARITY_MAX_FILES = 20
export const IMAGE_SIMILARITY_MAX_FILE_BYTES = 35 * 1024 * 1024
export const IMAGE_SIMILARITY_MAX_TOTAL_BYTES = 200 * 1024 * 1024
export const IMAGE_SIMILARITY_HASH_BITS = 128

const HASH_GRID_SIZE = 8
const SAMPLE_GRID_SIZE = HASH_GRID_SIZE + 1
const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp'])

export interface SimilarImageFingerprint {
  id: string
  filename: string
  size: number
  width: number
  height: number
  hash: string
  exactDigest: string
  previewDataUrl: string
}

export interface SimilarImageIssue {
  filename: string
  message: string
}

export interface SimilarImagePair {
  id: string
  left: SimilarImageFingerprint
  right: SimilarImageFingerprint
  distance: number
  similarity: number
  exactBytes: boolean
}

export interface SimilarImageBatchResult {
  items: SimilarImageFingerprint[]
  issues: SimilarImageIssue[]
}

interface AnalyzeSimilarImagesOptions {
  signal?: AbortSignal
  onProgress?: (completed: number, total: number, filename: string) => void
}

function assertFiniteLuminance(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(255, value)) : 0
}

function bitsToHex(bits: number[]) {
  let result = ''
  for (let offset = 0; offset < bits.length; offset += 4) {
    const nibble = bits[offset] * 8 + bits[offset + 1] * 4 + bits[offset + 2] * 2 + bits[offset + 3]
    result += nibble.toString(16)
  }
  return result
}

export function computeDifferenceHash(luminance: ArrayLike<number>) {
  if (luminance.length !== SAMPLE_GRID_SIZE * SAMPLE_GRID_SIZE) {
    throw new Error('感知哈希需要 9 × 9 亮度样本')
  }
  const bits: number[] = []
  for (let y = 0; y < HASH_GRID_SIZE; y += 1) {
    for (let x = 0; x < HASH_GRID_SIZE; x += 1) {
      const current = assertFiniteLuminance(luminance[y * SAMPLE_GRID_SIZE + x])
      const right = assertFiniteLuminance(luminance[y * SAMPLE_GRID_SIZE + x + 1])
      bits.push(current < right ? 1 : 0)
    }
  }
  for (let y = 0; y < HASH_GRID_SIZE; y += 1) {
    for (let x = 0; x < HASH_GRID_SIZE; x += 1) {
      const current = assertFiniteLuminance(luminance[y * SAMPLE_GRID_SIZE + x])
      const below = assertFiniteLuminance(luminance[(y + 1) * SAMPLE_GRID_SIZE + x])
      bits.push(current < below ? 1 : 0)
    }
  }
  return bitsToHex(bits)
}

export function hammingDistance(leftHash: string, rightHash: string) {
  if (!/^[0-9a-f]{32}$/i.test(leftHash) || !/^[0-9a-f]{32}$/i.test(rightHash)) {
    throw new Error('感知哈希必须是 128 位十六进制值')
  }
  let distance = 0
  for (let index = 0; index < leftHash.length; index += 1) {
    let value = Number.parseInt(leftHash[index], 16) ^ Number.parseInt(rightHash[index], 16)
    while (value > 0) {
      distance += value & 1
      value >>= 1
    }
  }
  return distance
}

export function findSimilarImagePairs(items: SimilarImageFingerprint[], maxDistance: number) {
  const normalizedDistance = Math.max(0, Math.min(32, Math.round(maxDistance)))
  const pairs: SimilarImagePair[] = []
  for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
      const left = items[leftIndex]
      const right = items[rightIndex]
      const distance = hammingDistance(left.hash, right.hash)
      const exactBytes = left.exactDigest.length > 0 && left.exactDigest === right.exactDigest
      if (!exactBytes && distance > normalizedDistance) continue
      pairs.push({
        id: `${left.id}:${right.id}`,
        left,
        right,
        distance,
        similarity: (1 - distance / IMAGE_SIMILARITY_HASH_BITS) * 100,
        exactBytes,
      })
    }
  }
  return pairs.sort((left, right) => Number(right.exactBytes) - Number(left.exactBytes)
    || left.distance - right.distance
    || left.left.filename.localeCompare(right.left.filename)
    || left.right.filename.localeCompare(right.right.filename))
}

export function validateSimilarityFiles(files: File[]) {
  if (files.length < 2) throw new Error('请至少选择 2 张图片')
  if (files.length > IMAGE_SIMILARITY_MAX_FILES) throw new Error(`一次最多选择 ${IMAGE_SIMILARITY_MAX_FILES} 张图片`)
  let totalBytes = 0
  for (const file of files) {
    if (!supportedTypes.has(file.type)) throw new Error(`${file.name} 不是受支持的 PNG、JPEG、WebP 或 BMP 图片`)
    if (file.size > IMAGE_SIMILARITY_MAX_FILE_BYTES) throw new Error(`${file.name} 超过 35 MB`)
    totalBytes += file.size
  }
  if (totalBytes > IMAGE_SIMILARITY_MAX_TOTAL_BYTES) throw new Error('所选图片合计不能超过 200 MB')
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('图片分析已取消', 'AbortError')
}

function loadFileImage(file: File, signal?: AbortSignal) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    throwIfAborted(signal)
    const url = URL.createObjectURL(file)
    const image = new Image()
    const cleanup = () => {
      URL.revokeObjectURL(url)
      signal?.removeEventListener('abort', handleAbort)
    }
    const handleAbort = () => {
      cleanup()
      image.src = ''
      reject(new DOMException('图片分析已取消', 'AbortError'))
    }
    image.onload = () => {
      cleanup()
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        reject(new Error('图片尺寸无效'))
        return
      }
      resolve(image)
    }
    image.onerror = () => {
      cleanup()
      reject(new Error('无法解码图片'))
    }
    signal?.addEventListener('abort', handleAbort, { once: true })
    image.src = url
  })
}

function sampleLuminance(image: HTMLImageElement) {
  const canvas = document.createElement('canvas')
  canvas.width = SAMPLE_GRID_SIZE
  canvas.height = SAMPLE_GRID_SIZE
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true })
  if (!context) throw new Error('当前设备无法创建感知哈希画布')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, SAMPLE_GRID_SIZE, SAMPLE_GRID_SIZE)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, SAMPLE_GRID_SIZE, SAMPLE_GRID_SIZE)
  const pixels = context.getImageData(0, 0, SAMPLE_GRID_SIZE, SAMPLE_GRID_SIZE).data
  const luminance = new Float32Array(SAMPLE_GRID_SIZE * SAMPLE_GRID_SIZE)
  for (let pixel = 0; pixel < luminance.length; pixel += 1) {
    const offset = pixel * 4
    luminance[pixel] = pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114
  }
  return luminance
}

function createPreview(image: HTMLImageElement) {
  const maxWidth = 240
  const maxHeight = 150
  const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight)
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('当前设备无法创建重复图片预览')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', 0.82)
}

async function digestFile(file: File) {
  if (!globalThis.crypto?.subtle) return ''
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
}

export async function analyzeSimilarImages(
  files: File[],
  { signal, onProgress }: AnalyzeSimilarImagesOptions = {},
): Promise<SimilarImageBatchResult> {
  validateSimilarityFiles(files)
  const items: SimilarImageFingerprint[] = []
  const issues: SimilarImageIssue[] = []
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]
    throwIfAborted(signal)
    onProgress?.(index, files.length, file.name)
    try {
      const image = await loadFileImage(file, signal)
      throwIfAborted(signal)
      const [exactDigest] = await Promise.all([digestFile(file)])
      throwIfAborted(signal)
      items.push({
        id: `${index}-${file.name}-${file.size}`,
        filename: file.name,
        size: file.size,
        width: image.naturalWidth,
        height: image.naturalHeight,
        hash: computeDifferenceHash(sampleLuminance(image)),
        exactDigest,
        previewDataUrl: createPreview(image),
      })
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') throw caught
      issues.push({ filename: file.name, message: caught instanceof Error ? caught.message : '无法分析图片' })
    }
    onProgress?.(index + 1, files.length, file.name)
  }
  return { items, issues }
}

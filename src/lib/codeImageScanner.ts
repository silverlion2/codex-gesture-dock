import type { CodeScanResult } from '../hooks/useCodeScanner'

export const CODE_IMAGE_MAX_BYTES = 35 * 1024 * 1024
export const CODE_IMAGE_BATCH_MAX_FILES = 20
export const CODE_IMAGE_BATCH_MAX_BYTES = 200 * 1024 * 1024
const supportedCodeImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp'])

export interface BatchCodeScanItem {
  filename: string
  status: 'detected' | 'not-found' | 'error'
  text: string
  format: string
  error: string
}

function validateCodeImage(file: File) {
  if (!supportedCodeImageTypes.has(file.type.toLowerCase())) throw new Error('请选择 PNG、JPEG、WebP 或 BMP 图片')
  if (file.size > CODE_IMAGE_MAX_BYTES) throw new Error('扫码图片不能超过 35 MB')
}

export async function decodeCodeImage(file: File): Promise<CodeScanResult> {
  validateCodeImage(file)
  const url = URL.createObjectURL(file)
  try {
    const { BarcodeFormat, BrowserMultiFormatReader } = await import('@zxing/browser')
    const result = await new BrowserMultiFormatReader().decodeFromImageUrl(url)
    return {
      text: result.getText(),
      format: BarcodeFormat[result.getBarcodeFormat()] ?? 'CODE',
    }
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : ''
    if (/notfound|no multi format readers|no code/i.test(message)) {
      throw new Error('图片中未找到可识别的二维码或条码')
    }
    throw new Error(message || '无法识别这张扫码图片')
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function decodeCodeImageBatch(
  files: File[],
  onProgress?: (completed: number, total: number) => void,
  signal?: AbortSignal,
): Promise<BatchCodeScanItem[]> {
  if (files.length < 2 || files.length > CODE_IMAGE_BATCH_MAX_FILES) throw new Error(`批量扫码请选择 2–${CODE_IMAGE_BATCH_MAX_FILES} 张图片`)
  if (files.reduce((total, file) => total + file.size, 0) > CODE_IMAGE_BATCH_MAX_BYTES) throw new Error('批量扫码图片合计不能超过 200 MB')
  files.forEach(validateCodeImage)
  const items: BatchCodeScanItem[] = []
  for (const file of files) {
    if (signal?.aborted) throw new DOMException('已取消批量扫码', 'AbortError')
    try {
      const result = await decodeCodeImage(file)
      items.push({ filename: file.name, status: 'detected', text: result.text, format: result.format, error: '' })
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '无法识别这张扫码图片'
      items.push({ filename: file.name, status: message.includes('未找到') ? 'not-found' : 'error', text: '', format: '', error: message })
    }
    onProgress?.(items.length, files.length)
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
  return items
}

function csvCell(value: string) {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value
  return `"${safe.replaceAll('"', '""')}"`
}

export function codeScanBatchCsv(items: BatchCodeScanItem[]) {
  const rows = [['filename', 'status', 'format', 'text', 'error'], ...items.map((item) => [item.filename, item.status, item.format, item.text, item.error])]
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}

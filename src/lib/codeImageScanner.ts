import type { CodeScanResult } from '../hooks/useCodeScanner'

export const CODE_IMAGE_MAX_BYTES = 35 * 1024 * 1024
const supportedCodeImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp'])

export async function decodeCodeImage(file: File): Promise<CodeScanResult> {
  if (!supportedCodeImageTypes.has(file.type.toLowerCase())) throw new Error('请选择 PNG、JPEG、WebP 或 BMP 图片')
  if (file.size > CODE_IMAGE_MAX_BYTES) throw new Error('扫码图片不能超过 35 MB')
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

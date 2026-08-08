import type { Worker } from 'tesseract.js'

export type OcrLanguage = 'eng' | 'eng+chi_sim' | 'eng+chi_tra'

export interface OcrProgress {
  progress: number
  message: string
  page: number
  pageCount: number
}

export interface OcrResult {
  text: string
  pageCount: number
  source: 'embedded-text' | 'ocr' | 'mixed'
}

export const OCR_MAX_FILE_BYTES = 35 * 1024 * 1024
export const OCR_MAX_PDF_PAGES = 20

function localAsset(path: string) {
  return new URL(`ocr/${path}`, document.baseURI).href
}

function assertSupportedFile(file: File) {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  const isImage = file.type.startsWith('image/')
  if (!isPdf && !isImage) throw new Error('请选择 PDF、PNG、JPEG 或 WebP 文件')
  if (file.size > OCR_MAX_FILE_BYTES) throw new Error('文件不能超过 35 MB')
  return isPdf
}

function ensureNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('识别已取消', 'AbortError')
}

function pageText(items: unknown[]) {
  return items
    .map((item) => {
      if (!item || typeof item !== 'object' || !('str' in item)) return ''
      const typed = item as { str: string; hasEOL?: boolean }
      return `${typed.str}${typed.hasEOL ? '\n' : ' '}`
    })
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export async function recognizeLocalFile(
  file: File,
  language: OcrLanguage,
  onProgress: (progress: OcrProgress) => void,
  signal?: AbortSignal,
): Promise<OcrResult> {
  const isPdf = assertSupportedFile(file)
  let worker: Worker | null = null
  let activePage = 1
  let pageCount = 1

  const getWorker = async () => {
    if (worker) return worker
    ensureNotAborted(signal)
    const { createWorker, OEM } = await import('tesseract.js')
    worker = await createWorker(language.split('+'), OEM.LSTM_ONLY, {
      workerPath: localAsset('worker.min.js'),
      corePath: localAsset('core'),
      langPath: localAsset('lang'),
      logger: ({ progress, status }) => {
        onProgress({
          progress: Math.min(0.99, ((activePage - 1) + progress) / pageCount),
          message: status === 'recognizing text' ? '正在识别文字' : '正在准备本地模型',
          page: activePage,
          pageCount,
        })
      },
    })
    ensureNotAborted(signal)
    return worker
  }

  const abortWorker = () => {
    void worker?.terminate()
  }
  signal?.addEventListener('abort', abortWorker, { once: true })

  try {
    if (!isPdf) {
      onProgress({ progress: 0.02, message: '正在准备本地模型', page: 1, pageCount: 1 })
      const result = await (await getWorker()).recognize(file)
      ensureNotAborted(signal)
      const text = result.data.text.trim()
      if (!text) throw new Error('未识别到文字，请尝试更清晰、对比度更高的图像')
      onProgress({ progress: 1, message: '识别完成', page: 1, pageCount: 1 })
      return { text, pageCount: 1, source: 'ocr' }
    }

    onProgress({ progress: 0.01, message: '正在读取 PDF', page: 1, pageCount: 1 })
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = localAsset('pdf.worker.min.mjs')
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
    pageCount = pdf.numPages
    if (pageCount > OCR_MAX_PDF_PAGES) {
      throw new Error(`PDF 最多支持 ${OCR_MAX_PDF_PAGES} 页，请先拆分文件`)
    }

    const textPages: string[] = []
    let ocrPages = 0
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      ensureNotAborted(signal)
      activePage = pageNumber
      onProgress({
        progress: (pageNumber - 1) / pageCount,
        message: '正在读取 PDF 页面',
        page: pageNumber,
        pageCount,
      })
      const page = await pdf.getPage(pageNumber)
      const embedded = pageText((await page.getTextContent()).items)
      if (embedded.length >= 20) {
        textPages.push(embedded)
        continue
      }

      ocrPages += 1
      const viewport = page.getViewport({ scale: 2 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) throw new Error('当前设备无法渲染 PDF 页面')
      await page.render({ canvas, canvasContext: context, viewport }).promise
      const result = await (await getWorker()).recognize(canvas)
      textPages.push(result.data.text.trim())
      page.cleanup()
    }

    const text = textPages
      .map((value, index) => pageCount > 1 ? `--- 第 ${index + 1} 页 ---\n${value}` : value)
      .join('\n\n')
      .trim()
    if (!text) throw new Error('未识别到文字，请尝试更清晰的文件')
    onProgress({ progress: 1, message: '识别完成', page: pageCount, pageCount })
    return {
      text,
      pageCount,
      source: ocrPages === 0 ? 'embedded-text' : ocrPages === pageCount ? 'ocr' : 'mixed',
    }
  } finally {
    signal?.removeEventListener('abort', abortWorker)
    await (worker as Worker | null)?.terminate().catch(() => undefined)
  }
}

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
  regions?: OcrRegion[]
}

export interface OcrRegion {
  text: string
  recognizedText?: string
  humanReviewed?: boolean
  confidence: number
  lineId: string
  x0: number
  y0: number
  x1: number
  y1: number
}

export const OCR_MAX_FILE_BYTES = 35 * 1024 * 1024
export const OCR_MAX_PDF_PAGES = 20

export type LocalOcrRecognizer = (
  file: File,
  onProgress: (progress: OcrProgress) => void,
  signal?: AbortSignal,
) => Promise<OcrResult>

export interface LocalOcrSession {
  readonly language: OcrLanguage
  recognizeFile: LocalOcrRecognizer
  terminate: () => Promise<void>
}

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

interface ProgressContext {
  activePage: number
  pageCount: number
  onProgress: (progress: OcrProgress) => void
}

class ReusableLocalOcrSession implements LocalOcrSession {
  readonly language: OcrLanguage
  private worker: Worker | null = null
  private workerPromise: Promise<Worker> | null = null
  private progressContext: ProgressContext | null = null
  private busy = false
  private closed = false

  constructor(language: OcrLanguage) {
    this.language = language
  }

  private async resetWorker() {
    const worker = this.worker
    const pendingWorker = this.workerPromise
    this.worker = null
    this.workerPromise = null
    if (worker) {
      await worker.terminate().catch(() => undefined)
      return
    }
    if (pendingWorker) {
      await pendingWorker.catch(() => undefined)
    }
  }

  private async getWorker(signal?: AbortSignal) {
    ensureNotAborted(signal)
    if (this.closed) throw new Error('OCR 会话已关闭')
    if (this.worker) return this.worker
    if (this.workerPromise) return this.workerPromise

    const workerPromise = import('tesseract.js').then(async ({ createWorker, OEM }) => createWorker(
      this.language.split('+'),
      OEM.LSTM_ONLY,
      {
        workerPath: localAsset('worker.min.js'),
        corePath: localAsset('core'),
        langPath: localAsset('lang'),
        logger: ({ progress, status }) => {
          const context = this.progressContext
          if (!context) return
          context.onProgress({
            progress: Math.min(0.99, ((context.activePage - 1) + progress) / context.pageCount),
            message: status === 'recognizing text' ? '正在识别文字' : '正在准备本地模型',
            page: context.activePage,
            pageCount: context.pageCount,
          })
        },
      },
    ))
    this.workerPromise = workerPromise

    try {
      const createdWorker = await workerPromise
      if (this.closed || signal?.aborted || this.workerPromise !== workerPromise) {
        await createdWorker.terminate().catch(() => undefined)
        ensureNotAborted(signal)
        throw new Error('OCR 会话已关闭')
      }
      this.worker = createdWorker
      return createdWorker
    } finally {
      if (this.workerPromise === workerPromise) this.workerPromise = null
    }
  }

  private async recognizeImage(
    image: File | HTMLCanvasElement,
    signal: AbortSignal | undefined,
    output?: { text: true; blocks: true },
  ) {
    try {
      const worker = await this.getWorker(signal)
      return await worker.recognize(image, {}, output)
    } catch (caught) {
      await this.resetWorker()
      ensureNotAborted(signal)
      throw caught
    }
  }

  recognizeFile: LocalOcrRecognizer = async (file, onProgress, signal) => {
    if (this.busy) throw new Error('同一 OCR 会话不能并行识别多个文件')
    if (this.closed) throw new Error('OCR 会话已关闭')
    const isPdf = assertSupportedFile(file)
    this.busy = true
    const context: ProgressContext = { activePage: 1, pageCount: 1, onProgress }
    this.progressContext = context
    const abortWorker = () => { void this.resetWorker() }
    signal?.addEventListener('abort', abortWorker, { once: true })

    try {
      if (!isPdf) {
        onProgress({ progress: 0.02, message: '正在准备本地模型', page: 1, pageCount: 1 })
        const result = await this.recognizeImage(file, signal, { text: true, blocks: true })
        ensureNotAborted(signal)
        const text = result.data.text.trim()
        if (!text) throw new Error('未识别到文字，请尝试更清晰、对比度更高的图像')
        const regions = result.data.blocks?.flatMap((block, blockIndex) => block.paragraphs.flatMap((paragraph, paragraphIndex) => paragraph.lines.flatMap((line, lineIndex) => line.words.map((word) => ({
          text: word.text,
          confidence: word.confidence,
          lineId: `${blockIndex}-${paragraphIndex}-${lineIndex}`,
          ...word.bbox,
        }))))) ?? []
        onProgress({ progress: 1, message: '识别完成', page: 1, pageCount: 1 })
        return { text, pageCount: 1, source: 'ocr', regions }
      }

      onProgress({ progress: 0.01, message: '正在读取 PDF', page: 1, pageCount: 1 })
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = localAsset('pdf.worker.min.mjs')
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
      const pageCount = pdf.numPages
      context.pageCount = pageCount
      if (pageCount > OCR_MAX_PDF_PAGES) {
        throw new Error(`PDF 最多支持 ${OCR_MAX_PDF_PAGES} 页，请先拆分文件`)
      }

      const textPages: string[] = []
      let ocrPages = 0
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        ensureNotAborted(signal)
        context.activePage = pageNumber
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
          page.cleanup()
          continue
        }

        ocrPages += 1
        const viewport = page.getViewport({ scale: 2 })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        const canvasContext = canvas.getContext('2d', { alpha: false })
        if (!canvasContext) throw new Error('当前设备无法渲染 PDF 页面')
        await page.render({ canvas, canvasContext, viewport }).promise
        const result = await this.recognizeImage(canvas, signal)
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
      if (this.progressContext === context) this.progressContext = null
      this.busy = false
    }
  }

  async terminate() {
    if (this.closed) return
    this.closed = true
    await this.resetWorker()
  }
}

export function createLocalOcrSession(language: OcrLanguage): LocalOcrSession {
  return new ReusableLocalOcrSession(language)
}

export async function withLocalOcrSession<T>(
  language: OcrLanguage,
  run: (recognize: LocalOcrRecognizer) => Promise<T>,
) {
  const session = createLocalOcrSession(language)
  try {
    return await run(session.recognizeFile)
  } finally {
    await session.terminate()
  }
}

export async function recognizeLocalFile(
  file: File,
  language: OcrLanguage,
  onProgress: (progress: OcrProgress) => void,
  signal?: AbortSignal,
): Promise<OcrResult> {
  return withLocalOcrSession(language, (recognize) => recognize(file, onProgress, signal))
}

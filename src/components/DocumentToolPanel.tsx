import {
  Check,
  Copy,
  Download,
  FilePlus2,
  FileScan,
  FileText,
  ImageDown,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react'
import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import {
  captureFromImageFile,
  downloadScannedPage,
  downloadScannedPdf,
  scanCapturedDocument,
  type DocumentFilter,
  type ScannedDocumentPage,
} from '../lib/documentScanner'
import { captureVideoFrame, type CapturedDocument } from '../lib/cameraTools'
import { recognizeLocalFile, type OcrProgress } from '../lib/localOcr'

interface DocumentToolPanelProps {
  videoRef: RefObject<HTMLVideoElement | null>
  mirrored: boolean
  sessionReady: boolean
  onMessage: (message: string) => void
}

type WorkPhase = 'scanning' | 'ocr' | 'exporting' | null

const filterLabels: Record<DocumentFilter, string> = {
  document: '黑白文档',
  grayscale: '灰度',
  color: '彩色',
}

function pageAsFile(page: ScannedDocumentPage) {
  return fetch(page.dataUrl)
    .then((response) => response.blob())
    .then((blob) => new File([blob], page.filename, { type: 'image/png' }))
}

export function DocumentToolPanel({
  videoRef,
  mirrored,
  sessionReady,
  onMessage,
}: DocumentToolPanelProps) {
  const uploadId = useId()
  const addPageId = useId()
  const [pages, setPages] = useState<ScannedDocumentPage[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [filter, setFilter] = useState<DocumentFilter>('document')
  const [phase, setPhase] = useState<WorkPhase>(null)
  const [progressMessage, setProgressMessage] = useState('')
  const [error, setError] = useState('')
  const [ocrText, setOcrText] = useState('')
  const [copied, setCopied] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const activePage = pages[activeIndex] ?? null

  useEffect(() => () => abortRef.current?.abort(), [])

  const processCapture = async (capture: CapturedDocument, replaceIndex?: number) => {
    setPhase('scanning')
    setError('')
    setOcrText('')
    try {
      const page = await scanCapturedDocument(capture, filter, setProgressMessage)
      if (typeof replaceIndex === 'number') {
        setPages((current) => current.map((item, index) => index === replaceIndex ? { ...page, id: item.id } : item))
      } else {
        setPages((current) => [...current, page])
        setActiveIndex(pages.length)
      }
      onMessage(page.autoDetected ? '已检测纸张边缘并完成透视矫正' : '未检测到完整边缘，已增强整张图像')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '智能文档扫描失败')
    } finally {
      setPhase(null)
      setProgressMessage('')
    }
  }

  const capturePage = () => {
    const video = videoRef.current
    if (!video) return
    try {
      void processCapture(captureVideoFrame(video, mirrored))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '文档拍摄失败')
    }
  }

  const importPage = async (file: File) => {
    try {
      await processCapture(await captureFromImageFile(file))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法导入文档照片')
    }
  }

  const applyFilter = () => {
    if (!activePage) return
    void processCapture({
      dataUrl: activePage.sourceDataUrl,
      filename: activePage.filename.replace(/-processed\.png$/i, '.png'),
    }, activeIndex)
  }

  const removePage = () => {
    const remainingPages = pages.filter((_, index) => index !== activeIndex)
    setPages(remainingPages)
    setActiveIndex(Math.max(0, Math.min(activeIndex, remainingPages.length - 1)))
    setOcrText('')
  }

  const exportPdf = async () => {
    setPhase('exporting')
    setError('')
    try {
      await downloadScannedPdf(pages)
      onMessage(`已生成 ${pages.length} 页本机 PDF`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'PDF 导出失败')
    } finally {
      setPhase(null)
    }
  }

  const recognizePage = async () => {
    if (!activePage) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('ocr')
    setError('')
    setOcrText('')
    try {
      const result = await recognizeLocalFile(
        await pageAsFile(activePage),
        'eng+chi_sim',
        (progress: OcrProgress) => setProgressMessage(`${progress.message} ${Math.round(progress.progress * 100)}%`),
        controller.signal,
      )
      if (!controller.signal.aborted) {
        setOcrText(result.text)
        onMessage('当前扫描页 OCR 已完成')
      }
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : '扫描页 OCR 失败')
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
        setPhase(null)
      }
      setProgressMessage('')
    }
  }

  const cancelOcr = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setPhase(null)
    setProgressMessage('')
    onMessage('已取消当前扫描页 OCR')
  }

  const copyOcr = async () => {
    try {
      await navigator.clipboard.writeText(ocrText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_500)
    } catch {
      onMessage('无法写入剪贴板，请手动选择识别文本')
    }
  }

  const fileInput = (id: string) => (
    <input
      id={id}
      className="sr-only"
      type="file"
      accept="image/png,image/jpeg,image/webp,image/bmp"
      onChange={(event) => {
        const file = event.target.files?.[0]
        if (file) void importPage(file)
        event.target.value = ''
      }}
    />
  )

  return (
    <section className="camera-tool-panel document-tool-panel" aria-label="智能文档扫描">
      <header>
        <div><FileScan size={17} aria-hidden="true" /><strong>智能文档扫描</strong></div>
        <span><ShieldCheck size={13} aria-hidden="true" />边缘检测与导出均在本机</span>
      </header>

      {error && <div className="document-scan-error" role="alert">{error}</div>}

      {phase && (
        <div className="document-processing" role="status" aria-live="polite">
          <span className="small-spinner" aria-hidden="true" />
          <div><strong>{phase === 'exporting' ? '正在生成 PDF' : progressMessage || '正在处理'}</strong><small>请保持此窗口打开</small></div>
          {phase === 'ocr' && <button type="button" onClick={cancelOcr}>取消 OCR</button>}
        </div>
      )}

      {!phase && pages.length === 0 && (
        <div className="document-capture-state smart-document-empty">
          <div>
            <FileScan size={24} aria-hidden="true" />
            <p>自动检测纸张、拉正透视并增强文字。可使用摄像头，也可导入已有照片。</p>
          </div>
          <label><span>扫描效果</span><select value={filter} onChange={(event) => setFilter(event.target.value as DocumentFilter)}>{Object.entries(filterLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <div>
            <button type="button" disabled={!sessionReady} onClick={capturePage}><FileScan size={15} aria-hidden="true" />{sessionReady ? '智能拍摄' : '请先启动摄像头'}</button>
            <label className="document-file-button" htmlFor={uploadId}><Upload size={15} aria-hidden="true" />导入照片</label>
            {fileInput(uploadId)}
          </div>
        </div>
      )}

      {!phase && activePage && (
        <div className="document-workbench">
          <div className="document-scan-preview">
            <img src={activePage.dataUrl} alt={`第 ${activeIndex + 1} 页扫描预览`} />
            <span>{activePage.autoDetected ? '已自动拉正' : '整图增强'}</span>
          </div>
          <div className="document-workbench-controls">
            <div className="document-page-strip" aria-label="扫描页">
              {pages.map((page, index) => (
                <button key={page.id} type="button" className={index === activeIndex ? 'is-active' : ''} aria-pressed={index === activeIndex} onClick={() => { setActiveIndex(index); setOcrText('') }}>
                  <img src={page.dataUrl} alt="" /><span>{index + 1}</span>
                </button>
              ))}
            </div>
            <div className="document-filter-row">
              <select aria-label="扫描效果" value={filter} onChange={(event) => setFilter(event.target.value as DocumentFilter)}>{Object.entries(filterLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <button type="button" onClick={applyFilter}>应用到本页</button>
            </div>
            <div className="document-actions">
              <button type="button" disabled={!sessionReady} onClick={capturePage}><FilePlus2 size={14} aria-hidden="true" />拍下一页</button>
              <label className="document-file-button" htmlFor={addPageId}><Upload size={14} aria-hidden="true" />导入一页</label>
              {fileInput(addPageId)}
              <button type="button" onClick={() => downloadScannedPage(activePage)}><ImageDown size={14} aria-hidden="true" />PNG</button>
              <button type="button" onClick={() => void exportPdf()}><Download size={14} aria-hidden="true" />{pages.length} 页 PDF</button>
              <button type="button" onClick={() => void recognizePage()}><FileText size={14} aria-hidden="true" />OCR 本页</button>
              <button type="button" aria-label="删除当前扫描页" onClick={removePage}><Trash2 size={14} aria-hidden="true" /></button>
            </div>
            {ocrText && (
              <div className="document-ocr-result">
                <textarea aria-label="当前扫描页 OCR 文本" value={ocrText} readOnly />
                <button type="button" onClick={() => void copyOcr()}>{copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}{copied ? '已复制' : '复制'}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

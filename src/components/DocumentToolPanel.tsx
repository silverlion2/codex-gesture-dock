import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Download,
  FilePlus2,
  FileCode2,
  FileScan,
  FileText,
  ImageDown,
  Crop,
  EyeOff,
  ReceiptText,
  Search,
  RotateCcw,
  RotateCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react'
import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react'
import {
  captureFromImageFile,
  captureFromPdfFile,
  applyDocumentRedactions,
  downloadScannedPage,
  downloadScannedPdf,
  rotateScannedDocumentPage,
  scanCapturedDocument,
  type DocumentCorners,
  type DocumentFilter,
  type DocumentRedaction,
  type DocumentRotationDirection,
  type ScannedDocumentPage,
} from '../lib/documentScanner'
import { captureVideoFrame, type CapturedDocument } from '../lib/cameraTools'
import {
  recognizeLocalFile,
  withLocalOcrSession,
  type LocalOcrRecognizer,
  type OcrProgress,
  type OcrRegion,
  type OcrLanguage,
} from '../lib/localOcr'
import { buildDocumentOcrText, documentLayoutFilename, documentOcrFilename, findDocumentOcrMatches } from '../lib/documentOcr'
import { findPiiSuggestions, type PiiSuggestion } from '../lib/piiSuggestions'
import type { MrzExtraction } from '../lib/mrzExtraction'
import { extractReceiptFields, type ReceiptFields } from '../lib/receiptFields'
import { DocumentCornerEditor } from './DocumentCornerEditor'
import { DocumentRedactionEditor } from './DocumentRedactionEditor'
import { ReceiptFieldsPanel } from './ReceiptFieldsPanel'
import { OcrConfidenceReview } from './OcrConfidenceReview'
import { OcrLayoutExportActions } from './OcrLayoutExportActions'
import { summarizeOcrConfidence } from '../lib/ocrConfidence'
import { applyOcrWordCorrections, type OcrWordCorrection } from '../lib/ocrCorrections'
import {
  createOcrLayoutDocument,
  serializeOcrLayoutAltoPages,
  serializeOcrLayoutCsvPages,
  serializeOcrLayoutHocrPages,
  serializeOcrLayoutJsonPages,
} from '../lib/ocrLayoutExport'
import {
  downloadSearchableScannedPdf,
  searchablePdfEligiblePageCount,
  type SearchableDocumentPdfPage,
} from '../lib/searchableDocumentPdf'

const MrzFieldsPanel = lazy(() => import('./MrzFieldsPanel'))

interface DocumentToolPanelProps {
  videoRef: RefObject<HTMLVideoElement | null>
  mirrored: boolean
  sessionReady: boolean
  onMessage: (message: string) => void
}

type WorkPhase = 'importing-pdf' | 'scanning' | 'redacting' | 'rotating' | 'ocr' | 'exporting' | null

interface PageOcrReview {
  language: OcrLanguage
  text: string
  originalText: string
  piiSuggestions: PiiSuggestion[]
  regions: OcrRegion[]
  originalRegions: OcrRegion[]
}

const scannerOcrLanguageOptions: Array<{ value: OcrLanguage; label: string }> = [
  { value: 'eng+chi_sim', label: '简中 + English' },
  { value: 'eng+chi_tra', label: '繁中 + English' },
  { value: 'eng', label: 'English' },
]

const filterLabels: Record<DocumentFilter, string> = {
  document: '黑白文档',
  grayscale: '灰度',
  color: '彩色',
}

function pageAsFile(page: ScannedDocumentPage) {
  const separator = page.dataUrl.indexOf(',')
  const header = page.dataUrl.slice(0, separator)
  if (separator < 0 || !header.includes(';base64')) throw new Error('扫描页图像格式无效')
  const mimeType = header.match(/^data:([^;]+)/)?.[1] ?? 'image/png'
  const binary = window.atob(page.dataUrl.slice(separator + 1))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new File([bytes], page.filename, { type: mimeType })
}

function downloadText(text: string, filename: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
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
  const [pageOcrReviews, setPageOcrReviews] = useState<Record<string, PageOcrReview>>({})
  const [copied, setCopied] = useState(false)
  const [editingCorners, setEditingCorners] = useState(false)
  const [editingRedactions, setEditingRedactions] = useState(false)
  const [receiptFields, setReceiptFields] = useState<ReceiptFields | null>(null)
  const [mrzExtraction, setMrzExtraction] = useState<MrzExtraction | null>(null)
  const [reviewingConfidence, setReviewingConfidence] = useState(false)
  const [documentSearchQuery, setDocumentSearchQuery] = useState('')
  const [ocrLanguage, setOcrLanguage] = useState<OcrLanguage>('eng+chi_sim')
  const abortRef = useRef<AbortController | null>(null)
  const activePage = pages[activeIndex] ?? null
  const activeOcrReview = activePage ? pageOcrReviews[activePage.id] : undefined
  const ocrText = activeOcrReview?.text ?? ''
  const piiSuggestions = activeOcrReview?.piiSuggestions ?? []
  const recognizedPageCount = pages.filter((page) => Boolean(pageOcrReviews[page.id])).length
  const searchablePdfPages = useMemo<SearchableDocumentPdfPage[]>(() => pages.map((page) => ({
    page,
    regions: pageOcrReviews[page.id]?.regions ?? [],
  })), [pageOcrReviews, pages])
  const searchablePageCount = searchablePdfEligiblePageCount(searchablePdfPages)
  const layoutDocuments = useMemo(() => pages.flatMap((page) => {
    const review = pageOcrReviews[page.id]
    if (!review) return []
    const layout = createOcrLayoutDocument(review.regions, {
      filename: page.filename,
      width: page.width,
      height: page.height,
      language: review.language,
    })
    return layout.wordCount > 0 ? [layout] : []
  }), [pageOcrReviews, pages])
  const layoutPageCount = layoutDocuments.length
  const piiReviewPages = useMemo(() => pages.flatMap((page, index) => {
    const suggestionCount = pageOcrReviews[page.id]?.piiSuggestions.length ?? 0
    return suggestionCount > 0 ? [{ index, suggestionCount }] : []
  }), [pageOcrReviews, pages])
  const documentPiiSuggestionCount = piiReviewPages.reduce((total, page) => total + page.suggestionCount, 0)
  const qualityReviewPages = useMemo(() => pages.flatMap((page, index) =>
    page.quality && page.quality.status !== 'good'
      ? [{ index, issueCount: page.quality.issues.length }]
      : [],
  ), [pages])
  const documentSearchMatches = useMemo(
    () => findDocumentOcrMatches(pages, pageOcrReviews, documentSearchQuery),
    [documentSearchQuery, pageOcrReviews, pages],
  )
  const nextDocumentSearchMatch = documentSearchMatches.find((match) => match.pageIndex > activeIndex) ?? documentSearchMatches[0]

  useEffect(() => () => abortRef.current?.abort(), [])

  const discardPageOcr = (pageId: string) => {
    setPageOcrReviews((current) => {
      if (!current[pageId]) return current
      const next = { ...current }
      delete next[pageId]
      return next
    })
  }

  const processCapture = async (capture: CapturedDocument, replaceIndex?: number, corners?: DocumentCorners) => {
    setPhase('scanning')
    setError('')
    setReceiptFields(null)
    setMrzExtraction(null)
    setReviewingConfidence(false)
    setEditingRedactions(false)
    try {
      let page = await scanCapturedDocument(capture, filter, setProgressMessage, corners)
      if (typeof replaceIndex === 'number') {
        const previousPage = pages[replaceIndex]
        const previousRotation = previousPage?.rotation ?? 0
        for (let degrees = 0; degrees < previousRotation; degrees += 90) {
          page = await rotateScannedDocumentPage(page, 'right')
        }
        if (previousPage?.redactions.length) {
          page = await applyDocumentRedactions(page, previousPage.redactions)
        }
        if (previousPage) discardPageOcr(previousPage.id)
        setPages((current) => current.map((item, index) => index === replaceIndex ? { ...page, id: item.id } : item))
      } else {
        setPages((current) => [...current, page])
        setActiveIndex(pages.length)
      }
      onMessage(page.correction === 'manual'
        ? '已按手动边缘完成透视矫正'
        : page.autoDetected
          ? '已检测纸张边缘并完成透视矫正'
          : '未检测到完整边缘，已增强整张图像')
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

  const importDocument = async (file: File) => {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (isPdf) {
      setPhase('importing-pdf')
      setError('')
      setReceiptFields(null)
      setMrzExtraction(null)
      setEditingRedactions(false)
      try {
        const captures = await captureFromPdfFile(file, ({ page, pageCount }) => {
          setProgressMessage(`正在栅格化 PDF 第 ${page} / ${pageCount} 页`)
        })
        const scannedPages: ScannedDocumentPage[] = []
        for (let index = 0; index < captures.length; index += 1) {
          setProgressMessage(`正在增强 PDF 第 ${index + 1} / ${captures.length} 页`)
          scannedPages.push(await scanCapturedDocument(captures[index], filter))
        }
        setPages((current) => [...current, ...scannedPages])
        setActiveIndex(pages.length)
        onMessage(`已在本机导入并栅格化 ${scannedPages.length} 页 PDF，请逐页复核`)
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : '无法导入 PDF')
      } finally {
        setPhase(null)
        setProgressMessage('')
      }
      return
    }
    try {
      await processCapture(await captureFromImageFile(file))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法导入文档文件')
    }
  }

  const applyFilter = () => {
    if (!activePage) return
    void processCapture({
      dataUrl: activePage.sourceDataUrl,
      filename: activePage.filename.replace(/-processed\.png$/i, '.png'),
    }, activeIndex, activePage.correction === 'manual' ? activePage.corners : undefined)
  }

  const removePage = () => {
    if (activePage) discardPageOcr(activePage.id)
    const remainingPages = pages.filter((_, index) => index !== activeIndex)
    setPages(remainingPages)
    setActiveIndex(Math.max(0, Math.min(activeIndex, remainingPages.length - 1)))
    setEditingCorners(false)
    setEditingRedactions(false)
    setReceiptFields(null)
    setMrzExtraction(null)
  }

  const moveActivePage = (offset: -1 | 1) => {
    if (!activePage) return
    const targetIndex = activeIndex + offset
    if (targetIndex < 0 || targetIndex >= pages.length) return
    setPages((current) => {
      const reordered = [...current]
      const [movedPage] = reordered.splice(activeIndex, 1)
      if (!movedPage) return current
      reordered.splice(targetIndex, 0, movedPage)
      return reordered
    })
    setActiveIndex(targetIndex)
    onMessage(`已将当前页${offset < 0 ? '前移' : '后移'}一页；OCR 与遮盖内容已随页面保留`)
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

  const exportSearchablePdf = async () => {
    if (searchablePageCount !== pages.length || pages.length === 0) return
    setPhase('exporting')
    setError('')
    setProgressMessage('正在载入离线中文字体')
    try {
      await downloadSearchableScannedPdf(searchablePdfPages, {
        onProgress: (page, pageCount) => setProgressMessage(`正在写入可搜索 PDF 第 ${page} / ${pageCount} 页`),
      })
      onMessage(`已生成 ${pages.length} 页本机可搜索 PDF；文字层来自当前逐词复核结果与原坐标`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '可搜索 PDF 导出失败')
    } finally {
      setPhase(null)
      setProgressMessage('')
    }
  }

  const exportDocumentOcr = () => {
    if (pages.length === 0 || recognizedPageCount === 0) return
    downloadText(
      buildDocumentOcrText(pages, pageOcrReviews),
      documentOcrFilename(pages[0].filename),
    )
    const missingCount = pages.length - recognizedPageCount
    onMessage(missingCount === 0
      ? `已按当前页序导出 ${pages.length} 页 OCR 文本`
      : `已导出 ${recognizedPageCount} 页 OCR 文本；另有 ${missingCount} 页以“尚未执行 OCR”标记`)
  }

  const exportDocumentLayout = (format: 'json' | 'csv' | 'hocr' | 'alto') => {
    if (pages.length === 0 || layoutPageCount !== pages.length) return
    try {
      const filename = documentLayoutFilename(pages[0].filename, format)
      const sourceName = `${pages.length}-page scanned document (${pages[0].filename})`
      const content = format === 'json'
        ? serializeOcrLayoutJsonPages(layoutDocuments, sourceName)
        : format === 'csv'
          ? serializeOcrLayoutCsvPages(layoutDocuments)
          : format === 'hocr'
            ? serializeOcrLayoutHocrPages(layoutDocuments)
            : serializeOcrLayoutAltoPages(layoutDocuments, sourceName)
      downloadText(
        content,
        filename,
        format === 'json'
          ? 'application/json;charset=utf-8'
          : format === 'csv'
            ? 'text/csv;charset=utf-8'
            : format === 'hocr'
              ? 'text/html;charset=utf-8'
              : 'application/xml;charset=utf-8',
      )
      const formatLabel = format === 'hocr' ? 'hOCR' : format === 'alto' ? 'ALTO 4.4' : format.toUpperCase()
      onMessage(`已按当前页序导出 ${pages.length} 页 ${formatLabel} 版面`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '多页 OCR 版面导出失败')
    }
  }

  const openNextDocumentPiiReview = () => {
    const target = piiReviewPages.find((page) => page.index > activeIndex) ?? piiReviewPages[0]
    if (!target) return
    setActiveIndex(target.index)
    setEditingCorners(false)
    setReceiptFields(null)
    setMrzExtraction(null)
    setReviewingConfidence(false)
    setEditingRedactions(true)
    onMessage(`已定位第 ${target.index + 1} 页的 ${target.suggestionCount} 处疑似敏感信息；请逐项调整、删除或确认`)
  }

  const openNextQualityReview = () => {
    const target = qualityReviewPages.find((page) => page.index > activeIndex) ?? qualityReviewPages[0]
    if (!target) return
    setActiveIndex(target.index)
    setEditingCorners(false)
    setEditingRedactions(false)
    setReceiptFields(null)
    setMrzExtraction(null)
    setReviewingConfidence(false)
    onMessage(`已定位第 ${target.index + 1} 页；发现 ${target.issueCount} 项拍摄质量建议`)
  }

  const openNextDocumentSearchMatch = () => {
    const target = nextDocumentSearchMatch
    if (!target) return
    setActiveIndex(target.pageIndex)
    setEditingCorners(false)
    setEditingRedactions(false)
    setReceiptFields(null)
    setMrzExtraction(null)
    setReviewingConfidence(false)
    onMessage(`已定位第 ${target.pageIndex + 1} 页；此页有 ${target.occurrenceCount} 处文字匹配`)
  }

  const applyRedactions = async (redactions: DocumentRedaction[]) => {
    if (!activePage) return
    setPhase('redacting')
    setError('')
    try {
      const redactedPage = await applyDocumentRedactions(activePage, redactions)
      setPages((current) => current.map((page, index) => index === activeIndex ? redactedPage : page))
      setEditingRedactions(false)
      discardPageOcr(activePage.id)
      setReceiptFields(null)
      setMrzExtraction(null)
      onMessage(redactions.length > 0 ? `已在本机永久遮盖 ${redactions.length} 处` : '已清除当前页全部遮盖')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '隐私遮盖失败')
    } finally {
      setPhase(null)
    }
  }

  const rotatePage = async (direction: DocumentRotationDirection) => {
    if (!activePage) return
    setPhase('rotating')
    setError('')
    try {
      const rotatedPage = await rotateScannedDocumentPage(activePage, direction)
      setPages((current) => current.map((page, index) => index === activeIndex ? rotatedPage : page))
      discardPageOcr(activePage.id)
      setReceiptFields(null)
      setMrzExtraction(null)
      setCopied(false)
      onMessage(`已向${direction === 'right' ? '右' : '左'}旋转当前页；隐私遮盖位置已同步`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '文档旋转失败')
    } finally {
      setPhase(null)
    }
  }

  const runPageOcr = async (
    page: ScannedDocumentPage,
    onProgress: (progress: OcrProgress) => void,
    signal: AbortSignal,
    language: OcrLanguage,
    recognize: LocalOcrRecognizer = (file, progress, activeSignal) => recognizeLocalFile(
      file,
      language,
      progress,
      activeSignal,
    ),
  ): Promise<PageOcrReview> => {
    const result = await recognize(
      await pageAsFile(page),
      onProgress,
      signal,
    )
    return {
      language,
      text: result.text,
      originalText: result.text,
      piiSuggestions: findPiiSuggestions(result.regions ?? [], page.width, page.height),
      regions: result.regions ?? [],
      originalRegions: result.regions ?? [],
    }
  }

  const updateActiveOcrText = (text: string) => {
    if (!activePage || !activeOcrReview) return
    const pageId = activePage.id
    setPageOcrReviews((current) => current[pageId]
      ? { ...current, [pageId]: { ...current[pageId], text } }
      : current)
  }

  const applyActiveOcrCorrections = (corrections: OcrWordCorrection[]) => {
    if (!activePage || !activeOcrReview) return
    const corrected = applyOcrWordCorrections(activeOcrReview.text, activeOcrReview.regions, corrections)
    const pageId = activePage.id
    setPageOcrReviews((current) => current[pageId]
      ? {
          ...current,
          [pageId]: {
            ...current[pageId],
            text: corrected.text,
            regions: corrected.regions,
            piiSuggestions: findPiiSuggestions(corrected.regions, activePage.width, activePage.height),
          },
        }
      : current)
    onMessage(`已应用 ${corrected.reviewedCount} 项逐词复核，其中 ${corrected.changedCount} 项改字；版面与可搜索 PDF 将使用校正词`)
  }

  const restoreActiveOcr = () => {
    if (!activePage || !activeOcrReview) return
    const pageId = activePage.id
    setPageOcrReviews((current) => current[pageId]
      ? {
          ...current,
          [pageId]: {
            ...current[pageId],
            text: current[pageId].originalText,
            regions: current[pageId].originalRegions,
            piiSuggestions: findPiiSuggestions(current[pageId].originalRegions, activePage.width, activePage.height),
          },
        }
      : current)
    onMessage('已恢复当前页的本机 OCR 原始文本与词框')
  }

  const recognizePage = async () => {
    if (!activePage) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('ocr')
    setError('')
    setReceiptFields(null)
    setMrzExtraction(null)
    try {
      const review = await runPageOcr(
        activePage,
        (progress: OcrProgress) => setProgressMessage(`${progress.message} ${Math.round(progress.progress * 100)}%`),
        controller.signal,
        ocrLanguage,
      )
      if (!controller.signal.aborted) {
        setPageOcrReviews((current) => ({
          ...current,
          [activePage.id]: review,
        }))
        onMessage(review.piiSuggestions.length > 0
          ? `OCR 已完成，发现 ${review.piiSuggestions.length} 处疑似敏感信息，请逐项复核`
          : '当前扫描页 OCR 已完成，未发现高置信敏感文本')
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

  const recognizeMissingPages = async () => {
    const pendingPages = pages.filter((page) => !pageOcrReviews[page.id])
    if (pendingPages.length === 0) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('ocr')
    setError('')
    setReceiptFields(null)
    setMrzExtraction(null)
    const failedPages: string[] = []
    let completed = 0
    try {
      await withLocalOcrSession(ocrLanguage, async (recognize) => {
        for (let index = 0; index < pendingPages.length; index += 1) {
          if (controller.signal.aborted) break
          const page = pendingPages[index]
          try {
            const review = await runPageOcr(page, (progress) => {
              setProgressMessage(`OCR 未识别页 ${index + 1}/${pendingPages.length} · ${progress.message} ${Math.round(progress.progress * 100)}%`)
            }, controller.signal, ocrLanguage, recognize)
            if (controller.signal.aborted) break
            setPageOcrReviews((current) => ({ ...current, [page.id]: review }))
            completed += 1
          } catch {
            if (controller.signal.aborted) break
            failedPages.push(page.filename)
          }
        }
      })
      if (!controller.signal.aborted) {
        if (failedPages.length > 0) {
          setError(`有 ${failedPages.length} 页 OCR 失败：${failedPages.join('、')}`)
        }
        onMessage(failedPages.length === 0
          ? `已完成其余 ${completed} 页 OCR；全部 ${pages.length} 页已有文本`
          : `已完成 ${completed} 页 OCR，另有 ${failedPages.length} 页失败；已完成结果继续保留`)
      }
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
    onMessage('已取消 OCR；已经完成的页面继续保留')
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

  const reviewMrz = async () => {
    const { extractMrz } = await import('../lib/mrzExtraction')
    const extraction = await extractMrz(ocrText)
    if (!extraction) {
      setError('未找到完整的 TD1、TD2 或 TD3 机器可读区，请检查 OCR 文本和拍摄范围')
      return
    }
    setError('')
    setReceiptFields(null)
    setMrzExtraction(extraction)
    onMessage(extraction.checksumsValid
      ? '已提取证件 MRZ 且校验位通过，请对照原证件复核'
      : '已提取证件 MRZ，但存在校验错误，请对照原证件修正')
  }

  const fileButton = (id: string, label: string) => (
    <label className="document-file-button" htmlFor={id}>
      <Upload size={15} aria-hidden="true" />{label}
      <input
        id={id}
        className="sr-only"
        type="file"
        accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,image/bmp"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void importDocument(file)
          event.target.value = ''
        }}
      />
    </label>
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
          <div><strong>{phase === 'exporting' ? progressMessage || '正在生成 PDF' : phase === 'redacting' ? '正在永久应用隐私遮盖' : phase === 'rotating' ? '正在旋转当前页并同步遮盖位置' : progressMessage || '正在处理'}</strong><small>{phase === 'importing-pdf' ? 'PDF 将转为图像页；原文本层与批注不会保留' : phase === 'exporting' ? '图片、OCR 文字层与字体均只在本机处理' : '请保持此窗口打开'}</small></div>
          {phase === 'ocr' && <button type="button" onClick={cancelOcr}>取消 OCR</button>}
        </div>
      )}

      {!phase && pages.length === 0 && (
        <div className="document-capture-state smart-document-empty">
          <div>
            <FileScan size={24} aria-hidden="true" />
            <p>自动检测纸张、拉正透视并增强文字。可使用摄像头，或导入照片及最多 20 页的 PDF。</p>
          </div>
          <label><span>扫描效果</span><select value={filter} onChange={(event) => setFilter(event.target.value as DocumentFilter)}>{Object.entries(filterLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <div>
            <button type="button" disabled={!sessionReady} onClick={capturePage}><FileScan size={15} aria-hidden="true" />{sessionReady ? '智能拍摄' : '请先启动摄像头'}</button>
            {fileButton(uploadId, '导入文件')}
          </div>
        </div>
      )}

      {!phase && activePage && editingCorners && (
        <DocumentCornerEditor
          key={activePage.id}
          sourceDataUrl={activePage.sourceDataUrl}
          sourceWidth={activePage.sourceWidth}
          sourceHeight={activePage.sourceHeight}
          initialCorners={activePage.corners}
          onCancel={() => setEditingCorners(false)}
          onApply={(corners) => {
            setEditingCorners(false)
            void processCapture({
              dataUrl: activePage.sourceDataUrl,
              filename: activePage.filename.replace(/-processed\.png$/i, '.png'),
            }, activeIndex, corners)
          }}
        />
      )}

      {!phase && activePage && editingRedactions && !editingCorners && (
        <DocumentRedactionEditor
          key={`${activePage.id}-${activePage.redactions.length}`}
          page={activePage}
          initialRedactions={[
            ...activePage.redactions,
            ...piiSuggestions.map((suggestion) => suggestion.redaction),
          ]}
          onCancel={() => setEditingRedactions(false)}
          onApply={(redactions) => void applyRedactions(redactions)}
        />
      )}

      {!phase && activePage && receiptFields && !editingCorners && !editingRedactions && (
        <ReceiptFieldsPanel
          fields={receiptFields}
          onChange={setReceiptFields}
          onBack={() => setReceiptFields(null)}
          onMessage={onMessage}
        />
      )}

      {!phase && activePage && mrzExtraction && !editingCorners && !editingRedactions && !receiptFields && (
        <Suspense fallback={null}>
          <MrzFieldsPanel
            extraction={mrzExtraction}
            onBack={() => setMrzExtraction(null)}
            onMessage={onMessage}
          />
        </Suspense>
      )}

      {!phase && activePage && activeOcrReview?.regions.length && reviewingConfidence && !editingCorners && !editingRedactions && !receiptFields && !mrzExtraction ? (
        <OcrConfidenceReview
          source={activePage.dataUrl}
          sourceLabel={`第 ${activeIndex + 1} 页 · ${activePage.filename}`}
          regions={activeOcrReview.regions}
          width={activePage.width}
          height={activePage.height}
          onClose={() => setReviewingConfidence(false)}
          onApplyCorrections={applyActiveOcrCorrections}
        />
      ) : null}

      {!phase && activePage && !editingCorners && !editingRedactions && !receiptFields && !mrzExtraction && !reviewingConfidence && (
        <div className="document-workbench">
          <div className="document-scan-preview">
            <img src={activePage.dataUrl} alt={`第 ${activeIndex + 1} 页扫描预览`} />
            <span>{activePage.correction === 'manual' ? '手动拉正' : activePage.autoDetected ? '已自动拉正' : '整图增强'}{activePage.redactions.length > 0 ? ` · 遮盖 ${activePage.redactions.length} 处` : ''}</span>
          </div>
          <div className="document-workbench-controls">
            <div className="document-page-strip" aria-label="扫描页">
              {pages.map((page, index) => (
                <button key={page.id} type="button" className={index === activeIndex ? 'is-active' : ''} aria-pressed={index === activeIndex} onClick={() => { setActiveIndex(index); setEditingCorners(false); setReceiptFields(null); setMrzExtraction(null) }}>
                  <img src={page.dataUrl} alt="" /><span>{index + 1}</span>
                </button>
              ))}
            </div>
            {activePage.quality && (
              <div className={`document-quality-status is-${activePage.quality.status}`} role="status">
                <div>
                  {activePage.quality.status === 'good' ? <Check size={13} aria-hidden="true" /> : <ShieldAlert size={13} aria-hidden="true" />}
                  <strong>{activePage.quality.status === 'good' ? '原图质量良好' : activePage.quality.status === 'poor' ? '建议重拍或更换原图' : '请复核原图质量'}</strong>
                  <span>{activePage.quality.width} × {activePage.quality.height} · 亮度 {Math.round(activePage.quality.meanLuminance / 255 * 100)}% · 对比度 {Math.round(activePage.quality.contrast)}</span>
                </div>
                {activePage.quality.issues.length > 0 && (
                  <ul>{activePage.quality.issues.map((issue) => <li key={issue.code}><strong>{issue.label}</strong><span>{issue.guidance}</span></li>)}</ul>
                )}
                <small>启发式分析原始页面，仅作拍摄建议；不会阻止 OCR 或导出。</small>
              </div>
            )}
            <div className="document-filter-row">
              <select aria-label="扫描效果" value={filter} onChange={(event) => setFilter(event.target.value as DocumentFilter)}>{Object.entries(filterLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <button type="button" onClick={applyFilter}>应用到本页</button>
            </div>
            <div className="document-filter-row">
              <label>
                <span>扫描页 OCR 语言</span>
                <select value={ocrLanguage} onChange={(event) => setOcrLanguage(event.target.value as OcrLanguage)}>
                  {scannerOcrLanguageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <small>只影响后续 OCR；已完成页保留识别时语言</small>
            </div>
            {recognizedPageCount > 0 && (
              <div className="document-filter-row">
                <label>
                  <span>搜索全部扫描页 OCR</span>
                  <input type="search" maxLength={200} value={documentSearchQuery} onChange={(event) => setDocumentSearchQuery(event.target.value)} />
                </label>
                <button type="button" disabled={documentSearchMatches.length === 0} onClick={openNextDocumentSearchMatch}><Search size={14} aria-hidden="true" />下一匹配页 {documentSearchMatches.length}</button>
                {documentSearchQuery.trim() && <small aria-live="polite">{nextDocumentSearchMatch ? `下一页：${nextDocumentSearchMatch.pageIndex + 1} · ${nextDocumentSearchMatch.filename} · ${nextDocumentSearchMatch.preview}` : '未在已完成 OCR 页中找到匹配'}</small>}
              </div>
            )}
            <div className="document-actions">
              <button type="button" disabled={!sessionReady} onClick={capturePage}><FilePlus2 size={14} aria-hidden="true" />拍下一页</button>
              {fileButton(addPageId, '导入文件')}
              <button type="button" disabled={activeIndex === 0} onClick={() => moveActivePage(-1)}><ArrowLeft size={14} aria-hidden="true" />前移一页</button>
              <button type="button" disabled={activeIndex === pages.length - 1} onClick={() => moveActivePage(1)}><ArrowRight size={14} aria-hidden="true" />后移一页</button>
              <button type="button" onClick={() => downloadScannedPage(activePage)}><ImageDown size={14} aria-hidden="true" />PNG</button>
              <button type="button" onClick={() => void exportPdf()}><Download size={14} aria-hidden="true" />{pages.length} 页 PDF</button>
              <button type="button" title={searchablePageCount === pages.length ? '导出带不可见 OCR 文字层的本机 PDF' : '请先完成每一页 OCR；每页必须包含版面词框'} disabled={searchablePageCount !== pages.length} onClick={() => void exportSearchablePdf()}><FileText size={14} aria-hidden="true" />可搜索 PDF {searchablePageCount}/{pages.length}</button>
              <button type="button" title={layoutPageCount === pages.length ? '按当前页序导出多页 JSON 版面' : '请先完成每一页 OCR；每页必须包含版面词框'} disabled={layoutPageCount !== pages.length} onClick={() => exportDocumentLayout('json')}><FileCode2 size={14} aria-hidden="true" />多页 JSON {layoutPageCount}/{pages.length}</button>
              <button type="button" title={layoutPageCount === pages.length ? '按当前页序导出多页 CSV 版面' : '请先完成每一页 OCR；每页必须包含版面词框'} disabled={layoutPageCount !== pages.length} onClick={() => exportDocumentLayout('csv')}><FileCode2 size={14} aria-hidden="true" />多页 CSV {layoutPageCount}/{pages.length}</button>
              <button type="button" title={layoutPageCount === pages.length ? '按当前页序导出多页 hOCR 版面' : '请先完成每一页 OCR；每页必须包含版面词框'} disabled={layoutPageCount !== pages.length} onClick={() => exportDocumentLayout('hocr')}><FileCode2 size={14} aria-hidden="true" />多页 hOCR {layoutPageCount}/{pages.length}</button>
              <button type="button" title={layoutPageCount === pages.length ? '按当前页序导出多页 ALTO 4.4 版面' : '请先完成每一页 OCR；每页必须包含版面词框'} disabled={layoutPageCount !== pages.length} onClick={() => exportDocumentLayout('alto')}><FileCode2 size={14} aria-hidden="true" />多页 ALTO {layoutPageCount}/{pages.length}</button>
              <button type="button" disabled={recognizedPageCount === 0} onClick={exportDocumentOcr}><FileText size={14} aria-hidden="true" />OCR TXT {recognizedPageCount}/{pages.length}</button>
              <button type="button" disabled={recognizedPageCount === pages.length} onClick={() => void recognizeMissingPages()}><FileText size={14} aria-hidden="true" />OCR 未识别页 {pages.length - recognizedPageCount}</button>
              <button type="button" onClick={() => void recognizePage()}><FileText size={14} aria-hidden="true" />OCR 本页</button>
              <button type="button" onClick={() => void rotatePage('left')}><RotateCcw size={14} aria-hidden="true" />向左旋转</button>
              <button type="button" onClick={() => void rotatePage('right')}><RotateCw size={14} aria-hidden="true" />向右旋转</button>
              <button type="button" onClick={() => { setEditingCorners(true); setEditingRedactions(false) }}><Crop size={14} aria-hidden="true" />调整边缘</button>
              <button type="button" onClick={() => { setEditingRedactions(true); setEditingCorners(false) }}><EyeOff size={14} aria-hidden="true" />隐私遮盖</button>
              {qualityReviewPages.length > 0 && <button type="button" onClick={openNextQualityReview}><AlertTriangle size={14} aria-hidden="true" />下一质量问题页 {qualityReviewPages.length}</button>}
              {documentPiiSuggestionCount > 0 && <button type="button" onClick={openNextDocumentPiiReview}><ShieldAlert size={14} aria-hidden="true" />下一敏感页 {documentPiiSuggestionCount} 处 / {piiReviewPages.length} 页</button>}
              <button type="button" aria-label="删除当前扫描页" onClick={removePage}><Trash2 size={14} aria-hidden="true" /></button>
            </div>
            {activeOcrReview && (
              <div className="document-ocr-result">
                <div>
                  <textarea aria-label="当前扫描页 OCR 文本" value={ocrText} onChange={(event) => updateActiveOcrText(event.target.value)} />
                  <small>{activeOcrReview?.text === activeOcrReview?.originalText ? '本机 OCR 原始文本 · 可人工修正' : '已人工修正 · 复制、提取与 TXT 将使用当前文本'}{activeOcrReview.regions.length > 0 ? ' · 逐词复核会同步版面与可搜索 PDF；整段自由编辑不会重排词框' : ''}</small>
                </div>
                <div>
                  <button type="button" onClick={() => void copyOcr()}>{copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}{copied ? '已复制' : '复制'}</button>
                  {activeOcrReview?.text !== activeOcrReview?.originalText && <button type="button" onClick={restoreActiveOcr}><RotateCcw size={13} aria-hidden="true" />恢复识别文本与词框</button>}
                  <button type="button" onClick={() => { setReceiptFields(extractReceiptFields(ocrText)); onMessage('已在本机预填票据字段，请确认后导出') }}><ReceiptText size={13} aria-hidden="true" />提取票据</button>
                  <button type="button" onClick={() => void reviewMrz()}><FileText size={13} aria-hidden="true" />提取 MRZ</button>
                  {activeOcrReview.regions.length > 0 && <button type="button" onClick={() => setReviewingConfidence(true)}><AlertTriangle size={13} aria-hidden="true" />置信度复核 {summarizeOcrConfidence(activeOcrReview.regions).reviewCount}</button>}
                  {activeOcrReview.regions.length > 0 && <OcrLayoutExportActions regions={activeOcrReview.regions} filename={activePage.filename} width={activePage.width} height={activePage.height} language={activeOcrReview.language} onMessage={onMessage} />}
                  {piiSuggestions.length > 0 && <button type="button" onClick={() => { setEditingRedactions(true); setEditingCorners(false); onMessage('已载入疑似敏感信息位置；请调整、删除或确认后再应用') }}><ShieldAlert size={13} aria-hidden="true" />复核 {piiSuggestions.length} 处敏感信息</button>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

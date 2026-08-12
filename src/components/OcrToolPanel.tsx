import {
  Check,
  AlertTriangle,
  ContactRound,
  Copy,
  Download,
  FileText,
  RotateCcw,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import {
  buildVCard,
  businessCardFilename,
  parseBusinessCard,
  type BusinessCardFields,
} from '../lib/businessCard'
import { buildCombinedOcrText } from '../lib/batchOcr'
import type { MrzExtraction } from '../lib/mrzExtraction'
import {
  recognizeLocalFile,
  withLocalOcrSession,
  type OcrLanguage,
  type OcrProgress,
  type OcrResult,
} from '../lib/localOcr'
import { summarizeOcrConfidence } from '../lib/ocrConfidence'
import { OcrConfidenceReview } from './OcrConfidenceReview'
import { OcrLayoutExportActions } from './OcrLayoutExportActions'

const MrzFieldsPanel = lazy(() => import('./MrzFieldsPanel'))

interface OcrToolPanelProps {
  mode: 'ocr' | 'card'
  onMessage: (message: string) => void
}

type BatchItemPhase = 'queued' | 'recognizing' | 'success' | 'error' | 'cancelled'

interface BatchOcrItem {
  id: string
  file: File
  phase: BatchItemPhase
  result?: OcrResult
  error?: string
}

type RecognitionPhase = 'idle' | 'recognizing' | 'success' | 'error'

const emptyCard: BusinessCardFields = {
  name: '',
  organization: '',
  title: '',
  phone: '',
  email: '',
  website: '',
  address: '',
  notes: '',
}

const languageOptions: Array<{ value: OcrLanguage; label: string }> = [
  { value: 'eng+chi_sim', label: '简中 + English' },
  { value: 'eng+chi_tra', label: '繁中 + English' },
  { value: 'eng', label: 'English' },
]

function downloadText(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function safeTextFilename(filename: string) {
  const base = [...filename.replace(/\.[^.]+$/, '')]
    .map((character) => character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '-' : character)
    .join('')
  return `${base || 'ocr-result'}.txt`
}

function batchId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `ocr-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function BatchOcrPanel({ onMessage }: Pick<OcrToolPanelProps, 'onMessage'>) {
  const [language, setLanguage] = useState<OcrLanguage>('eng+chi_sim')
  const [items, setItems] = useState<BatchOcrItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [progress, setProgress] = useState<OcrProgress>({ progress: 0, message: '', page: 1, pageCount: 1 })
  const [activePosition, setActivePosition] = useState(0)
  const [running, setRunning] = useState(false)
  const [copied, setCopied] = useState(false)
  const [mrzExtraction, setMrzExtraction] = useState<MrzExtraction | null>(null)
  const [confidenceReviewId, setConfidenceReviewId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
    }
  }, [])

  const recognizeBatch = async (files: File[]) => {
    abortRef.current?.abort()
    const selectedFiles = files.slice(0, 20)
    if (files.length > selectedFiles.length) onMessage('单次最多处理 20 个文件，已忽略其余文件')
    const nextItems = selectedFiles.map((file) => ({ id: batchId(), file, phase: 'queued' as const }))
    const controller = new AbortController()
    abortRef.current = controller
    setItems(nextItems)
    setSelectedId(null)
    setRunning(true)
    setCopied(false)
    setMrzExtraction(null)
    setConfidenceReviewId(null)
    let successCount = 0
    let errorCount = 0

    await withLocalOcrSession(language, async (recognize) => {
      for (let index = 0; index < nextItems.length; index += 1) {
        if (controller.signal.aborted) break
        const item = nextItems[index]
        setActivePosition(index + 1)
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, phase: 'recognizing' } : entry))
        try {
          const result = await recognize(item.file, setProgress, controller.signal)
          if (controller.signal.aborted) break
          successCount += 1
          setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, phase: 'success', result } : entry))
          setSelectedId((current) => current ?? item.id)
        } catch (caught) {
          if (controller.signal.aborted) break
          errorCount += 1
          setItems((current) => current.map((entry) => entry.id === item.id ? {
            ...entry,
            phase: 'error',
            error: caught instanceof Error ? caught.message : '本地 OCR 识别失败',
          } : entry))
        }
      }
    })

    if (controller.signal.aborted) {
      if (!mountedRef.current) return
      setItems((current) => current.map((item) => item.phase === 'queued' || item.phase === 'recognizing'
        ? { ...item, phase: 'cancelled' }
        : item))
      onMessage('已取消批量 OCR；已完成结果仍保留在本机')
    } else {
      onMessage(`批量 OCR 已完成：成功 ${successCount} 个，失败 ${errorCount} 个`)
    }
    if (abortRef.current === controller) abortRef.current = null
    if (mountedRef.current) setRunning(false)
  }

  const reset = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setItems([])
    setSelectedId(null)
    setRunning(false)
    setMrzExtraction(null)
    setConfidenceReviewId(null)
    setProgress({ progress: 0, message: '', page: 1, pageCount: 1 })
  }

  const cancel = () => abortRef.current?.abort()
  const selected = items.find((item) => item.id === selectedId) ?? null
  const confidenceReviewItem = items.find((item) => item.id === confidenceReviewId) ?? null
  const successes = items.filter((item) => item.phase === 'success').length
  const combinedText = buildCombinedOcrText(items.map((item) => ({
    filename: item.file.name,
    result: item.phase === 'success' ? item.result : undefined,
  })))
  const overallProgress = items.length === 0
    ? 0
    : Math.min(100, Math.round((((activePosition - 1) + progress.progress) / items.length) * 100))

  const copySelected = async () => {
    if (!selected?.result) return
    try {
      await navigator.clipboard.writeText(selected.result.text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_500)
    } catch {
      onMessage('无法写入剪贴板，请手动选择识别文本')
    }
  }

  const reviewSelectedMrz = async () => {
    if (!selected?.result) return
    const { extractMrz } = await import('../lib/mrzExtraction')
    const extraction = await extractMrz(selected.result.text)
    if (!extraction) {
      onMessage('所选 OCR 结果中未找到完整的 TD1、TD2 或 TD3 机器可读区')
      return
    }
    setMrzExtraction(extraction)
    onMessage(extraction.checksumsValid
      ? '已提取证件 MRZ 且校验位通过，请对照原证件复核'
      : '已提取证件 MRZ，但存在校验错误，请对照原证件修正')
  }

  if (mrzExtraction) {
    return (
      <Suspense fallback={null}>
        <MrzFieldsPanel
          extraction={mrzExtraction}
          onBack={() => setMrzExtraction(null)}
          onMessage={onMessage}
        />
      </Suspense>
    )
  }

  return (
    <section className="camera-tool-panel ocr-tool-panel batch-ocr-panel" aria-label="文件 OCR">
      <header>
        <div><FileText size={17} aria-hidden="true" /><strong>批量文件 OCR</strong></div>
        <span><ShieldCheck size={13} aria-hidden="true" />模型与文件均留在本机</span>
      </header>

      {confidenceReviewItem?.result?.regions?.length ? (
        <OcrConfidenceReview
          source={confidenceReviewItem.file}
          sourceLabel={confidenceReviewItem.file.name}
          regions={confidenceReviewItem.result.regions}
          onClose={() => setConfidenceReviewId(null)}
        />
      ) : items.length === 0 ? (
        <div className="ocr-start-state">
          <div>
            <FileText size={25} aria-hidden="true" />
            <strong>导入图像或 PDF</strong>
            <small>可一次选择多个文件；每个 PDF 最多 20 页、每个文件最大 35 MB</small>
          </div>
          <div className="ocr-input-row">
            <label>
              <span>识别语言</span>
              <select value={language} onChange={(event) => setLanguage(event.target.value as OcrLanguage)}>
                {languageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="ocr-upload-button">
              <Upload size={14} aria-hidden="true" />选择多个文件
              <input
                className="sr-only"
                type="file"
                multiple
                accept="application/pdf,image/png,image/jpeg,image/webp,image/bmp,.pdf"
                onChange={(event) => {
                  const selectedFiles = Array.from(event.target.files ?? [])
                  if (selectedFiles.length > 0) void recognizeBatch(selectedFiles)
                  event.target.value = ''
                }}
              />
            </label>
          </div>
        </div>
      ) : (
        <div className="batch-ocr-workbench">
          <div className="batch-ocr-summary" role={running ? 'status' : undefined} aria-live="polite">
            <div>
              <strong>{running ? `${progress.message} · ${activePosition}/${items.length}` : `${successes} / ${items.length} 完成`}</strong>
              <small>{running ? `第 ${progress.page}/${progress.pageCount} 页 · 总进度 ${overallProgress}%` : `${items.length - successes} 个失败或已取消`}</small>
            </div>
            {running
              ? <button type="button" onClick={cancel}>取消批次</button>
              : <button type="button" onClick={reset}><RotateCcw size={14} aria-hidden="true" />选择新批次</button>}
          </div>
          <i className="batch-ocr-progress" aria-hidden="true"><b style={{ width: `${running ? overallProgress : 100}%` }} /></i>
          <div className="batch-ocr-content">
            <div className="batch-ocr-list" aria-label="批量 OCR 文件">
              {items.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className={item.id === selectedId ? 'is-active' : ''}
                  aria-pressed={item.id === selectedId}
                  disabled={!item.result}
                  onClick={() => { setSelectedId(item.id); setCopied(false) }}
                >
                  <span>{index + 1}</span>
                  <div><strong>{item.file.name}</strong><small>{({ queued: '等待中', recognizing: '识别中', success: `${item.result?.pageCount ?? 1} 页完成`, error: item.error ?? '失败', cancelled: '已取消' })[item.phase]}</small></div>
                  <b data-phase={item.phase}>{item.phase === 'success' ? '完成' : item.phase === 'error' ? '失败' : item.phase === 'cancelled' ? '取消' : item.phase === 'recognizing' ? '处理中' : '等待'}</b>
                </button>
              ))}
            </div>
            <div className="batch-ocr-result">
              {selected?.result ? (
                <>
                  <div><strong>{selected.file.name}</strong><small>{selected.result.source === 'embedded-text' ? 'PDF 文本层' : selected.result.source === 'mixed' ? '文本层 + OCR' : '本地 OCR'}{selected.result.regions?.length ? ' · 版面导出使用原始词框' : ''}</small></div>
                  <textarea aria-label="所选文件 OCR 文本" value={selected.result.text} readOnly />
                </>
              ) : <p>{running ? '完成的文件会在这里显示识别文本。' : '没有可显示的识别结果。'}</p>}
            </div>
          </div>
          {!running && successes > 0 && (
            <div className="ocr-actions batch-ocr-actions">
              <button type="button" disabled={!selected?.result} onClick={() => void copySelected()}>{copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{copied ? '已复制' : '复制所选'}</button>
              <button type="button" disabled={!selected?.result} onClick={() => selected?.result && downloadText(selected.result.text, safeTextFilename(selected.file.name), 'text/plain;charset=utf-8')}><Download size={14} aria-hidden="true" />保存所选 TXT</button>
              <button type="button" disabled={!selected?.result} onClick={() => void reviewSelectedMrz()}><FileText size={14} aria-hidden="true" />提取 MRZ</button>
              <button type="button" disabled={!selected?.result?.regions?.length} onClick={() => selected && setConfidenceReviewId(selected.id)}><AlertTriangle size={14} aria-hidden="true" />置信度复核 {summarizeOcrConfidence(selected?.result?.regions ?? []).reviewCount}</button>
              {selected?.result?.regions?.length ? <OcrLayoutExportActions regions={selected.result.regions} filename={selected.file.name} sourceFile={selected.file} language={language} onMessage={onMessage} /> : null}
              <button type="button" onClick={() => downloadText(combinedText, 'ocr-batch-results.txt', 'text/plain;charset=utf-8')}><Download size={14} aria-hidden="true" />导出合并 TXT</button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function SingleOcrToolPanel({ mode, onMessage }: OcrToolPanelProps) {
  const [language, setLanguage] = useState<OcrLanguage>('eng+chi_sim')
  const [phase, setPhase] = useState<RecognitionPhase>('idle')
  const [progress, setProgress] = useState<OcrProgress>({
    progress: 0,
    message: '',
    page: 1,
    pageCount: 1,
  })
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<OcrResult | null>(null)
  const [card, setCard] = useState<BusinessCardFields>(emptyCard)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [reviewingConfidence, setReviewingConfidence] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const recognize = async (selectedFile: File) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setFile(selectedFile)
    setResult(null)
    setReviewingConfidence(false)
    setCard(emptyCard)
    setError('')
    setPhase('recognizing')
    setProgress({ progress: 0, message: '正在准备', page: 1, pageCount: 1 })
    try {
      const nextResult = await recognizeLocalFile(
        selectedFile,
        language,
        setProgress,
        controller.signal,
      )
      if (controller.signal.aborted) return
      setResult(nextResult)
      if (mode === 'card') setCard(parseBusinessCard(nextResult.text))
      setPhase('success')
      onMessage(mode === 'card' ? '名片已在本机识别，请确认字段后导出' : '文件 OCR 已完成')
    } catch (caught) {
      if (controller.signal.aborted) return
      setError(caught instanceof Error ? caught.message : '本地 OCR 识别失败')
      setPhase('error')
    }
  }

  const copyResult = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_500)
    } catch {
      onMessage('无法写入剪贴板，请手动选择识别文本')
    }
  }

  const reset = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setFile(null)
    setResult(null)
    setReviewingConfidence(false)
    setCard(emptyCard)
    setError('')
    setPhase('idle')
  }

  const Icon = mode === 'card' ? ContactRound : FileText
  const accept = mode === 'card'
    ? 'image/png,image/jpeg,image/webp,image/bmp'
    : 'application/pdf,image/png,image/jpeg,image/webp,image/bmp,.pdf'

  return (
    <section className="camera-tool-panel ocr-tool-panel" aria-label={mode === 'card' ? '名片 OCR' : '文件 OCR'}>
      <header>
        <div><Icon size={17} aria-hidden="true" /><strong>{mode === 'card' ? '名片 OCR' : '文件 OCR'}</strong></div>
        <span><ShieldCheck size={13} aria-hidden="true" />模型与文件均留在本机</span>
      </header>

      {phase === 'idle' && (
        <div className="ocr-start-state">
          <div>
            <Icon size={25} aria-hidden="true" />
            <strong>{mode === 'card' ? '导入名片照片' : '导入图像或 PDF'}</strong>
            <small>{mode === 'card' ? '识别后可修正姓名、公司、电话与邮箱' : '支持 PNG、JPEG、WebP 与最多 20 页的 PDF'}</small>
          </div>
          <div className="ocr-input-row">
            <label>
              <span>识别语言</span>
              <select value={language} onChange={(event) => setLanguage(event.target.value as OcrLanguage)}>
                {languageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="ocr-upload-button">
              <Upload size={14} aria-hidden="true" />选择文件
              <input
                className="sr-only"
                type="file"
                accept={accept}
                onChange={(event) => {
                  const selected = event.target.files?.[0]
                  if (selected) void recognize(selected)
                  event.target.value = ''
                }}
              />
            </label>
          </div>
        </div>
      )}

      {phase === 'recognizing' && (
        <div className="ocr-progress-state" role="status" aria-live="polite">
          <span className="small-spinner" aria-hidden="true" />
          <div>
            <strong>{progress.message}</strong>
            <small>{file?.name} · 第 {progress.page}/{progress.pageCount} 页</small>
            <i aria-hidden="true"><b style={{ width: `${Math.round(progress.progress * 100)}%` }} /></i>
          </div>
          <button type="button" onClick={reset}>取消</button>
        </div>
      )}

      {phase === 'error' && (
        <div className="ocr-error-state" role="alert">
          <strong>无法识别这个文件</strong>
          <span>{error}</span>
          <button type="button" onClick={reset}><RotateCcw size={14} aria-hidden="true" />重新选择</button>
        </div>
      )}

      {phase === 'success' && result && reviewingConfidence && file && result.regions?.length ? (
        <OcrConfidenceReview
          source={file}
          sourceLabel={file.name}
          regions={result.regions}
          onClose={() => setReviewingConfidence(false)}
        />
      ) : phase === 'success' && result && mode === 'ocr' && (
        <div className="ocr-result-state">
          <div className="ocr-result-meta">
            <span>{file?.name}</span>
            <small>{result.pageCount} 页 · {result.source === 'embedded-text' ? 'PDF 文本层' : result.source === 'mixed' ? '文本层 + OCR' : '本地 OCR'}{result.regions?.length ? ' · 版面导出使用原始词框' : ''}</small>
          </div>
          <textarea aria-label="OCR 识别文本" value={result.text} readOnly />
          <div className="ocr-actions">
            <button type="button" onClick={() => void copyResult()}>{copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{copied ? '已复制' : '复制文本'}</button>
            <button type="button" onClick={() => downloadText(result.text, safeTextFilename(file?.name ?? ''), 'text/plain;charset=utf-8')}><Download size={14} aria-hidden="true" />保存 TXT</button>
            {result.regions?.length && file ? <OcrLayoutExportActions regions={result.regions} filename={file.name} sourceFile={file} language={language} onMessage={onMessage} /> : null}
            <button type="button" onClick={reset}><RotateCcw size={14} aria-hidden="true" />识别其他文件</button>
          </div>
        </div>
      )}

      {phase === 'success' && result && mode === 'card' && !reviewingConfidence && (
        <div className="card-result-state">
          <div className="card-fields">
            {(Object.keys(card) as Array<keyof BusinessCardFields>).map((field) => (
              <label key={field} className={field === 'address' || field === 'notes' ? 'is-wide' : ''}>
                <span>{{ name: '姓名', organization: '公司', title: '职位', phone: '电话', email: '邮箱', website: '网站', address: '地址', notes: '备注' }[field]}</span>
                <input value={card[field]} onChange={(event) => setCard((current) => ({ ...current, [field]: event.target.value }))} />
              </label>
            ))}
          </div>
          <div className="ocr-actions">
            {result.regions?.length ? <button type="button" onClick={() => setReviewingConfidence(true)}><AlertTriangle size={14} aria-hidden="true" />置信度复核 {summarizeOcrConfidence(result.regions).reviewCount}</button> : null}
            {result.regions?.length && file ? <OcrLayoutExportActions regions={result.regions} filename={file.name} sourceFile={file} language={language} onMessage={onMessage} /> : null}
            <button type="button" onClick={() => downloadText(buildVCard(card), businessCardFilename(card.name), 'text/vcard;charset=utf-8')}><Download size={14} aria-hidden="true" />确认并导出 VCF</button>
            <button type="button" onClick={reset}><RotateCcw size={14} aria-hidden="true" />识别另一张</button>
          </div>
          {result.regions?.length ? <small className="ocr-layout-export-note">版面 JSON/CSV 使用识别时的原始词框，不跟随名片字段修改。</small> : null}
        </div>
      )}
    </section>
  )
}

export function OcrToolPanel(props: OcrToolPanelProps) {
  return props.mode === 'ocr'
    ? <BatchOcrPanel onMessage={props.onMessage} />
    : <SingleOcrToolPanel {...props} />
}

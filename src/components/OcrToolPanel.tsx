import {
  Check,
  ContactRound,
  Copy,
  Download,
  FileText,
  RotateCcw,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  buildVCard,
  businessCardFilename,
  parseBusinessCard,
  type BusinessCardFields,
} from '../lib/businessCard'
import {
  recognizeLocalFile,
  type OcrLanguage,
  type OcrProgress,
  type OcrResult,
} from '../lib/localOcr'

interface OcrToolPanelProps {
  mode: 'ocr' | 'card'
  onMessage: (message: string) => void
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

export function OcrToolPanel({ mode, onMessage }: OcrToolPanelProps) {
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
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const recognize = async (selectedFile: File) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setFile(selectedFile)
    setResult(null)
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

      {phase === 'success' && result && mode === 'ocr' && (
        <div className="ocr-result-state">
          <div className="ocr-result-meta">
            <span>{file?.name}</span>
            <small>{result.pageCount} 页 · {result.source === 'embedded-text' ? 'PDF 文本层' : result.source === 'mixed' ? '文本层 + OCR' : '本地 OCR'}</small>
          </div>
          <textarea aria-label="OCR 识别文本" value={result.text} readOnly />
          <div className="ocr-actions">
            <button type="button" onClick={() => void copyResult()}>{copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{copied ? '已复制' : '复制文本'}</button>
            <button type="button" onClick={() => downloadText(result.text, safeTextFilename(file?.name ?? ''), 'text/plain;charset=utf-8')}><Download size={14} aria-hidden="true" />保存 TXT</button>
            <button type="button" onClick={reset}><RotateCcw size={14} aria-hidden="true" />识别其他文件</button>
          </div>
        </div>
      )}

      {phase === 'success' && result && mode === 'card' && (
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
            <button type="button" onClick={() => downloadText(buildVCard(card), businessCardFilename(card.name), 'text/vcard;charset=utf-8')}><Download size={14} aria-hidden="true" />确认并导出 VCF</button>
            <button type="button" onClick={reset}><RotateCcw size={14} aria-hidden="true" />识别另一张</button>
          </div>
        </div>
      )}
    </section>
  )
}

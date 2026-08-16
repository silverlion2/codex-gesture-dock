import { AlertTriangle, ArrowLeft, Check, Save, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  countOcrReviewRegions,
  DEFAULT_OCR_REVIEW_THRESHOLD,
  MAX_OCR_REVIEW_REGIONS,
  normalizeOcrReviewRegions,
  summarizeOcrConfidence,
} from '../lib/ocrConfidence'
import type { OcrRegion } from '../lib/localOcr'
import {
  MAX_OCR_CORRECTION_CHARACTERS,
  normalizeOcrCorrectionText,
  type OcrWordCorrection,
} from '../lib/ocrCorrections'

interface OcrConfidenceReviewProps {
  source: string | File
  sourceLabel: string
  regions: OcrRegion[]
  width?: number
  height?: number
  onClose: () => void
  onApplyCorrections?: (corrections: OcrWordCorrection[]) => void | Promise<void>
}

function score(value: number | null) {
  return value === null ? '—' : `${Math.round(value)}%`
}

export function OcrConfidenceReview({
  source,
  sourceLabel,
  regions,
  width,
  height,
  onClose,
  onApplyCorrections,
}: OcrConfidenceReviewProps) {
  const [threshold, setThreshold] = useState(DEFAULT_OCR_REVIEW_THRESHOLD)
  const [objectUrl, setObjectUrl] = useState(typeof source === 'string' ? source : '')
  const [imageSize, setImageSize] = useState({ width: width ?? 0, height: height ?? 0 })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draftText, setDraftText] = useState('')
  const [pendingCorrections, setPendingCorrections] = useState<Record<number, string>>({})
  const [correctionError, setCorrectionError] = useState('')
  const [applyingCorrections, setApplyingCorrections] = useState(false)
  const [showAllWords, setShowAllWords] = useState(false)
  const [wordPage, setWordPage] = useState(0)

  useEffect(() => {
    if (typeof source === 'string') {
      setObjectUrl(source)
      return
    }
    const url = URL.createObjectURL(source)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [source])

  const summary = useMemo(
    () => summarizeOcrConfidence(regions, threshold),
    [regions, threshold],
  )
  const reviewRegions = useMemo(
    () => normalizeOcrReviewRegions(
      regions,
      imageSize.width,
      imageSize.height,
      threshold,
      MAX_OCR_REVIEW_REGIONS,
      { includeAll: showAllWords, offset: wordPage * MAX_OCR_REVIEW_REGIONS },
    ),
    [imageSize.height, imageSize.width, regions, showAllWords, threshold, wordPage],
  )
  const candidateCount = useMemo(
    () => countOcrReviewRegions(regions, imageSize.width, imageSize.height, threshold, showAllWords),
    [imageSize.height, imageSize.width, regions, showAllWords, threshold],
  )
  const wordPageCount = Math.max(1, Math.ceil(candidateCount / MAX_OCR_REVIEW_REGIONS))

  useEffect(() => {
    setWordPage(0)
  }, [imageSize.height, imageSize.width, regions, showAllWords, threshold])

  useEffect(() => {
    if (!reviewRegions.some((region) => region.id === selectedId)) {
      setSelectedId(reviewRegions[0]?.id ?? null)
    }
  }, [reviewRegions, selectedId])

  const selectedRegion = reviewRegions.find((region) => region.id === selectedId) ?? null
  const pendingCount = Object.keys(pendingCorrections).length

  useEffect(() => {
    if (!selectedRegion) {
      setDraftText('')
      return
    }
    setDraftText(pendingCorrections[selectedRegion.sourceIndex] ?? selectedRegion.text)
    setCorrectionError('')
  }, [pendingCorrections, selectedRegion])

  const recordCorrection = () => {
    if (!selectedRegion) return
    const normalizedText = normalizeOcrCorrectionText(draftText)
    setPendingCorrections((current) => ({ ...current, [selectedRegion.sourceIndex]: normalizedText }))
    setDraftText(normalizedText)
    setCorrectionError('')
  }

  const applyCorrections = async () => {
    if (!onApplyCorrections || pendingCount === 0) return
    setApplyingCorrections(true)
    setCorrectionError('')
    try {
      await onApplyCorrections(Object.entries(pendingCorrections).map(([index, text]) => ({ index: Number(index), text })))
      setPendingCorrections({})
      onClose()
    } catch (caught) {
      setCorrectionError(caught instanceof Error ? caught.message : '无法应用 OCR 逐词校正')
    } finally {
      setApplyingCorrections(false)
    }
  }

  return (
    <section className="ocr-confidence-review" aria-label="OCR 置信度复核">
      <header>
        <div><AlertTriangle size={16} aria-hidden="true" /><strong>复核不确定文字</strong><small>{sourceLabel}</small></div>
        <button type="button" onClick={onClose}><ArrowLeft size={14} aria-hidden="true" />返回 OCR 文本</button>
      </header>
      <div className="ocr-confidence-summary" aria-label="OCR 置信度摘要">
        <div><span>识别词数</span><strong>{summary.wordCount}</strong></div>
        <div><span>平均分</span><strong>{score(summary.averageConfidence)}</strong></div>
        <div><span>最低分</span><strong>{score(summary.lowestConfidence)}</strong></div>
        <div><span>需复核</span><strong>{summary.reviewCount}</strong></div>
        <div><span>已核对</span><strong>{summary.reviewedCount}</strong></div>
        <label><span>提示阈值 &lt; {threshold}%</span><input aria-label="OCR 置信度提示阈值" type="range" min="50" max="95" step="5" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} /></label>
        <label className="ocr-confidence-all-toggle"><input aria-label="显示全部 OCR 词框" type="checkbox" checked={showAllWords} onChange={(event) => setShowAllWords(event.target.checked)} /><span>包括高分词</span></label>
      </div>
      <div className="ocr-confidence-body">
        <div className="ocr-confidence-preview" style={imageSize.width > 0 && imageSize.height > 0 ? { aspectRatio: `${imageSize.width} / ${imageSize.height}` } : undefined}>
          {objectUrl && <img src={objectUrl} alt="OCR 置信度复核原图" onLoad={(event) => setImageSize({ width: width ?? event.currentTarget.naturalWidth, height: height ?? event.currentTarget.naturalHeight })} />}
          {reviewRegions.map((region) => (
            <button
              key={region.id}
              type="button"
              className={selectedId === region.id ? 'is-selected' : ''}
              aria-label={`复核文字 ${region.text}，置信度 ${Math.round(region.confidence)}%`}
              title={`${region.text} · ${Math.round(region.confidence)}%`}
              style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }}
              onClick={() => setSelectedId(region.id)}
            />
          ))}
        </div>
        <div className="ocr-confidence-side">
          <div className="ocr-confidence-list">
            {reviewRegions.length > 0 ? (
              <ul aria-label={showAllWords ? '全部 OCR 词框' : '疑似低置信文字'}>
                {reviewRegions.map((region) => (
                  <li key={region.id}>
                    <button type="button" aria-pressed={selectedId === region.id} onClick={() => setSelectedId(region.id)}><strong>{(pendingCorrections[region.sourceIndex] ?? region.text) || '（删除）'}</strong><span>{region.humanReviewed ? '已核对' : `${Math.round(region.confidence)}%`}</span></button>
                  </li>
                ))}
              </ul>
            ) : <div className="ocr-confidence-empty"><ShieldCheck size={20} aria-hidden="true" /><strong>{showAllWords ? '当前页面没有有效词框' : '当前阈值下没有提示项'}</strong><span>仍需对照原图目视复核。</span></div>}
            {wordPageCount > 1 && <div className="ocr-confidence-pagination" aria-label="OCR 词框分页"><button type="button" disabled={wordPage === 0} onClick={() => setWordPage((current) => Math.max(0, current - 1))}>上一组</button><span>第 {wordPage + 1}/{wordPageCount} 组</span><button type="button" disabled={wordPage + 1 >= wordPageCount} onClick={() => setWordPage((current) => Math.min(wordPageCount - 1, current + 1))}>下一组</button></div>}
          </div>
          {onApplyCorrections && selectedRegion && (
            <div className="ocr-correction-editor">
              <label><span>校正选中文字</span><input aria-label={`校正文字 ${selectedRegion.recognizedText}`} maxLength={MAX_OCR_CORRECTION_CHARACTERS} value={draftText} onChange={(event) => setDraftText(event.target.value)} /></label>
              <small>引擎识别：{selectedRegion.recognizedText}{selectedRegion.humanReviewed ? ' · 已人工核对，可再次修改' : ''}</small>
              <div><button type="button" onClick={recordCorrection}><Check size={12} aria-hidden="true" />记录此词</button><button type="button" disabled={pendingCount === 0 || applyingCorrections} onClick={() => void applyCorrections()}><Save size={12} aria-hidden="true" />{applyingCorrections ? '正在应用' : `应用 ${pendingCount} 项复核`}</button></div>
              {correctionError && <span role="alert">{correctionError}</span>}
            </div>
          )}
        </div>
      </div>
      <p>{onApplyCorrections ? '置信度是引擎启发式分数，不是正确概率。只有“记录此词”并应用后才更新文字；词框位置和原始分数保持不变，空内容表示删除误识别词。' : '置信度是 OCR 引擎的启发式分数，不是正确概率；高分也可能识别错误，提示框不会修改文字或导出内容。'}每组最多显示 100 个词；可包括高分词并分页复核。</p>
    </section>
  )
}

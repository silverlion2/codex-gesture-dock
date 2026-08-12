import { AlertTriangle, ArrowLeft, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_OCR_REVIEW_THRESHOLD,
  normalizeOcrReviewRegions,
  summarizeOcrConfidence,
} from '../lib/ocrConfidence'
import type { OcrRegion } from '../lib/localOcr'

interface OcrConfidenceReviewProps {
  source: string | File
  sourceLabel: string
  regions: OcrRegion[]
  width?: number
  height?: number
  onClose: () => void
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
}: OcrConfidenceReviewProps) {
  const [threshold, setThreshold] = useState(DEFAULT_OCR_REVIEW_THRESHOLD)
  const [objectUrl, setObjectUrl] = useState(typeof source === 'string' ? source : '')
  const [imageSize, setImageSize] = useState({ width: width ?? 0, height: height ?? 0 })
  const [selectedId, setSelectedId] = useState<string | null>(null)

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
    () => normalizeOcrReviewRegions(regions, imageSize.width, imageSize.height, threshold),
    [imageSize.height, imageSize.width, regions, threshold],
  )

  useEffect(() => {
    if (!reviewRegions.some((region) => region.id === selectedId)) {
      setSelectedId(reviewRegions[0]?.id ?? null)
    }
  }, [reviewRegions, selectedId])

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
        <label><span>提示阈值 &lt; {threshold}%</span><input aria-label="OCR 置信度提示阈值" type="range" min="50" max="95" step="5" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} /></label>
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
        <div className="ocr-confidence-list">
          {reviewRegions.length > 0 ? (
            <ul aria-label="疑似低置信文字">
              {reviewRegions.map((region) => (
                <li key={region.id}>
                  <button type="button" aria-pressed={selectedId === region.id} onClick={() => setSelectedId(region.id)}><strong>{region.text}</strong><span>{Math.round(region.confidence)}%</span></button>
                </li>
              ))}
            </ul>
          ) : <div className="ocr-confidence-empty"><ShieldCheck size={20} aria-hidden="true" /><strong>当前阈值下没有提示项</strong><span>仍需对照原图目视复核。</span></div>}
        </div>
      </div>
      <p>置信度是 OCR 引擎的启发式分数，不是正确概率；高分也可能识别错误，提示框不会修改文字或导出内容。最多显示分数最低的 100 个词。</p>
    </section>
  )
}

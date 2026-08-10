import { Download, GitCompare, RotateCcw, ShieldCheck, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import {
  comparisonFilename,
  prepareImageComparison,
  renderPreparedComparison,
  type PreparedImageComparison,
  type RenderedImageComparison,
} from '../lib/imageComparison'

interface ImageComparisonPanelProps {
  onMessage: (message: string) => void
}

type ComparisonPhase = 'idle' | 'preparing' | 'ready' | 'error'
type ComparisonView = 'wipe' | 'diff'

const toleranceOptions = [
  { value: 0.05, label: '严格 · 5%' },
  { value: 0.1, label: '推荐 · 10%' },
  { value: 0.2, label: '宽松 · 20%' },
]

function downloadDiff(dataUrl: string, filename: string) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  link.click()
}

function formatPercentage(value: number) {
  if (value === 0 || value >= 0.01) return value.toFixed(2)
  return '< 0.01'
}

function wipePositionForKey(key: string, current: number) {
  if (key === 'Home') return 0
  if (key === 'End') return 100
  if (key === 'PageDown') return Math.max(0, current - 10)
  if (key === 'PageUp') return Math.min(100, current + 10)
  if (key === 'ArrowLeft' || key === 'ArrowDown') return Math.max(0, current - 1)
  if (key === 'ArrowRight' || key === 'ArrowUp') return Math.min(100, current + 1)
  return null
}

export function ImageComparisonPanel({ onMessage }: ImageComparisonPanelProps) {
  const [phase, setPhase] = useState<ComparisonPhase>('idle')
  const [baselineFile, setBaselineFile] = useState<File | null>(null)
  const [candidateFile, setCandidateFile] = useState<File | null>(null)
  const [prepared, setPrepared] = useState<PreparedImageComparison | null>(null)
  const [result, setResult] = useState<RenderedImageComparison | null>(null)
  const [threshold, setThreshold] = useState(0.1)
  const [view, setView] = useState<ComparisonView>('wipe')
  const [wipePosition, setWipePosition] = useState(50)
  const [error, setError] = useState('')
  const requestRef = useRef(0)

  const startComparison = async () => {
    if (!baselineFile || !candidateFile) return
    const request = ++requestRef.current
    setPhase('preparing')
    setError('')
    try {
      const nextPrepared = await prepareImageComparison(baselineFile, candidateFile)
      if (request !== requestRef.current) return
      const nextResult = renderPreparedComparison(nextPrepared, threshold)
      setPrepared(nextPrepared)
      setResult(nextResult)
      setView('wipe')
      setWipePosition(50)
      setPhase('ready')
      onMessage(nextResult.mismatchPixels === 0
        ? '在当前容差下未发现像素差异；仍请滑动对照关键区域'
        : `本机图片对比完成：发现 ${nextResult.mismatchPixels.toLocaleString()} 个差异像素`)
    } catch (caught) {
      if (request !== requestRef.current) return
      setError(caught instanceof Error ? caught.message : '本地图片对比失败')
      setPhase('error')
    }
  }

  const changeThreshold = (nextThreshold: number) => {
    setThreshold(nextThreshold)
    if (!prepared) return
    try {
      const nextResult = renderPreparedComparison(prepared, nextThreshold)
      setResult(nextResult)
      onMessage(`已按${toleranceOptions.find((option) => option.value === nextThreshold)?.label ?? '新'}容差重新计算差异`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法重新计算图片差异')
      setPhase('error')
    }
  }

  const reset = () => {
    requestRef.current += 1
    setPhase('idle')
    setBaselineFile(null)
    setCandidateFile(null)
    setPrepared(null)
    setResult(null)
    setView('wipe')
    setWipePosition(50)
    setError('')
  }

  return (
    <section className="camera-tool-panel image-comparison-panel" aria-label="本机图片对比">
      <header>
        <div><GitCompare size={17} aria-hidden="true" /><strong>图片对比</strong></div>
        <span><ShieldCheck size={13} aria-hidden="true" />Pixelmatch 与图片均留在本机</span>
      </header>

      {phase === 'idle' && (
        <div className="image-comparison-empty">
          <div className="image-comparison-empty-copy">
            <GitCompare size={25} aria-hidden="true" />
            <strong>对比两张截图或照片</strong>
            <small>滑动查看前后变化，并生成可导出的像素差异热图</small>
          </div>
          <div className="image-comparison-file-grid">
            <label className="ocr-upload-button">
              <Upload size={14} aria-hidden="true" />{baselineFile ? '更换基准图' : '选择基准图'}
              <input className="sr-only" aria-label="选择基准图" type="file" accept="image/png,image/jpeg,image/webp,image/bmp" onChange={(event) => { setBaselineFile(event.target.files?.[0] ?? null); event.target.value = '' }} />
            </label>
            <span title={baselineFile?.name}>{baselineFile?.name ?? '尚未选择'}</span>
            <label className="ocr-upload-button">
              <Upload size={14} aria-hidden="true" />{candidateFile ? '更换候选图' : '选择候选图'}
              <input className="sr-only" aria-label="选择候选图" type="file" accept="image/png,image/jpeg,image/webp,image/bmp" onChange={(event) => { setCandidateFile(event.target.files?.[0] ?? null); event.target.value = '' }} />
            </label>
            <span title={candidateFile?.name}>{candidateFile?.name ?? '尚未选择'}</span>
            <button type="button" disabled={!baselineFile || !candidateFile} onClick={() => void startComparison()}><GitCompare size={14} aria-hidden="true" />开始本机对比</button>
          </div>
        </div>
      )}

      {phase === 'preparing' && (
        <div className="image-comparison-loading" role="status" aria-live="polite">
          <span className="small-spinner" aria-hidden="true" />
          <div><strong>正在对齐并比较图片</strong><small>大图会等比例缩小，图片不会上传</small></div>
        </div>
      )}

      {phase === 'error' && (
        <div className="ocr-error-state" role="alert"><strong>图片对比失败</strong><span>{error}</span><button type="button" onClick={reset}><RotateCcw size={14} aria-hidden="true" />重新选择</button></div>
      )}

      {phase === 'ready' && prepared && result && (
        <div className="image-comparison-workbench">
          <div className="image-comparison-visual-column">
            <div className="image-comparison-view-tabs" role="group" aria-label="图片对比视图">
              <button type="button" aria-pressed={view === 'wipe'} onClick={() => setView('wipe')}>滑动对照</button>
              <button type="button" aria-pressed={view === 'diff'} onClick={() => setView('diff')}>差异热图</button>
            </div>
            <div className="image-comparison-preview" style={{ aspectRatio: `${prepared.width} / ${prepared.height}` }}>
              {view === 'wipe' ? (
                <>
                  <img src={prepared.baseline.dataUrl} alt="基准图对比预览" />
                  <img className="image-comparison-candidate" style={{ clipPath: `inset(0 ${100 - wipePosition}% 0 0)` }} src={prepared.candidate.dataUrl} alt="候选图对比预览" />
                  <i className="image-comparison-divider" aria-hidden="true" style={{ left: `${wipePosition}%` }} />
                  <span className="is-baseline">基准</span><span className="is-candidate">候选</span>
                </>
              ) : (
                <img src={result.diffDataUrl} alt="像素差异热图" />
              )}
            </div>
            {view === 'wipe' && (
              <label className="image-comparison-wipe-control">
                <span>对照分界 {wipePosition}%</span>
                <input
                  aria-label="对照分界"
                  type="range"
                  min="0"
                  max="100"
                  value={wipePosition}
                  onChange={(event) => setWipePosition(Number(event.target.value))}
                  onKeyDown={(event) => {
                    const nextPosition = wipePositionForKey(event.key, wipePosition)
                    if (nextPosition === null) return
                    event.preventDefault()
                    setWipePosition(nextPosition)
                  }}
                />
              </label>
            )}
          </div>

          <div className="image-comparison-controls">
            <div className="image-comparison-metrics" aria-label="图片差异指标">
              <div><span>相似度</span><strong>{result.matchPercentage.toFixed(2)}%</strong></div>
              <div><span>差异像素</span><strong>{result.mismatchPixels.toLocaleString()}</strong></div>
              <div><span>差异占比</span><strong>{formatPercentage(result.mismatchPercentage)}%</strong></div>
            </div>
            <label><span>差异容差</span><select aria-label="差异容差" value={threshold} onChange={(event) => changeThreshold(Number(event.target.value))}>{toleranceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <dl className="image-comparison-details">
              <div><dt>基准图</dt><dd>{prepared.baseline.originalWidth} × {prepared.baseline.originalHeight}</dd></div>
              <div><dt>候选图</dt><dd>{prepared.candidate.originalWidth} × {prepared.candidate.originalHeight}</dd></div>
              <div><dt>对比画布</dt><dd>{prepared.width} × {prepared.height}{prepared.scale < 1 ? ` · 缩放 ${Math.round(prepared.scale * 100)}%` : ''}</dd></div>
              <div><dt>差异范围</dt><dd>{result.changedBounds ? `${result.changedBounds.x},${result.changedBounds.y} · ${result.changedBounds.width} × ${result.changedBounds.height}` : '当前容差下无差异'}</dd></div>
            </dl>
            <p>{prepared.dimensionsDiffer
              ? '两图尺寸不同：按左上角对齐，空白区域补白后比较。尺寸与裁切差异会计入结果。'
              : '像素差异不等同于视觉质量或功能回归；请结合滑动对照复核关键区域。'}</p>
            <div className="image-comparison-actions">
              <button className="image-comparison-export" type="button" onClick={() => downloadDiff(result.diffDataUrl, comparisonFilename(prepared.baseline.filename, prepared.candidate.filename))}><Download size={14} aria-hidden="true" />导出差异 PNG</button>
              <button type="button" onClick={reset}><RotateCcw size={14} aria-hidden="true" />重新选择</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

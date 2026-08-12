import { BarChart3, Download, RefreshCw, ShieldCheck, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  imageInspectionFilename,
  imageInspectionJson,
  prepareImageInspection,
  type ImageHistogram,
  type PreparedImageInspection,
} from '../lib/imageInspection'

interface ImageInspectionPanelProps {
  onMessage: (message: string) => void
}

type InspectionPhase = 'idle' | 'analyzing' | 'ready' | 'error'
type HistogramChannel = keyof Omit<ImageHistogram, 'bins'>

const channelOptions: Array<{ key: HistogramChannel; label: string; color: string }> = [
  { key: 'luminance', label: '亮度', color: '#527a5e' },
  { key: 'red', label: '红', color: '#d95d5d' },
  { key: 'green', label: '绿', color: '#4c9b68' },
  { key: 'blue', label: '蓝', color: '#4f7fc6' },
]

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function percent(value: number) {
  if (value === 0) return '0%'
  if (value < 0.0001) return '< 0.01%'
  return `${(value * 100).toFixed(value < 0.01 ? 2 : 1)}%`
}

function histogramPath(values: number[]) {
  const width = 256
  const height = 92
  const max = Math.max(1, ...values)
  const points = values.map((value, index) => {
    const x = index / Math.max(1, values.length - 1) * width
    const y = height - value / max * height
    return `L ${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')
  return `M 0 ${height} ${points} L ${width} ${height} Z`
}

function downloadJson(prepared: PreparedImageInspection) {
  const blob = new Blob([imageInspectionJson(prepared.report)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = imageInspectionFilename(prepared.report.filename)
  link.click()
  URL.revokeObjectURL(url)
}

export function ImageInspectionPanel({ onMessage }: ImageInspectionPanelProps) {
  const [phase, setPhase] = useState<InspectionPhase>('idle')
  const [prepared, setPrepared] = useState<PreparedImageInspection | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [channel, setChannel] = useState<HistogramChannel>('luminance')
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!prepared) {
      setPreviewUrl('')
      return
    }
    const url = URL.createObjectURL(prepared.previewBlob)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [prepared])

  useEffect(() => () => abortRef.current?.abort(), [])

  const selectedChannel = channelOptions.find((option) => option.key === channel) ?? channelOptions[0]
  const path = useMemo(
    () => prepared ? histogramPath(prepared.report.histogram[channel]) : '',
    [channel, prepared],
  )

  const analyze = async (file: File) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('analyzing')
    setPrepared(null)
    setError('')
    try {
      const next = await prepareImageInspection(file, controller.signal)
      if (controller.signal.aborted) return
      setPrepared(next)
      setChannel('luminance')
      setPhase('ready')
      onMessage(`图片检查完成：${next.report.originalWidth} × ${next.report.originalHeight}，发现 ${next.report.signals.length} 项复核信号`)
    } catch (caught) {
      if (controller.signal.aborted) return
      setError(caught instanceof Error ? caught.message : '本机图片检查失败')
      setPhase('error')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  const reset = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setPrepared(null)
    setPreviewUrl('')
    setChannel('luminance')
    setError('')
    setPhase('idle')
  }

  return (
    <section className="image-inspection-panel" aria-label="本机图片检查与直方图">
      {phase === 'idle' && (
        <div className="image-inspection-empty">
          <BarChart3 size={27} aria-hidden="true" />
          <strong>检查尺寸、曝光、透明度与边缘响应</strong>
          <small>生成 RGB/亮度直方图和可解释的像素信号，不上传图片，也不使用主观质量模型</small>
          <label className="ocr-upload-button"><Upload size={14} aria-hidden="true" />选择图片<input className="sr-only" aria-label="选择待检查图片" type="file" accept="image/png,image/jpeg,image/webp,image/bmp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void analyze(file); event.target.value = '' }} /></label>
          <span>PNG、JPEG、WebP、BMP · 最大 35 MB</span>
        </div>
      )}

      {phase === 'analyzing' && (
        <div className="image-inspection-loading" role="status" aria-live="polite">
          <span className="small-spinner" aria-hidden="true" />
          <div><strong>正在读取本机像素并生成直方图</strong><small>分析画布最多 2400 像素边长、400 万像素</small></div>
          <button type="button" onClick={reset}>取消</button>
        </div>
      )}

      {phase === 'error' && (
        <div className="ocr-error-state" role="alert"><strong>图片检查失败</strong><span>{error}</span><button type="button" onClick={reset}><RefreshCw size={14} aria-hidden="true" />重新选择</button></div>
      )}

      {phase === 'ready' && prepared && previewUrl && (
        <div className="image-inspection-workbench">
          <div className="image-inspection-visual">
            <div className="image-inspection-preview"><img src={previewUrl} alt="图片检查预览" /></div>
            <div className="image-inspection-histogram">
              <div className="image-inspection-channel-tabs" role="group" aria-label="直方图通道">
                {channelOptions.map((option) => <button key={option.key} type="button" aria-pressed={channel === option.key} onClick={() => setChannel(option.key)}>{option.label}</button>)}
              </div>
              <svg viewBox="0 0 256 100" role="img" aria-label={`${selectedChannel.label}直方图`} preserveAspectRatio="none">
                <title>{selectedChannel.label}直方图，从暗到亮共 64 档</title>
                <path d={path} fill={selectedChannel.color} />
              </svg>
              <div><span>暗部 0</span><span>64 档</span><span>亮部 255</span></div>
            </div>
          </div>

          <div className="image-inspection-details">
            <div className="image-inspection-summary">
              <div><span>原图尺寸</span><strong>{prepared.report.originalWidth} × {prepared.report.originalHeight}</strong><small>{prepared.report.aspectRatio} · {prepared.report.orientation === 'landscape' ? '横向' : prepared.report.orientation === 'portrait' ? '纵向' : '方形'}</small></div>
              <div><span>文件大小</span><strong>{formatBytes(prepared.report.fileSize)}</strong><small>{prepared.report.mimeType.replace('image/', '').toUpperCase()}</small></div>
              <div><span>平均亮度</span><strong>{prepared.report.meanLuminance}</strong><small>0–255</small></div>
              <div><span>亮度对比</span><strong>{prepared.report.contrast}</strong><small>标准差</small></div>
              <div><span>边缘响应</span><strong>{prepared.report.sharpness}</strong><small>拉普拉斯启发值</small></div>
              <div><span>透明像素</span><strong>{percent(prepared.report.transparentRatio)}</strong><small>半透明 {percent(prepared.report.partialTransparencyRatio)}</small></div>
            </div>

            <dl className="image-inspection-clipping">
              <div><dt>接近纯黑</dt><dd>{percent(prepared.report.shadowClipRatio)}</dd></div>
              <div><dt>接近纯白</dt><dd>{percent(prepared.report.highlightClipRatio)}</dd></div>
              <div><dt>分析画布</dt><dd>{prepared.report.analysisWidth} × {prepared.report.analysisHeight}{prepared.report.scale < 1 ? ` · ${Math.round(prepared.report.scale * 100)}%` : ''}</dd></div>
            </dl>

            <div className="image-inspection-signals">
              <strong><ShieldCheck size={14} aria-hidden="true" />复核信号 {prepared.report.signals.length}</strong>
              {prepared.report.signals.length > 0 ? (
                <ul>{prepared.report.signals.map((entry) => <li key={entry.code}><strong>{entry.label}</strong><span>{entry.guidance}</span></li>)}</ul>
              ) : <p>未触发当前阈值下的像素复核信号；这不代表图片没有构图、噪点或内容问题。</p>}
            </div>

            <p className="image-inspection-limit">直方图排除完全透明像素。边缘响应会受插画、文字、纹理和缩放影响；这些数值不是审美、对焦、真实性或无障碍结论。</p>
            <div className="image-inspection-actions">
              <button type="button" onClick={() => { downloadJson(prepared); onMessage(`已导出 ${imageInspectionFilename(prepared.report.filename)}`) }}><Download size={14} aria-hidden="true" />导出检查 JSON</button>
              <button type="button" onClick={reset}><RefreshCw size={14} aria-hidden="true" />检查其他图片</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

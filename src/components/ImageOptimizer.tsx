import { Download, ImageDown, RotateCcw, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { optimizeImage, type ImageOutputFormat, type OptimizedImage } from '../lib/imageOptimizer'

interface ImageOptimizerProps {
  onMessage: (message: string) => void
}

type OptimizerPhase = 'idle' | 'processing' | 'ready' | 'error'

const maxEdgeOptions = [
  { value: 'original', label: '保留原尺寸（受安全上限约束）' },
  { value: '2048', label: '最长边 2048 px' },
  { value: '1600', label: '最长边 1600 px' },
  { value: '1200', label: '最长边 1200 px' },
  { value: '800', label: '最长边 800 px' },
]

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function sizeChange(result: OptimizedImage) {
  if (result.inputBytes === 0) return '无法计算'
  const percentage = Math.abs(1 - result.outputBytes / result.inputBytes) * 100
  return result.outputBytes <= result.inputBytes
    ? `减少 ${percentage.toFixed(1)}%`
    : `增加 ${percentage.toFixed(1)}%`
}

export function ImageOptimizer({ onMessage }: ImageOptimizerProps) {
  const [file, setFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<OptimizerPhase>('idle')
  const [format, setFormat] = useState<ImageOutputFormat>('webp')
  const [quality, setQuality] = useState(82)
  const [maxEdge, setMaxEdge] = useState('1600')
  const [result, setResult] = useState<OptimizedImage | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!result) {
      setPreviewUrl('')
      return
    }
    const url = URL.createObjectURL(result.blob)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [result])

  useEffect(() => () => abortRef.current?.abort(), [])

  const start = async () => {
    if (!file) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('processing')
    setError('')
    try {
      const optimized = await optimizeImage(file, {
        format,
        quality: quality / 100,
        maxEdge: maxEdge === 'original' ? null : Number(maxEdge),
      }, controller.signal)
      if (controller.signal.aborted) return
      setResult(optimized)
      setPhase('ready')
      onMessage(`图片已在本机优化：${optimized.width} × ${optimized.height}，${sizeChange(optimized)}`)
    } catch (caught) {
      if (controller.signal.aborted) return
      setError(caught instanceof Error ? caught.message : '图片优化失败')
      setPhase('error')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  const reset = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setFile(null)
    setResult(null)
    setPhase('idle')
    setError('')
  }

  const download = () => {
    if (!previewUrl || !result) return
    const link = document.createElement('a')
    link.href = previewUrl
    link.download = result.filename
    link.click()
    onMessage(`已导出 ${result.filename}；源图片未被修改`)
  }

  return (
    <section className="image-optimizer" aria-label="本机图片优化">
      {phase === 'idle' && (
        <div className="image-optimizer-empty">
          <div>
            <ImageDown size={25} aria-hidden="true" />
            <strong>缩放、转换与压缩图片</strong>
            <small>浏览器原生 Canvas 本机处理；重新编码不会复制源图片元数据</small>
          </div>
          <label className="ocr-upload-button">
            <Upload size={14} aria-hidden="true" />{file ? '更换图片' : '选择图片'}
            <input
              className="sr-only"
              aria-label="选择待优化图片"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/bmp"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null)
                setResult(null)
                setError('')
                event.target.value = ''
              }}
            />
          </label>
          <span title={file?.name}>{file?.name ?? '支持 PNG、JPEG、WebP、BMP · 最大 35 MB'}</span>
          <div className="image-optimizer-options">
            <label><span>输出格式</span><select aria-label="优化输出格式" value={format} onChange={(event) => setFormat(event.target.value as ImageOutputFormat)}><option value="webp">WebP</option><option value="jpeg">JPEG</option><option value="png">PNG</option></select></label>
            <label><span>输出尺寸</span><select aria-label="优化输出尺寸" value={maxEdge} onChange={(event) => setMaxEdge(event.target.value)}>{maxEdgeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className={format === 'png' ? 'is-disabled' : ''}><span>品质 {quality}%</span><input aria-label="优化输出品质" type="range" min="40" max="100" value={quality} disabled={format === 'png'} onChange={(event) => setQuality(Number(event.target.value))} /></label>
          </div>
          <button type="button" disabled={!file} onClick={() => void start()}><ImageDown size={14} aria-hidden="true" />开始本机优化</button>
          <p>JPEG 会把透明区域合成白色；PNG 为无损编码，品质滑杆不生效。结果可能比原图更大，请以导出前指标和预览为准。</p>
        </div>
      )}

      {phase === 'processing' && (
        <div className="image-optimizer-loading" role="status" aria-live="polite">
          <span className="small-spinner" aria-hidden="true" />
          <div><strong>正在本机重新编码图片</strong><small>保留宽高比，不会放大原图或上传文件</small></div>
          <button type="button" onClick={reset}>取消</button>
        </div>
      )}

      {phase === 'error' && (
        <div className="ocr-error-state" role="alert"><strong>图片优化失败</strong><span>{error}</span><button type="button" onClick={() => setPhase('idle')}><RotateCcw size={14} aria-hidden="true" />调整设置</button></div>
      )}

      {phase === 'ready' && result && previewUrl && (
        <div className="image-optimizer-result">
          <div className="image-optimizer-preview"><img src={previewUrl} alt="优化后图片预览" /></div>
          <div className="image-optimizer-result-details">
            <div className="image-optimizer-metrics" aria-label="图片优化指标">
              <div><span>原始</span><strong>{formatBytes(result.inputBytes)}</strong></div>
              <div><span>输出</span><strong>{formatBytes(result.outputBytes)}</strong></div>
              <div><span>体积变化</span><strong>{sizeChange(result)}</strong></div>
            </div>
            <dl>
              <div><dt>原始尺寸</dt><dd>{result.originalWidth} × {result.originalHeight}</dd></div>
              <div><dt>输出尺寸</dt><dd>{result.width} × {result.height}</dd></div>
              <div><dt>输出格式</dt><dd>{result.format.toUpperCase()}{result.quality === null ? ' · 无损' : ` · 品质 ${Math.round(result.quality * 100)}%`}</dd></div>
              <div><dt>元数据</dt><dd>重新编码，不复制 EXIF/GPS</dd></div>
            </dl>
            <p>这是浏览器原生编码结果，不等同于专业无损压缩；请放大检查文字、透明边缘与细节。</p>
            <div className="image-optimizer-actions">
              <button type="button" onClick={download}><Download size={14} aria-hidden="true" />确认并导出</button>
              <button type="button" onClick={() => { setResult(null); setPhase('idle') }}><RotateCcw size={14} aria-hidden="true" />调整设置</button>
              <button type="button" onClick={reset}>选择其他图片</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}


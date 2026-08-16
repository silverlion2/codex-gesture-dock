import { Download, ImageIcon, RotateCcw, SlidersHorizontal, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  exportAdjustedImage,
  imageAdjustmentPresets,
  neutralImageAdjustments,
  prepareImageAdjustmentSource,
  renderImageAdjustmentPreview,
  type ImageAdjustmentPresetKey,
  type ImageAdjustments,
  type PreparedImageAdjustmentSource,
  type RenderedImageAdjustmentPreview,
} from '../lib/imageAdjustment'
import type { ImageOutputFormat } from '../lib/imageOptimizer'

interface ImageAdjustmentPanelProps {
  onMessage: (message: string) => void
}

type AdjustmentPhase = 'idle' | 'preparing' | 'editing' | 'rendering' | 'exporting' | 'error'

const presetLabels: Record<ImageAdjustmentPresetKey, string> = {
  neutral: '原始',
  vivid: '鲜明',
  warm: '暖调',
  cool: '冷调',
  mono: '黑白',
  faded: '柔和',
}

function sameAdjustments(left: ImageAdjustments, right: ImageAdjustments) {
  return left.exposure === right.exposure
    && left.contrast === right.contrast
    && left.saturation === right.saturation
    && left.temperature === right.temperature
    && left.hue === right.hue
    && left.sharpness === right.sharpness
    && left.grayscale === right.grayscale
}

function signed(value: number, suffix = '') {
  return `${value > 0 ? '+' : ''}${value}${suffix}`
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function ImageAdjustmentPanel({ onMessage }: ImageAdjustmentPanelProps) {
  const [phase, setPhase] = useState<AdjustmentPhase>('idle')
  const [source, setSource] = useState<PreparedImageAdjustmentSource | null>(null)
  const [originalUrl, setOriginalUrl] = useState('')
  const [preview, setPreview] = useState<RenderedImageAdjustmentPreview | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [settings, setSettings] = useState<ImageAdjustments>(neutralImageAdjustments)
  const [format, setFormat] = useState<ImageOutputFormat>('png')
  const [quality, setQuality] = useState(90)
  const [wipePosition, setWipePosition] = useState(50)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const activePreset = useMemo(
    () => (Object.entries(imageAdjustmentPresets) as Array<[ImageAdjustmentPresetKey, ImageAdjustments]>).find(([, preset]) => sameAdjustments(settings, preset))?.[0] ?? null,
    [settings],
  )

  useEffect(() => {
    if (!source) {
      setOriginalUrl('')
      return
    }
    const url = URL.createObjectURL(source.originalPreviewBlob)
    setOriginalUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [source])

  useEffect(() => {
    if (!preview) {
      setPreviewUrl('')
      return
    }
    const url = URL.createObjectURL(preview.blob)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [preview])

  useEffect(() => () => abortRef.current?.abort(), [])

  const reset = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setPhase('idle')
    setSource(null)
    setPreview(null)
    setSettings(neutralImageAdjustments)
    setFormat('png')
    setQuality(90)
    setWipePosition(50)
    setError('')
  }

  const prepare = async (file: File) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('preparing')
    setError('')
    setPreview(null)
    try {
      const prepared = await prepareImageAdjustmentSource(file, controller.signal)
      if (controller.signal.aborted) return
      setSource(prepared)
      setSettings(neutralImageAdjustments)
      setWipePosition(50)
      setPhase('editing')
      onMessage(`图片已在本机准备：预览 ${prepared.previewWidth} × ${prepared.previewHeight}`)
    } catch (caught) {
      if (controller.signal.aborted) return
      setError(caught instanceof Error ? caught.message : '无法准备图片调整画布')
      setPhase('error')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  const changeSettings = (next: Partial<ImageAdjustments>) => {
    setSettings((current) => ({ ...current, ...next }))
    setPreview(null)
  }

  const applyPreset = (key: ImageAdjustmentPresetKey) => {
    setSettings({ ...imageAdjustmentPresets[key] })
    setPreview(null)
  }

  const createPreview = async () => {
    if (!source) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('rendering')
    setError('')
    try {
      const rendered = await renderImageAdjustmentPreview(source, settings, controller.signal)
      if (controller.signal.aborted) return
      setPreview(rendered)
      setWipePosition(50)
      setPhase('editing')
      onMessage(`调整预览已生成：${rendered.width} × ${rendered.height}；请滑动复核`)
    } catch (caught) {
      if (controller.signal.aborted) {
        setPhase('editing')
        onMessage('已取消调整预览；未写入任何文件')
        return
      }
      setError(caught instanceof Error ? caught.message : '生成图片调整预览失败')
      setPhase('error')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  const confirmAndExport = async () => {
    if (!source || !preview) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('exporting')
    setError('')
    try {
      const result = await exportAdjustedImage(source, settings, format, quality / 100, controller.signal)
      if (controller.signal.aborted) return
      const url = URL.createObjectURL(result.blob)
      const link = document.createElement('a')
      link.href = url
      link.download = result.filename
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1_000)
      setPhase('editing')
      onMessage(`已导出 ${result.filename}：${result.width} × ${result.height} · ${formatBytes(result.blob.size)}`)
    } catch (caught) {
      if (controller.signal.aborted) {
        setPhase('editing')
        onMessage('已取消调整导出；未写入任何文件')
        return
      }
      setError(caught instanceof Error ? caught.message : '导出调整后图片失败')
      setPhase('error')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  return (
    <section className="image-adjustment-panel" aria-label="本机图片调整">
      {phase === 'idle' && (
        <div className="image-adjustment-empty">
          <SlidersHorizontal size={27} aria-hidden="true" />
          <strong>调整图片的明暗、对比与色彩</strong>
          <small>使用确定性像素运算生成本机预览；先滑动对比，再明确导出重新编码图片</small>
          <label className="ocr-upload-button"><Upload size={14} aria-hidden="true" />选择图片<input className="sr-only" aria-label="选择待调整图片" type="file" accept="image/png,image/jpeg,image/webp,image/bmp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void prepare(file); event.target.value = '' }} /></label>
          <span>PNG、JPEG、WebP、BMP · 最大 35 MB · 解码后最大 8000 万像素</span>
        </div>
      )}

      {(phase === 'preparing' || phase === 'rendering' || phase === 'exporting') && (
        <div className="image-adjustment-loading" role="status" aria-live="polite">
          <span className="small-spinner" aria-hidden="true" />
          <div><strong>{phase === 'preparing' ? '正在准备有界预览' : phase === 'rendering' ? '正在分段计算调整预览' : '正在分段生成完整导出'}</strong><small>{phase === 'exporting' ? '大图会在计算间隙响应取消，不复制源元数据' : '像素只在本机内存处理'}</small></div>
          <button type="button" onClick={() => abortRef.current?.abort()}><X size={14} aria-hidden="true" />取消</button>
        </div>
      )}

      {phase === 'error' && (
        <div className="ocr-error-state" role="alert"><strong>图片调整失败</strong><span>{error}</span><button type="button" onClick={() => { setError(''); setPhase(source ? 'editing' : 'idle') }}><RotateCcw size={14} aria-hidden="true" />{source ? '返回调整' : '重新选择'}</button></div>
      )}

      {phase === 'editing' && source && originalUrl && (
        <div className="image-adjustment-editor">
          <div className="image-adjustment-visual-column">
            <div className="image-adjustment-stage" style={{ aspectRatio: `${source.previewWidth} / ${source.previewHeight}` }}>
              <img src={originalUrl} alt="图片调整原图预览" />
              {previewUrl ? <><img className="image-adjustment-after" style={{ clipPath: `inset(0 ${100 - wipePosition}% 0 0)` }} src={previewUrl} alt="图片调整后预览" /><i style={{ left: `${wipePosition}%` }} aria-hidden="true" /><span className="is-before">原图</span><span className="is-after">调整后</span></> : <div><ImageIcon size={18} aria-hidden="true" /><strong>调整参数后生成预览</strong><small>预览最长边 1600 px / 240 万像素</small></div>}
            </div>
            {previewUrl ? <label className="image-adjustment-wipe"><span>前后分界 {wipePosition}%</span><input aria-label="图片调整前后分界" type="range" min="0" max="100" value={wipePosition} onChange={(event) => setWipePosition(Number(event.target.value))} /></label> : null}
          </div>

          <div className="image-adjustment-controls">
            <div className="image-adjustment-presets" role="group" aria-label="图片调整预设">{(Object.keys(presetLabels) as ImageAdjustmentPresetKey[]).map((key) => <button key={key} type="button" aria-pressed={activePreset === key} onClick={() => applyPreset(key)}>{presetLabels[key]}</button>)}</div>
            <div className="image-adjustment-sliders">
              <label><span>曝光 <strong>{settings.exposure > 0 ? '+' : ''}{settings.exposure.toFixed(1)} EV</strong></span><input aria-label="图片曝光" type="range" min="-2" max="2" step="0.1" value={settings.exposure} onChange={(event) => changeSettings({ exposure: Number(event.target.value) })} /></label>
              <label><span>对比度 <strong>{signed(settings.contrast)}</strong></span><input aria-label="图片对比度" type="range" min="-100" max="100" value={settings.contrast} onChange={(event) => changeSettings({ contrast: Number(event.target.value) })} /></label>
              <label><span>饱和度 <strong>{signed(settings.saturation)}</strong></span><input aria-label="图片饱和度" type="range" min="-100" max="100" value={settings.saturation} onChange={(event) => changeSettings({ saturation: Number(event.target.value) })} /></label>
              <label><span>色温 <strong>{signed(settings.temperature)}</strong></span><input aria-label="图片色温" type="range" min="-100" max="100" value={settings.temperature} onChange={(event) => changeSettings({ temperature: Number(event.target.value) })} /></label>
              <label><span>色相 <strong>{signed(settings.hue, '°')}</strong></span><input aria-label="图片色相" type="range" min="-180" max="180" value={settings.hue} onChange={(event) => changeSettings({ hue: Number(event.target.value) })} /></label>
              <label><span>锐化 <strong>{settings.sharpness}%</strong></span><input aria-label="图片锐化" type="range" min="0" max="100" value={settings.sharpness} onChange={(event) => changeSettings({ sharpness: Number(event.target.value) })} /></label>
              <label><span>黑白 <strong>{settings.grayscale}%</strong></span><input aria-label="图片黑白" type="range" min="0" max="100" value={settings.grayscale} onChange={(event) => changeSettings({ grayscale: Number(event.target.value) })} /></label>
            </div>
            <div className="image-adjustment-output-options">
              <label><span>导出格式</span><select aria-label="图片调整导出格式" value={format} onChange={(event) => setFormat(event.target.value as ImageOutputFormat)}><option value="png">PNG</option><option value="jpeg">JPEG</option><option value="webp">WebP</option></select></label>
              <label className={format === 'png' ? 'is-disabled' : ''}><span>质量 {quality}%</span><input aria-label="图片调整导出质量" type="range" min="40" max="100" value={quality} disabled={format === 'png'} onChange={(event) => setQuality(Number(event.target.value))} /></label>
            </div>
            <dl><div><dt>原图</dt><dd>{source.originalWidth} × {source.originalHeight}</dd></div><div><dt>预览</dt><dd>{source.previewWidth} × {source.previewHeight}{source.previewScale < 1 ? ` · ${Math.round(source.previewScale * 100)}%` : ''}</dd></div><div><dt>导出</dt><dd>{source.outputWidth} × {source.outputHeight}{source.outputScale < 1 ? ` · ${Math.round(source.outputScale * 100)}%` : ''}</dd></div></dl>
            <p>运算顺序固定为曝光 → 对比度 → 色温 → 色相 → 饱和度 → 黑白 → 锐化。锐化只增强局部边缘，不会恢复已经丢失的细节。JPEG 会把透明区域合成白色；所有格式都会重新编码且不复制 EXIF/GPS。</p>
            <div className="image-adjustment-actions"><button type="button" onClick={() => void createPreview()}><ImageIcon size={14} aria-hidden="true" />{preview ? '重新生成预览' : '生成调整预览'}</button><button type="button" disabled={!preview} onClick={() => void confirmAndExport()}><Download size={14} aria-hidden="true" />确认并导出</button><button type="button" disabled={activePreset === 'neutral'} onClick={() => applyPreset('neutral')}><RotateCcw size={14} aria-hidden="true" />重置参数</button><button type="button" onClick={reset}>选择其他图片</button></div>
          </div>
        </div>
      )}
    </section>
  )
}

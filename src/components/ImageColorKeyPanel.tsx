import { Download, ImageIcon, Pipette, RotateCcw, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  defaultColorKeySettings,
  exportColorKey,
  prepareColorKeySource,
  renderColorKeyPreview,
  sampleColorKeyColor,
  type ColorKeySettings,
  type PreparedColorKeySource,
  type RenderedColorKey,
} from '../lib/imageColorKey'

interface ImageColorKeyPanelProps {
  onMessage: (message: string) => void
}

type ColorKeyPhase = 'idle' | 'preparing' | 'editing' | 'rendering' | 'exporting' | 'error'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export function ImageColorKeyPanel({ onMessage }: ImageColorKeyPanelProps) {
  const [phase, setPhase] = useState<ColorKeyPhase>('idle')
  const [source, setSource] = useState<PreparedColorKeySource | null>(null)
  const [originalUrl, setOriginalUrl] = useState('')
  const [preview, setPreview] = useState<RenderedColorKey | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [settings, setSettings] = useState<ColorKeySettings>({ ...defaultColorKeySettings })
  const [samplePoint, setSamplePoint] = useState<{ x: number; y: number } | null>(null)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

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
    setSettings({ ...defaultColorKeySettings })
    setSamplePoint(null)
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
      const prepared = await prepareColorKeySource(file, controller.signal)
      if (controller.signal.aborted) return
      let suggested = defaultColorKeySettings.keyColor
      try {
        suggested = sampleColorKeyColor(prepared.previewPixels, prepared.previewWidth, prepared.previewHeight, 0, 0).hex
      } catch {
        // A transparent corner is valid; retain the visible green-screen default.
      }
      setSource(prepared)
      setSettings({ ...defaultColorKeySettings, keyColor: suggested })
      setSamplePoint(suggested === defaultColorKeySettings.keyColor ? null : { x: 0, y: 0 })
      setPhase('editing')
      onMessage(`色彩抠图图片已准备；建议目标色 ${suggested}，请点击真实背景复核`)
    } catch (caught) {
      if (controller.signal.aborted) return
      setError(caught instanceof Error ? caught.message : '无法准备色彩抠图')
      setPhase('error')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  const changeSettings = (next: Partial<ColorKeySettings>) => {
    setSettings((current) => ({ ...current, ...next }))
    setPreview(null)
  }

  const sampleImage = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!source) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    try {
      const sampled = sampleColorKeyColor(source.previewPixels, source.previewWidth, source.previewHeight, x, y)
      changeSettings({ keyColor: sampled.hex })
      setSamplePoint({ x, y })
      onMessage(`已取样目标背景色 ${sampled.hex}；请生成预览检查同色主体`)
    } catch (caught) {
      onMessage(caught instanceof Error ? caught.message : '无法从该位置取样颜色')
    }
  }

  const createPreview = async () => {
    if (!source) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('rendering')
    setError('')
    try {
      const rendered = await renderColorKeyPreview(source, settings, controller.signal)
      if (controller.signal.aborted) return
      setPreview(rendered)
      setPhase('editing')
      onMessage(`色彩抠图预览已生成：移除 ${Math.round(rendered.removedCoverage * 1000) / 10}% 可见像素`)
    } catch (caught) {
      if (controller.signal.aborted) {
        setPhase('editing')
        onMessage('已取消色彩抠图预览；未写入任何文件')
        return
      }
      setError(caught instanceof Error ? caught.message : '生成色彩抠图预览失败')
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
      const result = await exportColorKey(source, settings, controller.signal)
      if (controller.signal.aborted) return
      downloadBlob(result.blob, result.filename)
      setPhase('editing')
      onMessage(`已导出 ${result.filename}：${result.width} × ${result.height} 透明 PNG`)
    } catch (caught) {
      if (controller.signal.aborted) {
        setPhase('editing')
        onMessage('已取消色彩抠图导出；未写入任何文件')
        return
      }
      setError(caught instanceof Error ? caught.message : '导出色彩抠图 PNG 失败')
      setPhase('error')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  return (
    <section className="image-ink-panel image-color-key-panel" aria-label="本机色彩抠图">
      {phase === 'idle' && <div className="image-ink-empty"><Pipette size={27} aria-hidden="true" /><strong>移除绿幕、纯色商品底或 Logo 背景</strong><small>点击背景取样，再用感知色距生成透明 PNG；不需要上传或下载模型</small><label className="ocr-upload-button"><Upload size={14} aria-hidden="true" />选择图片<input className="sr-only" aria-label="选择色彩抠图图片" type="file" accept="image/png,image/jpeg,image/webp,image/bmp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void prepare(file); event.target.value = '' }} /></label><span>PNG、JPEG、WebP、BMP · 最大 35 MB · 解码后最大 8000 万像素</span></div>}

      {(phase === 'preparing' || phase === 'rendering' || phase === 'exporting') && <div className="image-ink-loading" role="status" aria-live="polite"><span className="small-spinner" aria-hidden="true" /><div><strong>{phase === 'preparing' ? '正在准备有界图片' : phase === 'rendering' ? '正在分段计算感知色距' : '正在重新生成完整 PNG'}</strong><small>原图、取样色和像素只留在本机内存</small></div><button type="button" onClick={() => abortRef.current?.abort()}><X size={14} aria-hidden="true" />取消</button></div>}

      {phase === 'error' && <div className="ocr-error-state" role="alert"><strong>色彩抠图失败</strong><span>{error}</span><button type="button" onClick={() => { setError(''); setPhase(source ? 'editing' : 'idle') }}><RotateCcw size={14} aria-hidden="true" />{source ? '返回设置' : '重新选择'}</button></div>}

      {phase === 'editing' && source && originalUrl && <div className="image-ink-editor">
        <div className="image-ink-visuals">
          <figure><button type="button" className="image-color-key-sampler" aria-label="点击图片取样要移除的背景颜色" style={{ aspectRatio: `${source.previewWidth} / ${source.previewHeight}` }} onPointerDown={sampleImage}><img src={originalUrl} alt="色彩抠图原图预览" draggable={false} />{samplePoint && <i aria-hidden="true" style={{ left: `${samplePoint.x * 100}%`, top: `${samplePoint.y * 100}%`, color: settings.keyColor }} />}</button><figcaption>原图 · 点击背景取样</figcaption></figure>
          <figure><div className="image-ink-transparent-stage">{previewUrl ? <img src={previewUrl} alt="透明色彩抠图结果预览" /> : <span><ImageIcon size={18} aria-hidden="true" /><strong>取样并生成预览</strong><small>棋盘格代表透明区域</small></span>}</div><figcaption>{preview ? `结果 · ${preview.width} × ${preview.height}` : '透明结果待生成'}</figcaption></figure>
        </div>
        <div className="image-ink-controls">
          <div className="image-color-key-choice"><label><span>目标背景色</span><span><input aria-label="目标背景色选择器" type="color" value={settings.keyColor} onChange={(event) => { changeSettings({ keyColor: event.target.value.toUpperCase() }); setSamplePoint(null) }} /><output>{settings.keyColor}</output></span></label><small><Pipette size={12} aria-hidden="true" />优先点击均匀背景区域取样</small></div>
          <label><span>颜色容差 <output>{settings.tolerance}</output></span><input aria-label="色彩抠图颜色容差" type="range" min="0" max="100" value={settings.tolerance} onChange={(event) => changeSettings({ tolerance: Number(event.target.value) })} /></label>
          <label><span>边缘柔化 <output>{settings.feather}</output></span><input aria-label="色彩抠图边缘柔化" type="range" min="0" max="100" value={settings.feather} onChange={(event) => changeSettings({ feather: Number(event.target.value) })} /></label>
          <label><span>边缘溢色中和 <output>{settings.despill}%</output></span><input aria-label="色彩抠图边缘溢色中和" type="range" min="0" max="100" value={settings.despill} onChange={(event) => changeSettings({ despill: Number(event.target.value) })} /></label>
          <dl><div><dt>原图</dt><dd>{source.originalWidth} × {source.originalHeight}</dd></div><div><dt>最高导出</dt><dd>{source.outputWidth} × {source.outputHeight}</dd></div>{preview && <><div><dt>完全移除</dt><dd>{Math.round(preview.removedCoverage * 1000) / 10}%</dd></div><div><dt>半透明边缘</dt><dd>{preview.partialPixels.toLocaleString()} px</dd></div><div><dt>已中和边缘</dt><dd>{preview.despilledPixels.toLocaleString()} px</dd></div></>}</dl>
          <p>使用 OKLab 感知色距全局移除近似颜色，不理解前景或背景。衣服、Logo、反光或主体内与目标色相近的区域也会变透明；“溢色中和”只把受色键影响的半透明边缘向等亮中性色混合，可能使真实彩色细边变灰，不是物理颜色重建或专业绿幕去溢色。它也不等于人物 AI 抠图、隐私删除或真实性验证。</p>
          <div className="image-ink-actions"><button type="button" onClick={() => void createPreview()}><ImageIcon size={14} aria-hidden="true" />{preview ? '重新生成预览' : '生成透明预览'}</button><button type="button" disabled={!preview} onClick={() => void confirmAndExport()}><Download size={14} aria-hidden="true" />确认并导出 PNG</button><button type="button" onClick={() => { setSettings({ ...defaultColorKeySettings }); setSamplePoint(null); setPreview(null) }}><RotateCcw size={14} aria-hidden="true" />重置参数</button><button type="button" onClick={reset}>选择其他图片</button></div>
        </div>
      </div>}
    </section>
  )
}

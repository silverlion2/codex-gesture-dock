import { Download, Frame, ImageIcon, RotateCcw, Sparkles, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  defaultScreenshotBeautifierSettings,
  exportBeautifiedScreenshot,
  prepareScreenshotBeautifierSource,
  renderScreenshotBeautifierPreview,
  type BeautifierAspect,
  type BeautifierBackground,
  type BeautifierFrame,
  type PreparedScreenshotSource,
  type RenderedBeautifiedScreenshot,
  type ScreenshotBeautifierSettings,
} from '../lib/screenshotBeautifier'
import type { ImageOutputFormat } from '../lib/imageOptimizer'

interface ScreenshotBeautifierPanelProps { onMessage: (message: string) => void }
type BeautifierPhase = 'idle' | 'preparing' | 'editing' | 'rendering' | 'exporting' | 'error'

const backgroundOptions: Array<{ value: BeautifierBackground; label: string }> = [
  { value: 'forest', label: '森林' }, { value: 'ocean', label: '海洋' }, { value: 'sunset', label: '日落' },
  { value: 'plum', label: '梅紫' }, { value: 'paper', label: '纸张' }, { value: 'dark', label: '深色' },
]

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function ScreenshotBeautifierPanel({ onMessage }: ScreenshotBeautifierPanelProps) {
  const [phase, setPhase] = useState<BeautifierPhase>('idle')
  const [source, setSource] = useState<PreparedScreenshotSource | null>(null)
  const [settings, setSettings] = useState<ScreenshotBeautifierSettings>({ ...defaultScreenshotBeautifierSettings })
  const [preview, setPreview] = useState<RenderedBeautifiedScreenshot | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [format, setFormat] = useState<ImageOutputFormat>('png')
  const [quality, setQuality] = useState(90)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!preview) { setPreviewUrl(''); return }
    const url = URL.createObjectURL(preview.blob)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [preview])
  useEffect(() => () => abortRef.current?.abort(), [])

  const reset = () => {
    abortRef.current?.abort(); abortRef.current = null
    setPhase('idle'); setSource(null); setSettings({ ...defaultScreenshotBeautifierSettings }); setPreview(null)
    setFormat('png'); setQuality(90); setError('')
  }

  const prepare = async (file: File) => {
    abortRef.current?.abort(); const controller = new AbortController(); abortRef.current = controller
    setPhase('preparing'); setPreview(null); setError('')
    try {
      const prepared = await prepareScreenshotBeautifierSource(file, controller.signal)
      if (controller.signal.aborted) return
      setSource(prepared); setSettings({ ...defaultScreenshotBeautifierSettings }); setPhase('editing')
      onMessage(`截图已在本机准备：${prepared.originalWidth} × ${prepared.originalHeight}`)
    } catch (caught) {
      if (!controller.signal.aborted) { setError(caught instanceof Error ? caught.message : '无法准备截图美化'); setPhase('error') }
    } finally { if (abortRef.current === controller) abortRef.current = null }
  }

  const changeSettings = (next: Partial<ScreenshotBeautifierSettings>) => {
    setSettings((current) => ({ ...current, ...next })); setPreview(null)
  }

  const createPreview = async () => {
    if (!source) return
    abortRef.current?.abort(); const controller = new AbortController(); abortRef.current = controller
    setPhase('rendering'); setError('')
    try {
      const rendered = await renderScreenshotBeautifierPreview(source, settings, controller.signal)
      if (controller.signal.aborted) return
      setPreview(rendered); setPhase('editing')
      onMessage(`美化预览已生成：${rendered.width} × ${rendered.height}；请复核边缘、阴影与文字`)
    } catch (caught) {
      if (controller.signal.aborted) { setPhase('editing'); onMessage('已取消美化预览'); return }
      setError(caught instanceof Error ? caught.message : '生成美化预览失败'); setPhase('error')
    } finally { if (abortRef.current === controller) abortRef.current = null }
  }

  const exportResult = async () => {
    if (!source || !preview) return
    abortRef.current?.abort(); const controller = new AbortController(); abortRef.current = controller
    setPhase('exporting'); setError('')
    try {
      const result = await exportBeautifiedScreenshot(source, settings, format, quality / 100, controller.signal)
      if (controller.signal.aborted) return
      const url = URL.createObjectURL(result.blob); const link = document.createElement('a'); link.href = url; link.download = result.filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1_000)
      setPhase('editing'); onMessage(`已导出 ${result.filename}：${result.width} × ${result.height} · ${formatBytes(result.blob.size)}`)
    } catch (caught) {
      if (controller.signal.aborted) { setPhase('editing'); onMessage('已取消截图导出'); return }
      setError(caught instanceof Error ? caught.message : '导出美化截图失败'); setPhase('error')
    } finally { if (abortRef.current === controller) abortRef.current = null }
  }

  return <section className="screenshot-beautifier-panel" aria-label="本机截图美化">
    {phase === 'idle' && <div className="screenshot-beautifier-empty"><Sparkles size={27} aria-hidden="true" /><strong>把截图包装成可分享图片</strong><small>添加本机渐变背景、留白、圆角、阴影和可选窗口栏；先预览，再明确导出</small><label className="ocr-upload-button"><Upload size={14} aria-hidden="true" />选择截图<input className="sr-only" aria-label="选择待美化截图" type="file" accept="image/png,image/jpeg,image/webp,image/bmp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void prepare(file); event.target.value = '' }} /></label><span>PNG、JPEG、WebP、BMP · 最大 35 MB · 不复制 EXIF/GPS</span></div>}

    {(phase === 'preparing' || phase === 'rendering' || phase === 'exporting') && <div className="screenshot-beautifier-loading" role="status"><span className="small-spinner" aria-hidden="true" /><div><strong>{phase === 'preparing' ? '正在准备有界截图' : phase === 'rendering' ? '正在生成美化预览' : '正在生成完整导出'}</strong><small>像素只在本机内存重新绘制</small></div><button type="button" onClick={() => abortRef.current?.abort()}><X size={14} />取消</button></div>}

    {phase === 'error' && <div className="ocr-error-state" role="alert"><strong>截图美化失败</strong><span>{error}</span><button type="button" onClick={() => { setError(''); setPhase(source ? 'editing' : 'idle') }}><RotateCcw size={14} />{source ? '返回设置' : '重新选择'}</button></div>}

    {phase === 'editing' && source && <div className="screenshot-beautifier-editor">
      <div className={`screenshot-beautifier-stage is-${settings.background}`}>{previewUrl ? <img src={previewUrl} alt="截图美化预览" /> : <div><ImageIcon size={28} aria-hidden="true" /><strong>设置样式后生成预览</strong><span>{source.previewWidth} × {source.previewHeight}</span></div>}</div>
      <div className="screenshot-beautifier-controls">
        <div className="screenshot-beautifier-backgrounds" role="group" aria-label="截图背景">{backgroundOptions.map((option) => <button key={option.value} type="button" className={`is-${option.value}`} aria-pressed={settings.background === option.value} onClick={() => changeSettings({ background: option.value })}>{option.label}</button>)}</div>
        <div className="screenshot-beautifier-pairs"><label><span>画布比例</span><select aria-label="截图美化画布比例" value={settings.aspect} onChange={(event) => changeSettings({ aspect: event.target.value as BeautifierAspect })}><option value="auto">自动</option><option value="square">1:1</option><option value="4:3">4:3</option><option value="16:9">16:9</option></select></label><label><span>顶部样式</span><select aria-label="截图美化顶部样式" value={settings.frame} onChange={(event) => changeSettings({ frame: event.target.value as BeautifierFrame })}><option value="window">窗口栏</option><option value="none">无边框</option></select></label></div>
        {settings.frame === 'window' && <label><span>窗口标题</span><input aria-label="截图美化窗口标题" type="text" maxLength={50} value={settings.title} onChange={(event) => changeSettings({ title: event.target.value })} placeholder="可选，最多 50 字符" /></label>}
        <label><span>留白 <strong>{settings.paddingPercent}%</strong></span><input aria-label="截图美化留白" type="range" min="4" max="24" value={settings.paddingPercent} onChange={(event) => changeSettings({ paddingPercent: Number(event.target.value) })} /></label>
        <label><span>圆角 <strong>{settings.cornerPercent}%</strong></span><input aria-label="截图美化圆角" type="range" min="0" max="8" value={settings.cornerPercent} onChange={(event) => changeSettings({ cornerPercent: Number(event.target.value) })} /></label>
        <label><span>阴影 <strong>{settings.shadow}%</strong></span><input aria-label="截图美化阴影" type="range" min="0" max="100" value={settings.shadow} onChange={(event) => changeSettings({ shadow: Number(event.target.value) })} /></label>
        <div className="screenshot-beautifier-pairs"><label><span>导出格式</span><select aria-label="截图美化导出格式" value={format} onChange={(event) => setFormat(event.target.value as ImageOutputFormat)}><option value="png">PNG</option><option value="jpeg">JPEG</option><option value="webp">WebP</option></select></label><label className={format === 'png' ? 'is-disabled' : ''}><span>品质 {quality}%</span><input aria-label="截图美化导出品质" type="range" min="40" max="100" disabled={format === 'png'} value={quality} onChange={(event) => setQuality(Number(event.target.value))} /></label></div>
        <dl><div><dt>源截图</dt><dd>{source.originalWidth} × {source.originalHeight}</dd></div><div><dt>预览源</dt><dd>{source.previewWidth} × {source.previewHeight}</dd></div>{preview && <div><dt>美化画布</dt><dd>{preview.width} × {preview.height}</dd></div>}</dl>
        <p><Frame size={13} aria-hidden="true" />固定比例只扩展背景，不裁切截图。窗口栏是视觉装饰，不代表原始应用或内容来源。</p>
        <div className="screenshot-beautifier-actions"><button type="button" onClick={() => void createPreview()}><Sparkles size={14} />{preview ? '重新生成预览' : '生成美化预览'}</button><button type="button" disabled={!preview} onClick={() => void exportResult()}><Download size={14} />确认并导出</button><button type="button" onClick={() => { setSettings({ ...defaultScreenshotBeautifierSettings }); setPreview(null) }}><RotateCcw size={13} />重置样式</button><button type="button" onClick={reset}>选择其他截图</button></div>
      </div>
    </div>}
  </section>
}

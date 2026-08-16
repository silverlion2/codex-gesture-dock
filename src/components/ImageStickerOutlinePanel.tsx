import { Download, ImageIcon, RotateCcw, Sparkles, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  defaultStickerOutlineSettings,
  exportStickerOutline,
  prepareStickerSource,
  renderStickerOutlinePreview,
  type PreparedStickerSource,
  type RenderedStickerOutline,
  type StickerOutlineSettings,
} from '../lib/imageStickerOutline'

interface ImageStickerOutlinePanelProps {
  onMessage: (message: string) => void
}

type StickerPhase = 'idle' | 'preparing' | 'editing' | 'rendering' | 'exporting' | 'error'
type Backdrop = 'checker' | 'light' | 'dark'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export function ImageStickerOutlinePanel({ onMessage }: ImageStickerOutlinePanelProps) {
  const [phase, setPhase] = useState<StickerPhase>('idle')
  const [source, setSource] = useState<PreparedStickerSource | null>(null)
  const [originalUrl, setOriginalUrl] = useState('')
  const [preview, setPreview] = useState<RenderedStickerOutline | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [settings, setSettings] = useState<StickerOutlineSettings>({ ...defaultStickerOutlineSettings })
  const [backdrop, setBackdrop] = useState<Backdrop>('checker')
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
    setSettings({ ...defaultStickerOutlineSettings })
    setBackdrop('checker')
    setError('')
  }

  const prepare = async (file: File) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('preparing')
    setPreview(null)
    setError('')
    try {
      const prepared = await prepareStickerSource(file, controller.signal)
      if (controller.signal.aborted) return
      setSource(prepared)
      setSettings({ ...defaultStickerOutlineSettings })
      setBackdrop('checker')
      setPhase('editing')
      onMessage(`透明图已在本机准备：预览 ${prepared.previewWidth} × ${prepared.previewHeight}`)
    } catch (caught) {
      if (controller.signal.aborted) return
      setError(caught instanceof Error ? caught.message : '无法准备透明图描边')
      setPhase('error')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  const changeSettings = (next: Partial<StickerOutlineSettings>) => {
    setSettings((current) => ({ ...current, ...next }))
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
      const rendered = await renderStickerOutlinePreview(source, settings, controller.signal)
      if (controller.signal.aborted) return
      setPreview(rendered)
      setPhase('editing')
      onMessage(`贴纸描边预览已生成：${rendered.width} × ${rendered.height}，描边约 ${rendered.outlineRadius}px`)
    } catch (caught) {
      if (controller.signal.aborted) {
        setPhase('editing')
        onMessage('已取消贴纸描边预览；未写入任何文件')
        return
      }
      setError(caught instanceof Error ? caught.message : '生成贴纸描边预览失败')
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
      const result = await exportStickerOutline(source, settings, controller.signal)
      if (controller.signal.aborted) return
      downloadBlob(result.blob, result.filename)
      setPhase('editing')
      onMessage(`已导出 ${result.filename}：${result.width} × ${result.height} 透明 PNG`)
    } catch (caught) {
      if (controller.signal.aborted) {
        setPhase('editing')
        onMessage('已取消贴纸描边导出；未写入任何文件')
        return
      }
      setError(caught instanceof Error ? caught.message : '导出贴纸描边 PNG 失败')
      setPhase('error')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  return (
    <section className="image-ink-panel image-sticker-panel" aria-label="本机透明图贴纸描边">
      {phase === 'idle' && <div className="image-ink-empty"><Sparkles size={27} aria-hidden="true" /><strong>给透明人物、Logo 或线稿添加贴纸描边</strong><small>先用人物、线稿或色彩抠图生成透明 PNG，再为真实 alpha 边界添加近圆形实色描边</small><label className="ocr-upload-button"><Upload size={14} aria-hidden="true" />选择透明图片<input className="sr-only" aria-label="选择贴纸描边图片" type="file" accept="image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void prepare(file); event.target.value = '' }} /></label><span>透明 PNG 或 WebP · 最大 35 MB · 解码后最大 8000 万像素</span></div>}

      {(phase === 'preparing' || phase === 'rendering' || phase === 'exporting') && <div className="image-ink-loading" role="status" aria-live="polite"><span className="small-spinner" aria-hidden="true" /><div><strong>{phase === 'preparing' ? '正在检查透明边界' : phase === 'rendering' ? '正在分行计算描边距离' : '正在重新生成完整贴纸 PNG'}</strong><small>像素和 alpha 只在本机内存处理</small></div><button type="button" onClick={() => abortRef.current?.abort()}><X size={14} aria-hidden="true" />取消</button></div>}

      {phase === 'error' && <div className="ocr-error-state" role="alert"><strong>透明图描边失败</strong><span>{error}</span><button type="button" onClick={() => { setError(''); setPhase(source ? 'editing' : 'idle') }}><RotateCcw size={14} aria-hidden="true" />{source ? '返回设置' : '重新选择'}</button></div>}

      {phase === 'editing' && source && originalUrl && <div className="image-ink-editor">
        <div className="image-ink-visuals">
          <figure><div className="image-ink-transparent-stage"><img src={originalUrl} alt="贴纸描边透明原图预览" /></div><figcaption>透明原图 · {source.previewWidth} × {source.previewHeight}</figcaption></figure>
          <figure><div className={`image-ink-transparent-stage image-sticker-stage is-${backdrop}`}>{previewUrl ? <img src={previewUrl} alt="贴纸描边结果预览" /> : <span><ImageIcon size={18} aria-hidden="true" /><strong>调整参数后生成预览</strong><small>切换底色检查白边、黑边与断边</small></span>}</div><figcaption>{preview ? `结果 · ${preview.width} × ${preview.height}` : '描边结果待生成'}</figcaption></figure>
        </div>
        <div className="image-ink-controls">
          <label><span>描边宽度 <output>{settings.outlinePercent}% 主体短边</output></span><input aria-label="贴纸描边宽度" type="range" min="1" max="8" value={settings.outlinePercent} onChange={(event) => changeSettings({ outlinePercent: Number(event.target.value) })} /></label>
          <label><span>透明留白 <output>{settings.paddingPercent}% 主体短边</output></span><input aria-label="贴纸透明留白" type="range" min="0" max="8" value={settings.paddingPercent} onChange={(event) => changeSettings({ paddingPercent: Number(event.target.value) })} /></label>
          <div className="image-sticker-color"><label><span>描边颜色</span><span><input aria-label="贴纸描边颜色" type="color" value={settings.color} onChange={(event) => changeSettings({ color: event.target.value.toUpperCase() })} /><output>{settings.color}</output></span></label></div>
          <div className="image-ink-mode" role="group" aria-label="贴纸结果复核底色"><button type="button" aria-pressed={backdrop === 'checker'} onClick={() => setBackdrop('checker')}>棋盘格</button><button type="button" aria-pressed={backdrop === 'light'} onClick={() => setBackdrop('light')}>白底</button><button type="button" aria-pressed={backdrop === 'dark'} onClick={() => setBackdrop('dark')}>黑底</button></div>
          <dl><div><dt>原图</dt><dd>{source.originalWidth} × {source.originalHeight}</dd></div><div><dt>最高工作图</dt><dd>{source.outputWidth} × {source.outputHeight}</dd></div>{preview && <><div><dt>预览描边</dt><dd>{preview.outlineRadius}px</dd></div><div><dt>描边像素</dt><dd>{preview.outlinePixels.toLocaleString()} px</dd></div><div><dt>透明留白</dt><dd>{preview.padding}px</dd></div><div><dt>主体范围</dt><dd>{preview.sourceBounds.width} × {preview.sourceBounds.height}</dd></div></>}</dl>
          <p>只根据源 alpha 生成近圆形栅格描边；不会识别人、物体或 Logo，也不会生成矢量刀模、出血线或印刷尺寸。窄孔和彼此接近的部件可能被描边连接，半透明源边缘保持原 alpha。请在棋盘格、白底和黑底逐一检查后再导出。</p>
          <div className="image-ink-actions"><button type="button" onClick={() => void createPreview()}><ImageIcon size={14} aria-hidden="true" />{preview ? '重新生成预览' : '生成描边预览'}</button><button type="button" disabled={!preview} onClick={() => void confirmAndExport()}><Download size={14} aria-hidden="true" />确认并导出 PNG</button><button type="button" onClick={() => { setSettings({ ...defaultStickerOutlineSettings }); setPreview(null) }}><RotateCcw size={14} aria-hidden="true" />重置参数</button><button type="button" onClick={reset}>选择其他图片</button></div>
        </div>
      </div>}
    </section>
  )
}

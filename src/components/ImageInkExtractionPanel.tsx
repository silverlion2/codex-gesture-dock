import { Download, Eraser, ImageIcon, RotateCcw, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  defaultInkExtractionSettings,
  exportInkExtraction,
  prepareInkExtractionSource,
  renderInkExtractionPreview,
  type InkBackground,
  type InkColorMode,
  type InkExtractionSettings,
  type PreparedInkExtractionSource,
  type RenderedInkExtraction,
} from '../lib/imageInkExtraction'

interface ImageInkExtractionPanelProps {
  onMessage: (message: string) => void
}

type InkPhase = 'idle' | 'preparing' | 'editing' | 'rendering' | 'exporting' | 'error'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export function ImageInkExtractionPanel({ onMessage }: ImageInkExtractionPanelProps) {
  const [phase, setPhase] = useState<InkPhase>('idle')
  const [source, setSource] = useState<PreparedInkExtractionSource | null>(null)
  const [originalUrl, setOriginalUrl] = useState('')
  const [preview, setPreview] = useState<RenderedInkExtraction | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [settings, setSettings] = useState<InkExtractionSettings>({ ...defaultInkExtractionSettings })
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
    setSettings({ ...defaultInkExtractionSettings })
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
      const prepared = await prepareInkExtractionSource(file, controller.signal)
      if (controller.signal.aborted) return
      setSource(prepared)
      setSettings({ ...defaultInkExtractionSettings })
      setPhase('editing')
      onMessage(`线稿图片已在本机准备：预览 ${prepared.previewWidth} × ${prepared.previewHeight}`)
    } catch (caught) {
      if (controller.signal.aborted) return
      setError(caught instanceof Error ? caught.message : '无法准备线稿抠图')
      setPhase('error')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  const changeSettings = (next: Partial<InkExtractionSettings>) => {
    setSettings((current) => ({ ...current, ...next }))
    setPreview(null)
  }

  const changeBackground = (background: InkBackground) => {
    changeSettings({ background, threshold: background === 'light' ? 220 : 35 })
  }

  const createPreview = async () => {
    if (!source) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('rendering')
    setError('')
    try {
      const rendered = await renderInkExtractionPreview(source, settings, controller.signal)
      if (controller.signal.aborted) return
      setPreview(rendered)
      setPhase('editing')
      onMessage(`线稿预览已生成：${rendered.width} × ${rendered.height}，保留 ${Math.round(rendered.coverage * 100)}% 像素`)
    } catch (caught) {
      if (controller.signal.aborted) {
        setPhase('editing')
        onMessage('已取消线稿预览；未写入任何文件')
        return
      }
      setError(caught instanceof Error ? caught.message : '生成线稿预览失败')
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
      const result = await exportInkExtraction(source, settings, controller.signal)
      if (controller.signal.aborted) return
      downloadBlob(result.blob, result.filename)
      setPhase('editing')
      onMessage(`已导出 ${result.filename}：${result.width} × ${result.height} 透明 PNG`)
    } catch (caught) {
      if (controller.signal.aborted) {
        setPhase('editing')
        onMessage('已取消线稿导出；未写入任何文件')
        return
      }
      setError(caught instanceof Error ? caught.message : '导出线稿 PNG 失败')
      setPhase('error')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  return (
    <section className="image-ink-panel" aria-label="本机线稿抠图">
      {phase === 'idle' && <div className="image-ink-empty"><Eraser size={27} aria-hidden="true" /><strong>提取签名、印章或深浅线稿</strong><small>从干净纸张或纯色背景中生成透明 PNG；请先把整页裁到需要的线条区域</small><label className="ocr-upload-button"><Upload size={14} aria-hidden="true" />选择图片<input className="sr-only" aria-label="选择线稿抠图图片" type="file" accept="image/png,image/jpeg,image/webp,image/bmp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void prepare(file); event.target.value = '' }} /></label><span>PNG、JPEG、WebP、BMP · 最大 35 MB · 解码后最大 8000 万像素</span></div>}

      {(phase === 'preparing' || phase === 'rendering' || phase === 'exporting') && <div className="image-ink-loading" role="status" aria-live="polite"><span className="small-spinner" aria-hidden="true" /><div><strong>{phase === 'preparing' ? '正在准备有界图片' : phase === 'rendering' ? '正在分段生成透明预览' : '正在重新生成完整 PNG'}</strong><small>像素只在本机内存处理，不复制源元数据</small></div><button type="button" onClick={() => abortRef.current?.abort()}><X size={14} aria-hidden="true" />取消</button></div>}

      {phase === 'error' && <div className="ocr-error-state" role="alert"><strong>线稿抠图失败</strong><span>{error}</span><button type="button" onClick={() => { setError(''); setPhase(source ? 'editing' : 'idle') }}><RotateCcw size={14} aria-hidden="true" />{source ? '返回设置' : '重新选择'}</button></div>}

      {phase === 'editing' && source && originalUrl && <div className="image-ink-editor">
        <div className="image-ink-visuals">
          <figure><div><img src={originalUrl} alt="线稿抠图原图预览" /></div><figcaption>原图 · {source.previewWidth} × {source.previewHeight}</figcaption></figure>
          <figure><div className="image-ink-transparent-stage">{previewUrl ? <img src={previewUrl} alt="透明线稿结果预览" /> : <span><ImageIcon size={18} aria-hidden="true" /><strong>调整参数后生成预览</strong><small>棋盘格代表透明区域</small></span>}</div><figcaption>{preview ? `结果 · ${preview.width} × ${preview.height}` : '透明结果待生成'}</figcaption></figure>
        </div>
        <div className="image-ink-controls">
          <div className="image-ink-mode" role="group" aria-label="线稿背景模式"><button type="button" aria-pressed={settings.background === 'light'} onClick={() => changeBackground('light')}>浅色纸张 / 深色线</button><button type="button" aria-pressed={settings.background === 'dark'} onClick={() => changeBackground('dark')}>深色背景 / 浅色线</button></div>
          <label><span>亮度阈值 <output>{settings.threshold}</output></span><input aria-label="线稿亮度阈值" type="range" min="0" max="255" value={settings.threshold} onChange={(event) => changeSettings({ threshold: Number(event.target.value) })} /></label>
          <label><span>边缘柔化 <output>{settings.feather}</output></span><input aria-label="线稿边缘柔化" type="range" min="0" max="64" value={settings.feather} onChange={(event) => changeSettings({ feather: Number(event.target.value) })} /></label>
          <div className="image-ink-color-row"><label><span>线条颜色</span><select aria-label="线稿颜色模式" value={settings.colorMode} onChange={(event) => changeSettings({ colorMode: event.target.value as InkColorMode })}><option value="solid">统一颜色</option><option value="original">保留原色</option></select></label><label className={settings.colorMode === 'original' ? 'is-disabled' : ''}><span>统一色</span><input aria-label="线稿统一颜色" type="color" disabled={settings.colorMode === 'original'} value={settings.color} onChange={(event) => changeSettings({ color: event.target.value })} /></label></div>
          <div className="image-ink-trim-row"><label><input type="checkbox" checked={settings.trim} onChange={(event) => changeSettings({ trim: event.target.checked })} />裁去透明外边</label><label className={!settings.trim ? 'is-disabled' : ''}><span>留边</span><input aria-label="线稿透明留边" type="number" min="0" max="128" disabled={!settings.trim} value={settings.padding} onChange={(event) => changeSettings({ padding: Number(event.target.value) })} /></label></div>
          <dl><div><dt>原图</dt><dd>{source.originalWidth} × {source.originalHeight}</dd></div><div><dt>最高导出</dt><dd>{source.outputWidth} × {source.outputHeight}</dd></div>{preview && <><div><dt>保留像素</dt><dd>{Math.round(preview.coverage * 1000) / 10}%</dd></div><div><dt>预览范围</dt><dd>{preview.sourceBounds.x},{preview.sourceBounds.y} · {preview.sourceBounds.width} × {preview.sourceBounds.height}</dd></div></>}</dl>
          <p>只按像素亮度生成透明度，不理解“谁的签名”或线条语义；阴影、纸纹、表格线和正文也可能被保留。请紧密裁剪并检查细笔画、孔洞和边缘。本工具不验证签名真实性、身份、授权或法律效力。</p>
          <div className="image-ink-actions"><button type="button" onClick={() => void createPreview()}><ImageIcon size={14} aria-hidden="true" />{preview ? '重新生成预览' : '生成透明预览'}</button><button type="button" disabled={!preview} onClick={() => void confirmAndExport()}><Download size={14} aria-hidden="true" />确认并导出 PNG</button><button type="button" onClick={() => { setSettings({ ...defaultInkExtractionSettings }); setPreview(null) }}><RotateCcw size={14} aria-hidden="true" />重置参数</button><button type="button" onClick={reset}>选择其他图片</button></div>
        </div>
      </div>}
    </section>
  )
}

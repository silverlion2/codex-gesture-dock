import { Download, ImageIcon, RotateCcw, ShieldAlert, Stamp, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  defaultWatermarkSettings,
  prepareWatermarkBatch,
  renderWatermarkedImage,
  renderWatermarkPreview,
  type PreparedWatermarkBatch,
  type RenderedWatermarkImage,
  type WatermarkPosition,
  type WatermarkSettings,
} from '../lib/imageWatermark'
import type { ImageOutputFormat } from '../lib/imageOptimizer'

interface ImageWatermarkPanelProps {
  onMessage: (message: string) => void
}

type WatermarkPhase = 'idle' | 'preparing' | 'editing' | 'rendering' | 'exporting' | 'error'

const positionOptions: Array<{ value: WatermarkPosition; label: string }> = [
  { value: 'top-left', label: '左上' },
  { value: 'top', label: '上方居中' },
  { value: 'top-right', label: '右上' },
  { value: 'left', label: '左侧居中' },
  { value: 'center', label: '正中' },
  { value: 'right', label: '右侧居中' },
  { value: 'bottom-left', label: '左下' },
  { value: 'bottom', label: '下方居中' },
  { value: 'bottom-right', label: '右下' },
  { value: 'tile', label: '平铺整图' },
]

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function downloadBlob(result: RenderedWatermarkImage) {
  const url = URL.createObjectURL(result.blob)
  const link = document.createElement('a')
  link.href = url
  link.download = result.filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export function ImageWatermarkPanel({ onMessage }: ImageWatermarkPanelProps) {
  const [phase, setPhase] = useState<WatermarkPhase>('idle')
  const [batch, setBatch] = useState<PreparedWatermarkBatch | null>(null)
  const [settings, setSettings] = useState<WatermarkSettings>({ ...defaultWatermarkSettings })
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [originalUrl, setOriginalUrl] = useState('')
  const [preview, setPreview] = useState<RenderedWatermarkImage | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [wipePosition, setWipePosition] = useState(50)
  const [format, setFormat] = useState<ImageOutputFormat>('png')
  const [quality, setQuality] = useState(90)
  const [progress, setProgress] = useState({ completed: 0, total: 0, filename: '' })
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!batch) {
      setOriginalUrl('')
      return
    }
    const url = URL.createObjectURL(batch.firstPreviewBlob)
    setOriginalUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [batch])

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
    setBatch(null)
    setSettings({ ...defaultWatermarkSettings })
    setLogoFile(null)
    setPreview(null)
    setWipePosition(50)
    setFormat('png')
    setQuality(90)
    setProgress({ completed: 0, total: 0, filename: '' })
    setError('')
  }

  const prepare = async (files: File[]) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('preparing')
    setPreview(null)
    setError('')
    try {
      const prepared = await prepareWatermarkBatch(files, controller.signal)
      if (controller.signal.aborted) return
      setBatch(prepared)
      setWipePosition(50)
      setPhase('editing')
      onMessage(`已准备 ${prepared.files.length} 张图片；首图预览 ${prepared.previewWidth} × ${prepared.previewHeight}`)
    } catch (caught) {
      if (controller.signal.aborted) return
      setError(caught instanceof Error ? caught.message : '无法准备图片水印工作区')
      setPhase('error')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  const changeSettings = (next: Partial<WatermarkSettings>) => {
    setSettings((current) => ({ ...current, ...next }))
    setPreview(null)
  }

  const moveFile = (index: number, offset: -1 | 1) => {
    if (!batch) return
    const target = index + offset
    if (target < 0 || target >= batch.files.length) return
    const files = [...batch.files]
    ;[files[index], files[target]] = [files[target], files[index]]
    void prepare(files)
  }

  const removeFile = (index: number) => {
    if (!batch) return
    const files = batch.files.filter((_, itemIndex) => itemIndex !== index)
    if (files.length === 0) reset()
    else void prepare(files)
  }

  const createPreview = async () => {
    if (!batch) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('rendering')
    setError('')
    try {
      const rendered = await renderWatermarkPreview(batch, settings, logoFile, controller.signal)
      if (controller.signal.aborted) return
      setPreview(rendered)
      setWipePosition(50)
      setPhase('editing')
      onMessage(`水印预览已生成：${rendered.width} × ${rendered.height}；请滑动复核`)
    } catch (caught) {
      if (controller.signal.aborted) {
        setPhase('editing')
        onMessage('已取消水印预览；未写入任何文件')
        return
      }
      setError(caught instanceof Error ? caught.message : '生成水印预览失败')
      setPhase('error')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  const exportAll = async () => {
    if (!batch || !preview) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('exporting')
    setError('')
    setProgress({ completed: 0, total: batch.files.length, filename: batch.files[0].name })
    let completed = 0
    try {
      for (const file of batch.files) {
        setProgress({ completed, total: batch.files.length, filename: file.name })
        const result = await renderWatermarkedImage(file, settings, logoFile, format, quality / 100, controller.signal)
        if (controller.signal.aborted) return
        downloadBlob(result)
        completed += 1
        setProgress({ completed, total: batch.files.length, filename: file.name })
      }
      setPhase('editing')
      onMessage(`已请求导出 ${completed} 张加水印图片；浏览器可能要求确认多文件下载`)
    } catch (caught) {
      if (controller.signal.aborted) {
        setPhase('editing')
        onMessage(`已取消批量水印；此前已请求下载 ${completed} 张图片`)
        return
      }
      const reason = caught instanceof Error ? caught.message : '批量水印导出失败'
      setError(completed > 0 ? `${reason}；此前已请求下载 ${completed} 张图片` : reason)
      setPhase('error')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  const canPreview = Boolean(batch) && (settings.mode === 'text' ? settings.text.trim().length > 0 : logoFile)

  return (
    <section className="image-watermark-panel" aria-label="本机批量图片水印">
      {phase === 'idle' && (
        <div className="image-watermark-empty">
          <Stamp size={26} aria-hidden="true" />
          <strong>给一批图片添加可见水印</strong>
          <small>先复核第一张，再按当前设置逐张生成新文件；源图片不会被覆盖</small>
          <label className="ocr-upload-button"><Upload size={14} aria-hidden="true" />选择 1–12 张图片<input className="sr-only" aria-label="选择待加水印图片" type="file" accept="image/png,image/jpeg,image/webp,image/bmp" multiple onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) void prepare(files); event.target.value = '' }} /></label>
          <span>PNG、JPEG、WebP、BMP · 单张 35 MB · 合计 160 MB</span>
        </div>
      )}

      {(phase === 'preparing' || phase === 'rendering' || phase === 'exporting') && (
        <div className="image-watermark-loading" role="status">
          <span className="ocr-spinner" aria-hidden="true" />
          <div><strong>{phase === 'preparing' ? '正在准备首图预览' : phase === 'rendering' ? '正在生成水印预览' : `正在逐张导出 ${progress.completed}/${progress.total}`}</strong><small>{phase === 'exporting' ? progress.filename : '图片像素只在本机内存处理'}</small></div>
          <button type="button" onClick={() => abortRef.current?.abort()}><X size={13} aria-hidden="true" />取消</button>
        </div>
      )}

      {phase === 'error' && (
        <div className="image-watermark-error" role="alert">
          <ShieldAlert size={23} aria-hidden="true" /><strong>水印处理没有完成</strong><span>{error}</span>
          <div><button type="button" onClick={() => setPhase(batch ? 'editing' : 'idle')}>返回修改</button><button type="button" onClick={reset}>重新选择</button></div>
        </div>
      )}

      {batch && phase === 'editing' && (
        <div className="image-watermark-editor">
          <div className="image-watermark-visual">
            <div className="image-watermark-stage" style={{ aspectRatio: `${batch.previewWidth} / ${batch.previewHeight}` }}>
              <img src={originalUrl || undefined} alt="水印原图预览" />
              {previewUrl && <img className="image-watermark-after" src={previewUrl} alt="加水印后预览" style={{ clipPath: `inset(0 ${100 - wipePosition}% 0 0)` }} />}
              {previewUrl && <><span className="is-before">原图</span><span className="is-after">水印后</span><i style={{ left: `${wipePosition}%` }} /></>}
            </div>
            {previewUrl ? <label className="image-watermark-wipe"><span>前后分界 {wipePosition}%</span><input aria-label="图片水印前后分界" type="range" min="0" max="100" value={wipePosition} onChange={(event) => setWipePosition(Number(event.target.value))} /></label> : <div className="image-watermark-preview-hint"><ImageIcon size={16} aria-hidden="true" /><strong>设置水印后生成首图预览</strong><span>{batch.previewWidth} × {batch.previewHeight}</span></div>}
            <ol className="image-watermark-order" aria-label="水印图片顺序">
              {batch.files.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`}><span>{index + 1}</span><strong title={file.name}>{file.name}</strong><small>{formatBytes(file.size)}</small><button type="button" aria-label={`上移 ${file.name}`} disabled={index === 0} onClick={() => moveFile(index, -1)}>↑</button><button type="button" aria-label={`下移 ${file.name}`} disabled={index === batch.files.length - 1} onClick={() => moveFile(index, 1)}>↓</button><button type="button" aria-label={`移除 ${file.name}`} onClick={() => removeFile(index)}>×</button></li>)}
            </ol>
          </div>

          <div className="image-watermark-controls">
            <div className="image-watermark-mode" role="group" aria-label="水印类型"><button type="button" aria-pressed={settings.mode === 'text'} onClick={() => changeSettings({ mode: 'text' })}>文字</button><button type="button" aria-pressed={settings.mode === 'logo'} onClick={() => changeSettings({ mode: 'logo' })}>Logo</button></div>
            {settings.mode === 'text' ? <label><span>水印文字</span><input aria-label="水印文字" type="text" maxLength={80} value={settings.text} onChange={(event) => changeSettings({ text: event.target.value })} /></label> : <div className="image-watermark-logo"><span>Logo 图片</span><span>{logoFile?.name ?? '尚未选择'}</span><label className="ocr-upload-button">选择 Logo<input className="sr-only" aria-label="选择水印 Logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { setLogoFile(event.target.files?.[0] ?? null); setPreview(null); event.target.value = '' }} /></label></div>}
            <label><span>位置</span><select aria-label="水印位置" value={settings.position} onChange={(event) => changeSettings({ position: event.target.value as WatermarkPosition })}>{positionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            {settings.mode === 'text' && <div className="image-watermark-color" role="group" aria-label="水印文字颜色"><button type="button" aria-pressed={settings.color === '#ffffff'} onClick={() => changeSettings({ color: '#ffffff' })}>白字</button><button type="button" aria-pressed={settings.color === '#000000'} onClick={() => changeSettings({ color: '#000000' })}>黑字</button></div>}
            <label><span>不透明度 <strong>{Math.round(settings.opacity * 100)}%</strong></span><input aria-label="水印不透明度" type="range" min="10" max="100" value={Math.round(settings.opacity * 100)} onChange={(event) => changeSettings({ opacity: Number(event.target.value) / 100 })} /></label>
            <label><span>尺寸 <strong>{settings.sizePercent}%</strong></span><input aria-label="水印尺寸" type="range" min="4" max="40" value={settings.sizePercent} onChange={(event) => changeSettings({ sizePercent: Number(event.target.value) })} /></label>
            <label><span>边距 <strong>{settings.marginPercent}%</strong></span><input aria-label="水印边距" type="range" min="0" max="15" value={settings.marginPercent} onChange={(event) => changeSettings({ marginPercent: Number(event.target.value) })} /></label>
            <label><span>旋转 <strong>{settings.rotation}°</strong></span><input aria-label="水印旋转" type="range" min="-45" max="45" value={settings.rotation} onChange={(event) => changeSettings({ rotation: Number(event.target.value) })} /></label>
            <div className="image-watermark-output"><label><span>导出格式</span><select aria-label="水印导出格式" value={format} onChange={(event) => setFormat(event.target.value as ImageOutputFormat)}><option value="png">PNG</option><option value="jpeg">JPEG</option><option value="webp">WebP</option></select></label><label className={format === 'png' ? 'is-disabled' : ''}><span>质量 {quality}%</span><input aria-label="水印导出质量" type="range" min="40" max="100" disabled={format === 'png'} value={quality} onChange={(event) => setQuality(Number(event.target.value))} /></label></div>
            <dl><div><dt>图片</dt><dd>{batch.files.length} 张</dd></div><div><dt>首图原始</dt><dd>{batch.firstOriginalWidth} × {batch.firstOriginalHeight}</dd></div><div><dt>首图预览</dt><dd>{batch.previewWidth} × {batch.previewHeight}</dd></div></dl>
            <p><ShieldAlert size={13} aria-hidden="true" />可见水印可以被裁剪、涂抹或重制，不是不可移除的版权证明或内容来源认证。JPEG 会把透明区域转白。</p>
            <div className="image-watermark-actions"><button type="button" disabled={!canPreview} onClick={() => void createPreview()}><Stamp size={14} aria-hidden="true" />{preview ? '重新生成预览' : '生成首图预览'}</button><button type="button" disabled={!preview} onClick={() => void exportAll()}><Download size={14} aria-hidden="true" />确认并导出 {batch.files.length} 张</button><button type="button" onClick={() => { setSettings({ ...defaultWatermarkSettings }); setLogoFile(null); setPreview(null) }}><RotateCcw size={13} aria-hidden="true" />重置设置</button><button type="button" onClick={reset}>选择其他图片</button></div>
          </div>
        </div>
      )}
    </section>
  )
}

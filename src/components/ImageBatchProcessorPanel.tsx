import { ArrowDown, ArrowUp, Download, Images, RotateCcw, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  batchImageFilename,
  processBatchImage,
  validateImageBatch,
  type BatchRenameMode,
  type ImageBatchOptions,
  type ProcessedBatchImage,
} from '../lib/imageBatchProcessor'
import type { ImageOutputFormat } from '../lib/imageOptimizer'

interface ImageBatchProcessorPanelProps {
  onMessage: (message: string) => void
}

type BatchPhase = 'idle' | 'editing' | 'previewing' | 'exporting' | 'error'

const maxEdgeOptions = [
  { value: 'original', label: '保留原尺寸（受安全上限约束）' },
  { value: '3200', label: '最长边 3200 px' },
  { value: '2048', label: '最长边 2048 px' },
  { value: '1600', label: '最长边 1600 px' },
  { value: '1080', label: '最长边 1080 px' },
  { value: '640', label: '最长边 640 px' },
]

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function downloadResult(result: ProcessedBatchImage) {
  const url = URL.createObjectURL(result.blob)
  const link = document.createElement('a')
  link.href = url
  link.download = result.filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export function ImageBatchProcessorPanel({ onMessage }: ImageBatchProcessorPanelProps) {
  const [phase, setPhase] = useState<BatchPhase>('idle')
  const [files, setFiles] = useState<File[]>([])
  const [format, setFormat] = useState<ImageOutputFormat>('webp')
  const [quality, setQuality] = useState(82)
  const [maxEdge, setMaxEdge] = useState('1600')
  const [renameMode, setRenameMode] = useState<BatchRenameMode>('keep')
  const [prefix, setPrefix] = useState('')
  const [suffix, setSuffix] = useState('-converted')
  const [startNumber, setStartNumber] = useState(1)
  const [preview, setPreview] = useState<ProcessedBatchImage | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [wipePosition, setWipePosition] = useState(50)
  const [progress, setProgress] = useState({ completed: 0, total: 0, filename: '' })
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const options = useMemo<ImageBatchOptions>(() => ({
    format,
    quality: quality / 100,
    maxEdge: maxEdge === 'original' ? null : Number(maxEdge),
    renameMode,
    prefix,
    suffix,
    startNumber,
  }), [format, maxEdge, prefix, quality, renameMode, startNumber, suffix])

  useEffect(() => {
    if (!files[0]) { setSourceUrl(''); return }
    const url = URL.createObjectURL(files[0])
    setSourceUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [files])

  useEffect(() => {
    if (!preview) { setPreviewUrl(''); return }
    const url = URL.createObjectURL(preview.blob)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [preview])

  useEffect(() => () => abortRef.current?.abort(), [])

  const invalidatePreview = () => setPreview(null)

  const reset = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setFiles([])
    setPreview(null)
    setPhase('idle')
    setProgress({ completed: 0, total: 0, filename: '' })
    setError('')
  }

  const selectFiles = (selected: File[]) => {
    try {
      const validated = validateImageBatch(selected)
      setFiles(validated.files)
      setPreview(null)
      setWipePosition(50)
      setError('')
      setPhase('editing')
      onMessage(`已准备 ${validated.files.length} 张图片，共 ${formatBytes(validated.totalBytes)}；尚未生成或写入文件`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法准备批量图片')
      setPhase('error')
    }
  }

  const moveFile = (index: number, offset: -1 | 1) => {
    const target = index + offset
    if (target < 0 || target >= files.length) return
    const next = [...files]
    ;[next[index], next[target]] = [next[target], next[index]]
    setFiles(next)
    invalidatePreview()
  }

  const removeFile = (index: number) => {
    const next = files.filter((_, itemIndex) => itemIndex !== index)
    if (next.length === 0) reset()
    else { setFiles(next); invalidatePreview() }
  }

  const createPreview = async () => {
    if (!files[0]) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('previewing')
    setError('')
    try {
      const result = await processBatchImage(files[0], 0, options, controller.signal)
      if (controller.signal.aborted) return
      setPreview(result)
      setWipePosition(50)
      setPhase('editing')
      onMessage(`首图转换预览已生成：${result.width} × ${result.height}，${formatBytes(result.outputBytes)}`)
    } catch (caught) {
      if (controller.signal.aborted) { setPhase('editing'); onMessage('已取消首图预览'); return }
      setError(caught instanceof Error ? caught.message : '生成首图预览失败')
      setPhase('error')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  const exportAll = async () => {
    if (!preview || files.length === 0) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('exporting')
    setError('')
    let completed = 0
    setProgress({ completed, total: files.length, filename: files[0].name })
    try {
      for (const [index, file] of files.entries()) {
        setProgress({ completed, total: files.length, filename: file.name })
        const result = await processBatchImage(file, index, options, controller.signal)
        if (controller.signal.aborted) return
        downloadResult(result)
        completed += 1
        setProgress({ completed, total: files.length, filename: file.name })
      }
      setPhase('editing')
      onMessage(`已请求导出 ${completed} 张转换图片；浏览器可能要求确认多文件下载`)
    } catch (caught) {
      if (controller.signal.aborted) {
        setPhase('editing')
        onMessage(`已取消批量转换；此前已请求下载 ${completed} 张图片`)
        return
      }
      const reason = caught instanceof Error ? caught.message : '批量转换失败'
      setError(completed ? `${reason}；此前已请求下载 ${completed} 张图片` : reason)
      setPhase('error')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  const changeSetting = (change: () => void) => { change(); invalidatePreview() }

  return (
    <section className="image-batch-panel" aria-label="本机批量图片转换">
      {phase === 'idle' && <div className="image-batch-empty"><Images size={26} aria-hidden="true" /><strong>批量缩放、转换与重命名图片</strong><small>先复核首图，再按列表顺序逐张生成；原图不会被放大、覆盖或上传</small><label className="ocr-upload-button"><Upload size={14} aria-hidden="true" />选择 1–20 张图片<input className="sr-only" aria-label="选择待批量转换图片" type="file" accept="image/png,image/jpeg,image/webp,image/bmp" multiple onChange={(event) => { const selected = Array.from(event.target.files ?? []); if (selected.length) selectFiles(selected); event.target.value = '' }} /></label><span>PNG、JPEG、WebP、BMP · 单张 35 MB · 合计 200 MB</span></div>}

      {(phase === 'previewing' || phase === 'exporting') && <div className="image-batch-loading" role="status"><span className="ocr-spinner" aria-hidden="true" /><div><strong>{phase === 'previewing' ? '正在生成首图转换预览' : `正在逐张转换 ${progress.completed}/${progress.total}`}</strong><small>{phase === 'exporting' ? progress.filename : '像素只在本机内存中重新编码'}</small></div><button type="button" onClick={() => abortRef.current?.abort()}><X size={13} aria-hidden="true" />取消</button></div>}

      {phase === 'error' && <div className="image-batch-error" role="alert"><strong>批量图片处理没有完成</strong><span>{error}</span><div><button type="button" onClick={() => setPhase(files.length ? 'editing' : 'idle')}>返回修改</button><button type="button" onClick={reset}>重新选择</button></div></div>}

      {phase === 'editing' && files.length > 0 && <div className="image-batch-editor">
        <div className="image-batch-visual">
          <div className="image-batch-stage"><img src={sourceUrl || undefined} alt="批量转换原图预览" />{previewUrl && <img className="image-batch-after" src={previewUrl} alt="批量转换后预览" style={{ clipPath: `inset(0 ${100 - wipePosition}% 0 0)` }} />}{previewUrl && <><span className="is-before">原图</span><span className="is-after">转换后</span><i style={{ left: `${wipePosition}%` }} /></>}</div>
          {previewUrl ? <label className="image-batch-wipe"><span>前后分界 {wipePosition}%</span><input aria-label="批量转换前后分界" type="range" min="0" max="100" value={wipePosition} onChange={(event) => setWipePosition(Number(event.target.value))} /></label> : <div className="image-batch-preview-hint"><Images size={15} aria-hidden="true" /><strong>确认设置后生成首图预览</strong></div>}
          <ol className="image-batch-order" aria-label="批量转换图片顺序">{files.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`}><span>{index + 1}</span><strong title={file.name}>{file.name}</strong><small>{batchImageFilename(file.name, index, options)}</small><button type="button" aria-label={`上移 ${file.name}`} disabled={index === 0} onClick={() => moveFile(index, -1)}><ArrowUp size={11} /></button><button type="button" aria-label={`下移 ${file.name}`} disabled={index === files.length - 1} onClick={() => moveFile(index, 1)}><ArrowDown size={11} /></button><button type="button" aria-label={`移除 ${file.name}`} onClick={() => removeFile(index)}>×</button></li>)}</ol>
        </div>

        <div className="image-batch-controls">
          <div className="image-batch-output"><label><span>输出格式</span><select aria-label="批量转换输出格式" value={format} onChange={(event) => changeSetting(() => setFormat(event.target.value as ImageOutputFormat))}><option value="webp">WebP</option><option value="jpeg">JPEG</option><option value="png">PNG</option></select></label><label><span>输出尺寸</span><select aria-label="批量转换输出尺寸" value={maxEdge} onChange={(event) => changeSetting(() => setMaxEdge(event.target.value))}>{maxEdgeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
          <label className={format === 'png' ? 'is-disabled' : ''}><span>质量 <strong>{quality}%</strong></span><input aria-label="批量转换输出质量" type="range" min="40" max="100" disabled={format === 'png'} value={quality} onChange={(event) => changeSetting(() => setQuality(Number(event.target.value)))} /></label>
          <div className="image-batch-rename" role="group" aria-label="批量重命名方式"><button type="button" aria-pressed={renameMode === 'keep'} onClick={() => changeSetting(() => setRenameMode('keep'))}>原名 + 编号</button><button type="button" aria-pressed={renameMode === 'sequence'} onClick={() => changeSetting(() => setRenameMode('sequence'))}>仅编号</button></div>
          <label><span>前缀</span><input aria-label="批量文件名前缀" type="text" maxLength={48} value={prefix} onChange={(event) => changeSetting(() => setPrefix(event.target.value))} /></label>
          <label><span>后缀</span><input aria-label="批量文件名后缀" type="text" maxLength={48} value={suffix} onChange={(event) => changeSetting(() => setSuffix(event.target.value))} /></label>
          <label><span>起始编号</span><input aria-label="批量文件名起始编号" type="number" min="0" max="999999" step="1" value={startNumber} onChange={(event) => changeSetting(() => setStartNumber(Math.max(0, Math.min(999999, Math.round(Number(event.target.value) || 0)))))} /></label>
          <dl><div><dt>图片</dt><dd>{files.length} 张</dd></div><div><dt>首个输出名</dt><dd title={batchImageFilename(files[0].name, 0, options)}>{batchImageFilename(files[0].name, 0, options)}</dd></div>{preview && <div><dt>首图输出</dt><dd>{preview.width} × {preview.height} · {formatBytes(preview.outputBytes)}</dd></div>}</dl>
          <p>重新编码不会复制 EXIF/GPS。JPEG 将透明区域合成白色；PNG 质量滑杆不生效。请放大检查文字、透明边缘和细节。</p>
          <div className="image-batch-actions"><button type="button" onClick={() => void createPreview()}><Images size={14} aria-hidden="true" />{preview ? '重新生成预览' : '生成首图预览'}</button><button type="button" disabled={!preview} onClick={() => void exportAll()}><Download size={14} aria-hidden="true" />确认并导出 {files.length} 张</button><button type="button" onClick={() => { setFormat('webp'); setQuality(82); setMaxEdge('1600'); setRenameMode('keep'); setPrefix(''); setSuffix('-converted'); setStartNumber(1); invalidatePreview() }}><RotateCcw size={13} aria-hidden="true" />重置设置</button><button type="button" onClick={reset}>选择其他图片</button></div>
        </div>
      </div>}
    </section>
  )
}

import { ArrowDown, ArrowUp, Download, ImageIcon, LayoutGrid, RefreshCw, Trash2, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  computeContactSheetLayout,
  CONTACT_SHEET_MAX_FILES,
  renderContactSheet,
  validateContactSheetFiles,
  type ContactSheetAspect,
  type ContactSheetBackground,
  type ContactSheetFit,
  type ContactSheetOptions,
  type ContactSheetSpacing,
  type RenderedContactSheet,
} from '../lib/imageContactSheet'

interface ImageContactSheetPanelProps {
  onMessage: (message: string) => void
}

interface ContactSheetItem {
  id: string
  file: File
  previewUrl: string
}

type ContactSheetPhase = 'idle' | 'editing' | 'rendering' | 'ready' | 'error'

const defaultOptions: ContactSheetOptions = {
  columns: 3,
  width: 1600,
  aspect: 'square',
  fit: 'contain',
  background: 'light',
  spacing: 'regular',
  showLabels: true,
}

const aspectLabels: Record<ContactSheetAspect, string> = { square: '方形 1:1', landscape: '横向 4:3', portrait: '纵向 3:4' }
const fitLabels: Record<ContactSheetFit, string> = { contain: '完整显示', cover: '居中填满' }
const backgroundLabels: Record<ContactSheetBackground, string> = { light: '浅色', dark: '深色' }
const spacingLabels: Record<ContactSheetSpacing, string> = { compact: '紧凑', regular: '标准', wide: '宽松' }

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function ImageContactSheetPanel({ onMessage }: ImageContactSheetPanelProps) {
  const [phase, setPhase] = useState<ContactSheetPhase>('idle')
  const [items, setItems] = useState<ContactSheetItem[]>([])
  const [options, setOptions] = useState<ContactSheetOptions>(defaultOptions)
  const [result, setResult] = useState<RenderedContactSheet | null>(null)
  const [resultUrl, setResultUrl] = useState('')
  const [progress, setProgress] = useState({ completed: 0, total: 0, filename: '' })
  const [error, setError] = useState('')
  const idRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)
  const previewUrlsRef = useRef<string[]>([])

  const layout = useMemo(
    () => items.length >= 2 ? computeContactSheetLayout(items.length, options) : null,
    [items.length, options],
  )
  const totalBytes = useMemo(() => items.reduce((sum, item) => sum + item.file.size, 0), [items])

  useEffect(() => {
    if (!result) {
      setResultUrl('')
      return
    }
    const url = URL.createObjectURL(result.blob)
    setResultUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [result])

  useEffect(() => () => {
    controllerRef.current?.abort()
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  const revokePreviews = () => {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    previewUrlsRef.current = []
  }

  const chooseFiles = (files: File[]) => {
    try {
      validateContactSheetFiles(files)
      controllerRef.current?.abort()
      revokePreviews()
      const nextItems = files.map((file) => {
        const previewUrl = URL.createObjectURL(file)
        previewUrlsRef.current.push(previewUrl)
        return { id: `contact-sheet-${++idRef.current}`, file, previewUrl }
      })
      setItems(nextItems)
      setResult(null)
      setProgress({ completed: 0, total: files.length, filename: '' })
      setError('')
      setPhase('editing')
      onMessage(`已载入 ${files.length} 张本机图片；可调整顺序与联系表布局`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法读取联系表图片')
      setPhase('error')
    }
  }

  const updateOptions = (next: Partial<ContactSheetOptions>) => {
    setOptions((current) => ({ ...current, ...next }))
    setResult(null)
  }

  const moveItem = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= items.length) return
    setItems((current) => {
      const next = [...current]
      const moved = next[index]
      next[index] = next[target]
      next[target] = moved
      return next
    })
    setResult(null)
  }

  const removeItem = (id: string) => {
    if (items.length <= 2) {
      onMessage('联系表至少需要保留 2 张图片')
      return
    }
    const item = items.find((entry) => entry.id === id)
    if (item) {
      URL.revokeObjectURL(item.previewUrl)
      previewUrlsRef.current = previewUrlsRef.current.filter((url) => url !== item.previewUrl)
    }
    setItems((current) => current.filter((entry) => entry.id !== id))
    setResult(null)
  }

  const createPreview = async () => {
    if (items.length < 2) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setPhase('rendering')
    setError('')
    setProgress({ completed: 0, total: items.length, filename: items[0].file.name })
    try {
      const next = await renderContactSheet(items.map(({ file }) => file), options, {
        signal: controller.signal,
        onProgress: (completed, total, filename) => setProgress({ completed, total, filename }),
      })
      if (controller.signal.aborted) return
      setResult(next)
      setPhase('ready')
      onMessage(`联系表预览已生成：${next.imageCount} 张 · ${next.width} × ${next.height}`)
    } catch (caught) {
      if (controller.signal.aborted) {
        setPhase('editing')
        onMessage('已取消联系表生成；未写入任何文件')
        return
      }
      setError(caught instanceof Error ? caught.message : '生成联系表失败')
      setPhase('error')
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }

  const download = () => {
    if (!result || !resultUrl) return
    const link = document.createElement('a')
    link.href = resultUrl
    link.download = result.filename
    link.click()
    onMessage(`已导出 ${result.filename}；${result.imageCount} 张图片已扁平写入新 PNG`)
  }

  const reset = () => {
    controllerRef.current?.abort()
    controllerRef.current = null
    revokePreviews()
    setItems([])
    setOptions(defaultOptions)
    setResult(null)
    setProgress({ completed: 0, total: 0, filename: '' })
    setError('')
    setPhase('idle')
  }

  return (
    <section className="image-contact-sheet-panel" aria-label="本机图片联系表">
      {phase === 'idle' && (
        <div className="image-contact-sheet-empty">
          <LayoutGrid size={27} aria-hidden="true" />
          <strong>把一组图片排成可复核联系表</strong>
          <small>按选择顺序生成固定网格，可显示文件名；图片只在本机逐张解码</small>
          <label className="ocr-upload-button"><Upload size={14} aria-hidden="true" />选择 2–{CONTACT_SHEET_MAX_FILES} 张图片<input className="sr-only" aria-label="选择联系表图片" type="file" multiple accept="image/png,image/jpeg,image/webp,image/bmp" onChange={(event) => { chooseFiles([...event.target.files ?? []]); event.target.value = '' }} /></label>
          <span>单张最大 35 MB · 合计最大 200 MB · 导出扁平 PNG</span>
        </div>
      )}

      {phase === 'rendering' && (
        <div className="image-contact-sheet-loading" role="status" aria-live="polite">
          <span className="small-spinner" aria-hidden="true" />
          <div><strong>正在逐张绘制 {progress.completed} / {progress.total}</strong><small title={progress.filename}>{progress.filename}</small></div>
          <button type="button" onClick={() => controllerRef.current?.abort()}><X size={14} aria-hidden="true" />取消</button>
        </div>
      )}

      {phase === 'error' && (
        <div className="ocr-error-state" role="alert"><strong>联系表生成失败</strong><span>{error}</span><button type="button" onClick={() => { setError(''); setPhase(items.length >= 2 ? 'editing' : 'idle') }}><RefreshCw size={14} aria-hidden="true" />{items.length >= 2 ? '返回设置' : '重新选择'}</button></div>
      )}

      {phase === 'editing' && layout && (
        <div className="image-contact-sheet-editor">
          <div className={`image-contact-sheet-grid-preview is-${options.background}`} style={{ gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))` }} aria-label={`联系表顺序预览，共 ${items.length} 张`}>
            {items.map((item, index) => (
              <figure key={item.id} style={{ aspectRatio: options.aspect === 'square' ? '1' : options.aspect === 'landscape' ? '4 / 3' : '3 / 4' }}>
                <img src={item.previewUrl} alt={`${item.file.name} 联系表预览`} style={{ objectFit: options.fit }} />
                <figcaption hidden={!options.showLabels}><span>{index + 1}</span><strong title={item.file.name}>{item.file.name}</strong></figcaption>
              </figure>
            ))}
          </div>

          <div className="image-contact-sheet-controls">
            <div className="image-contact-sheet-options">
              <label><span>列数</span><select aria-label="联系表列数" value={options.columns} onChange={(event) => updateOptions({ columns: Number(event.target.value) })}>{[2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} 列</option>)}</select></label>
              <label><span>输出宽度</span><select aria-label="联系表输出宽度" value={options.width} onChange={(event) => updateOptions({ width: Number(event.target.value) })}>{[1200, 1600, 2048, 3200].map((value) => <option key={value} value={value}>{value} px</option>)}</select></label>
              <label><span>单格比例</span><select aria-label="联系表单格比例" value={options.aspect} onChange={(event) => updateOptions({ aspect: event.target.value as ContactSheetAspect })}>{Object.entries(aspectLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label><span>图片适配</span><select aria-label="联系表图片适配" value={options.fit} onChange={(event) => updateOptions({ fit: event.target.value as ContactSheetFit })}>{Object.entries(fitLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label><span>背景</span><select aria-label="联系表背景" value={options.background} onChange={(event) => updateOptions({ background: event.target.value as ContactSheetBackground })}>{Object.entries(backgroundLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label><span>间距</span><select aria-label="联系表间距" value={options.spacing} onChange={(event) => updateOptions({ spacing: event.target.value as ContactSheetSpacing })}>{Object.entries(spacingLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            </div>
            <label className="image-contact-sheet-label-toggle"><input type="checkbox" checked={options.showLabels} onChange={(event) => updateOptions({ showLabels: event.target.checked })} /><span>在每格下方显示序号与文件名</span></label>

            <div className="image-contact-sheet-order" aria-label="联系表图片顺序">
              {items.map((item, index) => (
                <div key={item.id}>
                  <span>{index + 1}</span>
                  <img src={item.previewUrl} alt="" />
                  <strong title={item.file.name}>{item.file.name}</strong>
                  <small>{formatBytes(item.file.size)}</small>
                  <button type="button" aria-label={`上移 ${item.file.name}`} disabled={index === 0} onClick={() => moveItem(index, -1)}><ArrowUp size={12} aria-hidden="true" /></button>
                  <button type="button" aria-label={`下移 ${item.file.name}`} disabled={index === items.length - 1} onClick={() => moveItem(index, 1)}><ArrowDown size={12} aria-hidden="true" /></button>
                  <button type="button" aria-label={`移除 ${item.file.name}`} disabled={items.length <= 2} onClick={() => removeItem(item.id)}><Trash2 size={12} aria-hidden="true" /></button>
                </div>
              ))}
            </div>

            <dl><div><dt>图片</dt><dd>{items.length} 张 · {formatBytes(totalBytes)}</dd></div><div><dt>网格</dt><dd>{layout.columns} 列 × {layout.rows} 行</dd></div><div><dt>输出</dt><dd>{layout.width} × {layout.height}</dd></div><div><dt>安全缩放</dt><dd>{layout.scale < 1 ? `${Math.round(layout.scale * 100)}%` : '100%'}</dd></div></dl>
            <p>{options.fit === 'cover' ? '“居中填满”会裁掉图片边缘；请在导出前逐格检查主体是否完整。' : '“完整显示”不会裁切图片，但不同宽高比会留下背景留白。'} 输出 PNG 不复制源图片元数据。</p>
            <div className="image-contact-sheet-actions"><button type="button" onClick={() => void createPreview()}><ImageIcon size={14} aria-hidden="true" />生成联系表预览</button><label><Upload size={13} aria-hidden="true" />重新选择<input className="sr-only" aria-label="重新选择联系表图片" type="file" multiple accept="image/png,image/jpeg,image/webp,image/bmp" onChange={(event) => { chooseFiles([...event.target.files ?? []]); event.target.value = '' }} /></label><button type="button" onClick={reset}>清空</button></div>
          </div>
        </div>
      )}

      {phase === 'ready' && result && resultUrl && (
        <div className="image-contact-sheet-result">
          <div className={`image-contact-sheet-result-preview is-${options.background}`}><img src={resultUrl} alt="联系表结果预览" /></div>
          <div className="image-contact-sheet-result-details">
            <LayoutGrid size={22} aria-hidden="true" />
            <strong>{result.width} × {result.height}</strong>
            <span>{result.imageCount} 张 · PNG · {formatBytes(result.blob.size)}</span>
            <p>请放大确认顺序、裁切、文件名与主体。导出会新建扁平 PNG；不会改写任何源图片，也不会保存可编辑工程。</p>
            <div className="image-contact-sheet-actions"><button type="button" onClick={download}><Download size={14} aria-hidden="true" />确认并导出</button><button type="button" onClick={() => { setResult(null); setPhase('editing') }}><RefreshCw size={14} aria-hidden="true" />返回调整</button><button type="button" onClick={reset}>选择其他图片</button></div>
          </div>
        </div>
      )}
    </section>
  )
}

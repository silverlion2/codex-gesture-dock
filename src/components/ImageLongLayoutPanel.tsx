import { ArrowDown, ArrowUp, Download, ImageIcon, RotateCcw, Search, Trash2, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  LONG_IMAGE_MAX_JOIN_FILES,
  analyzeLongImageOverlaps,
  renderLongImageJoin,
  renderLongImageSplit,
  validateLongImageJoinFiles,
  validateLongImageSplitFile,
  type LongImageBackground,
  type LongImageDirection,
  type LongImageJoinOptions,
  type LongImageOverlapSuggestion,
  type RenderedLongImageJoin,
  type RenderedLongImageSplit,
} from '../lib/imageLongLayout'

interface ImageLongLayoutPanelProps {
  onMessage: (message: string) => void
}

interface JoinItem {
  id: string
  file: File
  previewUrl: string
  trimPercent: number
  overlapSuggestion?: LongImageOverlapSuggestion
}

type LongImageMode = 'join' | 'split'
type LongImagePhase = 'idle' | 'editing' | 'detecting' | 'rendering' | 'ready' | 'error'

const defaultJoinOptions: LongImageJoinOptions = { direction: 'vertical', gap: 0, background: 'light' }
const trimOptions = Array.from({ length: 51 }, (_, value) => value)

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function triggerDownload(url: string, filename: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
}

export function ImageLongLayoutPanel({ onMessage }: ImageLongLayoutPanelProps) {
  const [mode, setMode] = useState<LongImageMode>('join')
  const [phase, setPhase] = useState<LongImagePhase>('idle')
  const [joinItems, setJoinItems] = useState<JoinItem[]>([])
  const [splitFile, setSplitFile] = useState<File | null>(null)
  const [splitPreviewUrl, setSplitPreviewUrl] = useState('')
  const [joinOptions, setJoinOptions] = useState<LongImageJoinOptions>(defaultJoinOptions)
  const [splitDirection, setSplitDirection] = useState<LongImageDirection>('vertical')
  const [splitCount, setSplitCount] = useState(3)
  const [joinResult, setJoinResult] = useState<RenderedLongImageJoin | null>(null)
  const [splitResult, setSplitResult] = useState<RenderedLongImageSplit | null>(null)
  const [resultUrls, setResultUrls] = useState<string[]>([])
  const [progress, setProgress] = useState({ completed: 0, total: 0, filename: '' })
  const [error, setError] = useState('')
  const idRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const previewUrlsRef = useRef<string[]>([])

  useEffect(() => {
    const blobs = joinResult ? [joinResult.blob] : splitResult?.parts.map((part) => part.blob) ?? []
    const urls = blobs.map((blob) => URL.createObjectURL(blob))
    setResultUrls(urls)
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [joinResult, splitResult])

  useEffect(() => () => {
    abortRef.current?.abort()
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  const revokePreviews = () => {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    previewUrlsRef.current = []
  }

  const clearResults = () => {
    setJoinResult(null)
    setSplitResult(null)
  }

  const clearAutomaticSuggestions = (items: JoinItem[]) => items.map((item, index) => ({
    ...item,
    trimPercent: index === 0 ? 0 : item.overlapSuggestion?.status === 'accepted' ? 0 : item.trimPercent,
    overlapSuggestion: undefined,
  }))

  const reset = (nextMode = mode) => {
    abortRef.current?.abort()
    abortRef.current = null
    revokePreviews()
    setMode(nextMode)
    setPhase('idle')
    setJoinItems([])
    setSplitFile(null)
    setSplitPreviewUrl('')
    setJoinOptions(defaultJoinOptions)
    setSplitDirection('vertical')
    setSplitCount(3)
    clearResults()
    setProgress({ completed: 0, total: 0, filename: '' })
    setError('')
  }

  const changeMode = (nextMode: LongImageMode) => {
    if (nextMode === mode) return
    reset(nextMode)
  }

  const chooseJoinFiles = (files: File[]) => {
    try {
      validateLongImageJoinFiles(files)
      abortRef.current?.abort()
      revokePreviews()
      const items = files.map((file) => {
        const previewUrl = URL.createObjectURL(file)
        previewUrlsRef.current.push(previewUrl)
        return { id: `long-image-${++idRef.current}`, file, previewUrl, trimPercent: 0 }
      })
      setJoinItems(items)
      clearResults()
      setError('')
      setPhase('editing')
      onMessage(`已载入 ${items.length} 张本机图片；请确认顺序与接缝裁去比例`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法读取长图拼接图片')
      setPhase('error')
    }
  }

  const chooseSplitFile = (file: File | null) => {
    if (!file) return
    try {
      validateLongImageSplitFile(file)
      abortRef.current?.abort()
      revokePreviews()
      const previewUrl = URL.createObjectURL(file)
      previewUrlsRef.current.push(previewUrl)
      setSplitFile(file)
      setSplitPreviewUrl(previewUrl)
      clearResults()
      setError('')
      setPhase('editing')
      onMessage('长图已在本机载入；请确认拆分方向与份数')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法读取待拆分长图')
      setPhase('error')
    }
  }

  const moveJoinItem = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= joinItems.length) return
    setJoinItems((current) => {
      const next = [...current]
      const moved = next[index]
      next[index] = next[target]
      next[target] = moved
      return clearAutomaticSuggestions(next)
    })
    clearResults()
  }

  const removeJoinItem = (id: string) => {
    if (joinItems.length <= 2) return
    const removed = joinItems.find((item) => item.id === id)
    if (removed) {
      URL.revokeObjectURL(removed.previewUrl)
      previewUrlsRef.current = previewUrlsRef.current.filter((url) => url !== removed.previewUrl)
    }
    setJoinItems((current) => clearAutomaticSuggestions(current.filter((item) => item.id !== id)))
    clearResults()
  }

  const updateTrim = (id: string, trimPercent: number) => {
    setJoinItems((current) => current.map((item, index) => item.id === id ? { ...item, trimPercent: index === 0 ? 0 : trimPercent, overlapSuggestion: undefined } : item))
    clearResults()
  }

  const detectOverlaps = async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setProgress({ completed: 0, total: joinItems.length, filename: joinItems[0]?.file.name ?? '' })
    setPhase('detecting')
    setError('')
    try {
      const analysis = await analyzeLongImageOverlaps(joinItems.map((item) => item.file), joinOptions.direction, {
        signal: controller.signal,
        onProgress: (completed, total, filename) => setProgress({ completed, total, filename }),
      })
      if (controller.signal.aborted) return
      setJoinItems((current) => current.map((item, index) => {
        if (index === 0) return { ...item, trimPercent: 0, overlapSuggestion: undefined }
        const suggestion = analysis.suggestions[index - 1]
        return { ...item, trimPercent: suggestion.status === 'accepted' ? suggestion.overlapPercent : item.trimPercent, overlapSuggestion: suggestion }
      }))
      clearResults()
      setPhase('editing')
      const uncertain = analysis.suggestions.length - analysis.acceptedCount
      onMessage(uncertain === 0
        ? `已自动应用 ${analysis.acceptedCount} 个高置信度接缝；仍请生成预览复核`
        : `已应用 ${analysis.acceptedCount} 个高置信度接缝；${uncertain} 个低置信度接缝保持原设置`)
    } catch (caught) {
      if (controller.signal.aborted) {
        setPhase('editing')
        onMessage('已取消自动重叠检测；未更改接缝设置')
        return
      }
      setError(caught instanceof Error ? caught.message : '自动重叠检测失败')
      setPhase('error')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  const startRender = async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const total = mode === 'join' ? joinItems.length : splitCount
    setProgress({ completed: 0, total, filename: mode === 'join' ? joinItems[0]?.file.name ?? '' : splitFile?.name ?? '' })
    setPhase('rendering')
    setError('')
    try {
      if (mode === 'join') {
        const result = await renderLongImageJoin(
          joinItems.map((item) => item.file),
          joinItems.map((item) => item.trimPercent),
          joinOptions,
          { signal: controller.signal, onProgress: (completed, nextTotal, filename) => setProgress({ completed, total: nextTotal, filename }) },
        )
        if (controller.signal.aborted) return
        setJoinResult(result)
        setSplitResult(null)
        onMessage(`长图预览已生成：${result.imageCount} 张 · ${result.width} × ${result.height}`)
      } else {
        if (!splitFile) return
        const result = await renderLongImageSplit(splitFile, splitDirection, splitCount, {
          signal: controller.signal,
          onProgress: (completed, nextTotal, filename) => setProgress({ completed, total: nextTotal, filename }),
        })
        if (controller.signal.aborted) return
        setSplitResult(result)
        setJoinResult(null)
        onMessage(`长图已拆为 ${result.parts.length} 个本机 PNG 预览`)
      }
      setPhase('ready')
    } catch (caught) {
      if (controller.signal.aborted) {
        setPhase('editing')
        onMessage('已取消长图处理；未写入任何文件')
        return
      }
      setError(caught instanceof Error ? caught.message : '长图处理失败')
      setPhase('error')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  const downloadJoin = () => {
    if (!joinResult || !resultUrls[0]) return
    triggerDownload(resultUrls[0], joinResult.filename)
    onMessage(`已导出 ${joinResult.filename}；源图片未被修改`)
  }

  const downloadSplitPart = (index: number) => {
    const part = splitResult?.parts[index]
    const url = resultUrls[index]
    if (!part || !url) return
    triggerDownload(url, part.filename)
    onMessage(`已导出 ${part.filename}；源图片未被修改`)
  }

  const downloadAllSplitParts = () => {
    if (!splitResult || resultUrls.length !== splitResult.parts.length) return
    splitResult.parts.forEach((part, index) => triggerDownload(resultUrls[index], part.filename))
    onMessage(`已请求导出全部 ${splitResult.parts.length} 个 PNG；浏览器可能询问是否允许多文件下载`)
  }

  const returnToEditing = () => {
    clearResults()
    setPhase('editing')
  }

  return (
    <section className="image-long-layout-panel" aria-label="本机长图拼接与拆分">
      <div className="image-long-layout-mode-tabs" role="group" aria-label="长图处理模式">
        <button type="button" aria-pressed={mode === 'join'} onClick={() => changeMode('join')}>拼接长图</button>
        <button type="button" aria-pressed={mode === 'split'} onClick={() => changeMode('split')}>拆分长图</button>
      </div>

      {phase === 'idle' && mode === 'join' && (
        <div className="image-long-layout-empty">
          <ImageIcon size={27} aria-hidden="true" />
          <strong>按顺序拼成一张纵向或横向长图</strong>
          <small>统一到最小宽度或高度，不放大小图；可手动裁去后续图片的重叠开头</small>
          <label className="ocr-upload-button"><Upload size={14} aria-hidden="true" />选择 2–{LONG_IMAGE_MAX_JOIN_FILES} 张图片<input className="sr-only" aria-label="选择长图拼接图片" type="file" multiple accept="image/png,image/jpeg,image/webp,image/bmp" onChange={(event) => { chooseJoinFiles([...event.target.files ?? []]); event.target.value = '' }} /></label>
          <span>单张最大 35 MB · 合计最大 160 MB · 导出扁平 PNG</span>
        </div>
      )}

      {phase === 'idle' && mode === 'split' && (
        <div className="image-long-layout-empty">
          <ImageIcon size={27} aria-hidden="true" />
          <strong>把一张长图等分成多个独立 PNG</strong>
          <small>按纵向或横向连续切片，不丢失、不重复源像素；每一份都可单独复核与导出</small>
          <label className="ocr-upload-button"><Upload size={14} aria-hidden="true" />选择一张长图<input className="sr-only" aria-label="选择待拆分长图" type="file" accept="image/png,image/jpeg,image/webp,image/bmp" onChange={(event) => { chooseSplitFile(event.target.files?.[0] ?? null); event.target.value = '' }} /></label>
          <span>最大 35 MB · 2–12 份 · 输出重新编码且不复制元数据</span>
        </div>
      )}

      {(phase === 'detecting' || phase === 'rendering') && (
        <div className="image-long-layout-loading" role="status" aria-live="polite">
          <span className="small-spinner" aria-hidden="true" />
          <div><strong>{phase === 'detecting' ? '正在本机分析滚动重叠' : mode === 'join' ? '正在逐张绘制长图' : '正在逐份生成拆分图片'} {progress.completed} / {progress.total}</strong><small title={progress.filename}>{progress.filename}</small></div>
          <button type="button" onClick={() => abortRef.current?.abort()}><X size={14} aria-hidden="true" />取消</button>
        </div>
      )}

      {phase === 'error' && (
        <div className="ocr-error-state" role="alert"><strong>长图处理失败</strong><span>{error}</span><button type="button" onClick={() => { setError(''); setPhase(joinItems.length >= 2 || splitFile ? 'editing' : 'idle') }}><RotateCcw size={14} aria-hidden="true" />{joinItems.length >= 2 || splitFile ? '返回设置' : '重新选择'}</button></div>
      )}

      {phase === 'editing' && mode === 'join' && (
        <div className="image-long-layout-editor">
          <div className={`image-long-join-preview is-${joinOptions.direction} is-${joinOptions.background}`} style={{ gap: `${Math.max(2, joinOptions.gap / 2)}px` }} aria-label={`长图拼接顺序预览，共 ${joinItems.length} 张`}>
            {joinItems.map((item, index) => <figure key={item.id}><img src={item.previewUrl} alt={`${item.file.name} 长图拼接预览`} /><figcaption><span>{index + 1}</span><strong title={item.file.name}>{item.file.name}</strong>{index > 0 && item.trimPercent > 0 ? <small>裁去开头 {item.trimPercent}%</small> : null}</figcaption></figure>)}
          </div>
          <div className="image-long-layout-controls">
            <div className="image-long-layout-options">
              <label><span>拼接方向</span><select aria-label="长图拼接方向" value={joinOptions.direction} onChange={(event) => { setJoinOptions((current) => ({ ...current, direction: event.target.value as LongImageDirection })); setJoinItems((current) => clearAutomaticSuggestions(current)); clearResults() }}><option value="vertical">纵向向下</option><option value="horizontal">横向向右</option></select></label>
              <label><span>图片间距</span><select aria-label="长图拼接间距" value={joinOptions.gap} onChange={(event) => { setJoinOptions((current) => ({ ...current, gap: Number(event.target.value) as 0 | 8 | 24 })); clearResults() }}><option value="0">无间距</option><option value="8">8 px</option><option value="24">24 px</option></select></label>
              <label><span>间距背景</span><select aria-label="长图拼接背景" value={joinOptions.background} onChange={(event) => { setJoinOptions((current) => ({ ...current, background: event.target.value as LongImageBackground })); clearResults() }}><option value="light">白色</option><option value="dark">深色</option><option value="transparent">透明</option></select></label>
            </div>
            <div className="image-long-layout-order" aria-label="长图拼接图片顺序">
              {joinItems.map((item, index) => (
                <div key={item.id}>
                  <span>{index + 1}</span><img src={item.previewUrl} alt="" /><strong title={item.file.name}>{item.file.name}</strong><small className={item.overlapSuggestion ? `is-${item.overlapSuggestion.status}` : ''} title={item.overlapSuggestion ? `匹配 ${Math.round(item.overlapSuggestion.score * 100)}%，置信度 ${Math.round(item.overlapSuggestion.confidence * 100)}%` : undefined}>{index > 0 && item.overlapSuggestion ? item.overlapSuggestion.status === 'accepted' ? `自动 ${item.overlapSuggestion.overlapPercent}% · ${Math.round(item.overlapSuggestion.confidence * 100)}%` : item.overlapSuggestion.status === 'low-texture' ? '纹理不足 · 手动' : item.overlapSuggestion.status === 'ambiguous' ? '接缝歧义 · 手动' : '未匹配 · 手动' : formatBytes(item.file.size)}</small>
                  <label><span className="sr-only">裁去 {item.file.name} 开头</span><select aria-label={`裁去 ${item.file.name} 开头`} disabled={index === 0} value={index === 0 ? 0 : item.trimPercent} onChange={(event) => updateTrim(item.id, Number(event.target.value))}>{trimOptions.map((value) => <option key={value} value={value}>{value === 0 ? '不裁去' : `裁去 ${value}%`}</option>)}</select></label>
                  <button type="button" aria-label={`上移 ${item.file.name}`} disabled={index === 0} onClick={() => moveJoinItem(index, -1)}><ArrowUp size={12} aria-hidden="true" /></button>
                  <button type="button" aria-label={`下移 ${item.file.name}`} disabled={index === joinItems.length - 1} onClick={() => moveJoinItem(index, 1)}><ArrowDown size={12} aria-hidden="true" /></button>
                  <button type="button" aria-label={`移除 ${item.file.name}`} disabled={joinItems.length <= 2} onClick={() => removeJoinItem(item.id)}><Trash2 size={12} aria-hidden="true" /></button>
                </div>
              ))}
            </div>
            {joinItems.some((item) => item.overlapSuggestion) && <div className="image-long-overlap-summary" role="status"><Search size={13} aria-hidden="true" /><strong>自动检测：{joinItems.filter((item) => item.overlapSuggestion?.status === 'accepted').length} 个已应用</strong><span>{joinItems.filter((item) => item.overlapSuggestion && item.overlapSuggestion.status !== 'accepted').length} 个需手动复核</span></div>}
            <p>第一张保留完整；“裁去开头”只移除后续图片顶部或左侧的重叠区域。生成结果会自动限制到最长边 8192 像素及 2400 万像素。</p>
            <div className="image-long-layout-actions"><button type="button" onClick={() => void detectOverlaps()}><Search size={14} aria-hidden="true" />自动检测重叠</button><button type="button" onClick={() => void startRender()}><ImageIcon size={14} aria-hidden="true" />生成长图预览</button><label><Upload size={13} aria-hidden="true" />重新选择<input className="sr-only" aria-label="重新选择长图拼接图片" type="file" multiple accept="image/png,image/jpeg,image/webp,image/bmp" onChange={(event) => { chooseJoinFiles([...event.target.files ?? []]); event.target.value = '' }} /></label><button type="button" onClick={() => reset()}>清空</button></div>
          </div>
        </div>
      )}

      {phase === 'editing' && mode === 'split' && splitFile && splitPreviewUrl && (
        <div className="image-long-layout-editor">
          <div className={`image-long-split-preview is-${splitDirection}`} aria-label={`长图拆分预览，共 ${splitCount} 份`}>
            <img src={splitPreviewUrl} alt={`${splitFile.name} 拆分预览`} />
            <div style={splitDirection === 'vertical' ? { gridTemplateRows: `repeat(${splitCount}, minmax(0, 1fr))` } : { gridTemplateColumns: `repeat(${splitCount}, minmax(0, 1fr))` }}>{Array.from({ length: splitCount }, (_, index) => <span key={index}>{index + 1}</span>)}</div>
          </div>
          <div className="image-long-layout-controls">
            <div className="image-long-layout-options">
              <label><span>拆分方向</span><select aria-label="长图拆分方向" value={splitDirection} onChange={(event) => { setSplitDirection(event.target.value as LongImageDirection); clearResults() }}><option value="vertical">纵向切片</option><option value="horizontal">横向切片</option></select></label>
              <label><span>拆分份数</span><select aria-label="长图拆分份数" value={splitCount} onChange={(event) => { setSplitCount(Number(event.target.value)); clearResults() }}>{Array.from({ length: 11 }, (_, index) => index + 2).map((value) => <option key={value} value={value}>{value} 份</option>)}</select></label>
            </div>
            <dl><div><dt>源文件</dt><dd title={splitFile.name}>{splitFile.name}</dd></div><div><dt>体积</dt><dd>{formatBytes(splitFile.size)}</dd></div><div><dt>输出</dt><dd>{splitCount} 个独立 PNG</dd></div></dl>
            <p>切片边界连续，不会重复或跳过源像素。极大图片会按每一份的 8192 像素/2400 万像素预算等比缩小；输出不复制 EXIF 或 GPS。</p>
            <div className="image-long-layout-actions"><button type="button" onClick={() => void startRender()}><ImageIcon size={14} aria-hidden="true" />生成拆分预览</button><label><Upload size={13} aria-hidden="true" />更换长图<input className="sr-only" aria-label="更换待拆分长图" type="file" accept="image/png,image/jpeg,image/webp,image/bmp" onChange={(event) => { chooseSplitFile(event.target.files?.[0] ?? null); event.target.value = '' }} /></label><button type="button" onClick={() => reset()}>清空</button></div>
          </div>
        </div>
      )}

      {phase === 'ready' && joinResult && resultUrls[0] && (
        <div className="image-long-layout-result">
          <div className={`image-long-layout-result-preview is-${joinOptions.background}`}><img src={resultUrls[0]} alt="长图拼接结果预览" /></div>
          <div className="image-long-layout-result-details"><ImageIcon size={22} aria-hidden="true" /><strong>{joinResult.width} × {joinResult.height}</strong><span>{joinResult.imageCount} 张 · PNG · {formatBytes(joinResult.blob.size)}{joinResult.scale < 1 ? ` · 安全缩放 ${Math.round(joinResult.scale * 100)}%` : ''}</span><p>请放大复核接缝、文字、顺序和裁去范围。导出会新建扁平 PNG，不改写源图片或保留可编辑工程。</p><div className="image-long-layout-actions"><button type="button" onClick={downloadJoin}><Download size={14} aria-hidden="true" />确认并导出</button><button type="button" onClick={returnToEditing}><RotateCcw size={14} aria-hidden="true" />返回调整</button><button type="button" onClick={() => reset()}>选择其他图片</button></div></div>
        </div>
      )}

      {phase === 'ready' && splitResult && resultUrls.length === splitResult.parts.length && (
        <div className="image-long-split-result">
          <div className={`image-long-split-result-grid is-${splitDirection}`} aria-label="长图拆分结果预览">{splitResult.parts.map((part, index) => <figure key={part.filename}><img src={resultUrls[index]} alt={`拆分结果 ${index + 1}`} /><figcaption><strong>{index + 1} / {splitResult.parts.length}</strong><span>{part.width} × {part.height} · {formatBytes(part.blob.size)}</span><button type="button" onClick={() => downloadSplitPart(index)}><Download size={12} aria-hidden="true" />导出此份</button></figcaption></figure>)}</div>
          <div className="image-long-layout-result-details"><ImageIcon size={22} aria-hidden="true" /><strong>{splitResult.parts.length} 个 PNG</strong><span>源图 {splitResult.sourceWidth} × {splitResult.sourceHeight}{splitResult.scale < 1 ? ` · 安全缩放 ${Math.round(splitResult.scale * 100)}%` : ''}</span><p>逐份复核边界和文字。一次导出全部可能触发浏览器的多文件下载确认，也可使用每份下方的独立导出按钮。</p><div className="image-long-layout-actions"><button type="button" onClick={downloadAllSplitParts}><Download size={14} aria-hidden="true" />导出全部</button><button type="button" onClick={returnToEditing}><RotateCcw size={14} aria-hidden="true" />返回调整</button><button type="button" onClick={() => reset()}>选择其他长图</button></div></div>
        </div>
      )}
    </section>
  )
}

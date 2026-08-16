import { Brush, Check, Download, Eraser, ImageMinus, RotateCcw, ShieldCheck, Undo2, Upload, X } from 'lucide-react'
import { useRef, useState, type PointerEvent } from 'react'
import type { CapturedDocument } from '../lib/cameraTools'
import { captureFromImageFile } from '../lib/documentScanner'
import {
  applyBackgroundEffect,
  assessIdPhotoFaceLayout,
  backgroundFilename,
  idPhotoSpecs,
  segmentPerson,
  validateBackgroundImageBatch,
  validateBackgroundImageFile,
  type BackgroundEffect,
  type BackgroundImageFit,
  type BackgroundMaskMode,
  type BackgroundMaskPoint,
  type BackgroundMaskStroke,
  type BackgroundRenderOptions,
  type IdPhotoPreset,
  type PersonSegmentation,
} from '../lib/backgroundRemoval'
import { detectPrivateFaces, type FacePrivacyBox } from '../lib/facePrivacy'

interface BackgroundToolPanelProps {
  onMessage: (message: string) => void
}

type BackgroundPhase = 'idle' | 'segmenting' | 'applying' | 'ready' | 'error'
type BackgroundBatchPhase = 'idle' | 'previewing' | 'ready' | 'exporting'

interface BackgroundBatchPreview {
  index: number
  filename: string
  status: 'ready' | 'error' | 'cancelled'
  dataUrl?: string
  width?: number
  height?: number
  error?: string
}

const effectLabels: Record<BackgroundEffect, string> = {
  transparent: '移除为透明',
  blur: '模糊背景',
  solid: '纯色背景',
  image: '自定义图片',
}

const initialOptions: BackgroundRenderOptions = {
  effect: 'transparent',
  color: '#ffffff',
  blurRadius: 28,
  threshold: 0.5,
  feather: 0.1,
  idPhotoPreset: 'original',
  verticalPosition: 50,
  idPhotoSheet: false,
  backgroundImageFit: 'cover',
  backgroundImagePositionX: 50,
  backgroundImagePositionY: 50,
}

function nextPaint() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

function downloadBackground(dataUrl: string, filename: string) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  link.click()
}

export function BackgroundToolPanel({ onMessage }: BackgroundToolPanelProps) {
  const [phase, setPhase] = useState<BackgroundPhase>('idle')
  const [capture, setCapture] = useState<CapturedDocument | null>(null)
  const [customBackground, setCustomBackground] = useState<CapturedDocument | null>(null)
  const [batchFiles, setBatchFiles] = useState<File[]>([])
  const [batchPhase, setBatchPhase] = useState<BackgroundBatchPhase>('idle')
  const [batchPreviews, setBatchPreviews] = useState<BackgroundBatchPreview[]>([])
  const [batchProgress, setBatchProgress] = useState({ completed: 0, total: 0 })
  const [batchSummary, setBatchSummary] = useState('')
  const [segmentation, setSegmentation] = useState<PersonSegmentation | null>(null)
  const [faces, setFaces] = useState<FacePrivacyBox[]>([])
  const [options, setOptions] = useState(initialOptions)
  const [output, setOutput] = useState('')
  const [outputSize, setOutputSize] = useState({ width: 4, height: 3 })
  const [sourceSize, setSourceSize] = useState({ width: 4, height: 3 })
  const [showOriginal, setShowOriginal] = useState(false)
  const [editingMask, setEditingMask] = useState(false)
  const [corrections, setCorrections] = useState<BackgroundMaskStroke[]>([])
  const [correctionMode, setCorrectionMode] = useState<BackgroundMaskMode>('keep')
  const [brushRadius, setBrushRadius] = useState(0.05)
  const [error, setError] = useState('')
  const requestRef = useRef(0)
  const correctionsRef = useRef<BackgroundMaskStroke[]>([])
  const activeStrokeRef = useRef<string | null>(null)
  const correctionSnapshotRef = useRef<BackgroundMaskStroke[]>([])
  const batchAbortRef = useRef<AbortController | null>(null)

  const clearBatchResults = () => {
    batchAbortRef.current?.abort()
    batchAbortRef.current = null
    setBatchPhase('idle')
    setBatchPreviews([])
    setBatchProgress({ completed: 0, total: 0 })
    setBatchSummary('')
  }

  const renderEffect = async (
    source: CapturedDocument,
    mask: PersonSegmentation,
    nextOptions: BackgroundRenderOptions,
    nextCorrections = correctionsRef.current,
  ) => {
    const request = ++requestRef.current
    setPhase('applying')
    setError('')
    try {
      await nextPaint()
      const rendered = await applyBackgroundEffect(source.dataUrl, mask, {
        ...nextOptions,
        corrections: nextCorrections,
      })
      if (request !== requestRef.current) return false
      setOutput(rendered.dataUrl)
      setOutputSize({ width: rendered.width, height: rendered.height })
      setSourceSize({ width: rendered.sourceWidth, height: rendered.sourceHeight })
      setShowOriginal(false)
      setPhase('ready')
      return true
    } catch (caught) {
      if (request !== requestRef.current) return false
      setError(caught instanceof Error ? caught.message : '无法应用背景效果')
      setPhase('error')
      return false
    }
  }

  const processFile = async (file: File, batchCount = 0) => {
    const request = ++requestRef.current
    setPhase('segmenting')
    setError('')
    setCapture(null)
    setSegmentation(null)
    setFaces([])
    setOutput('')
    setEditingMask(false)
    setCorrections([])
    correctionsRef.current = []
    try {
      validateBackgroundImageFile(file)
      const nextCapture = await captureFromImageFile(file)
      await nextPaint()
      const [nextSegmentation, nextFaces] = await Promise.all([
        segmentPerson(nextCapture.dataUrl),
        detectPrivateFaces(nextCapture.dataUrl).catch(() => []),
      ])
      if (request !== requestRef.current) return
      if (nextSegmentation.personCoverage < 0.01) {
        setError('没有找到足够清晰的人物，请选择人物占比较大的照片')
        setPhase('error')
        return
      }
      setCapture(nextCapture)
      setSegmentation(nextSegmentation)
      setFaces(nextFaces)
      const renderOptions = batchCount > 1 ? { ...options, idPhotoSheet: false } : options
      if (batchCount > 1) setOptions(renderOptions)
      const rendered = await renderEffect(nextCapture, nextSegmentation, renderOptions)
      if (rendered) onMessage(batchCount > 1
        ? `已载入 ${batchCount} 张人物照片并生成首图预览，请设置效果后生成整批预览`
        : '人物已在本机分割，请对照原图检查边缘后导出')
    } catch (caught) {
      if (request !== requestRef.current) return
      setError(caught instanceof Error ? caught.message : '本地人物分割失败')
      setPhase('error')
    }
  }

  const processSelection = async (files: File[]) => {
    if (files.length === 0) return
    clearBatchResults()
    if (files.length === 1) {
      setBatchFiles([])
      await processFile(files[0])
      return
    }
    try {
      validateBackgroundImageBatch(files)
      setBatchFiles(files)
      await processFile(files[0], files.length)
    } catch (caught) {
      setBatchFiles([])
      setError(caught instanceof Error ? caught.message : '无法读取批量人物照片')
      setPhase('error')
    }
  }

  const updateOptions = (nextOptions: BackgroundRenderOptions) => {
    if (batchFiles.length > 1) clearBatchResults()
    setOptions(nextOptions)
    if (capture && segmentation) void renderEffect(capture, segmentation, nextOptions, correctionsRef.current)
  }

  const generateBatchPreviews = async () => {
    if (batchFiles.length < 2) return
    const controller = new AbortController()
    batchAbortRef.current?.abort()
    batchAbortRef.current = controller
    setBatchPhase('previewing')
    setBatchPreviews([])
    setBatchProgress({ completed: 0, total: batchFiles.length })
    setBatchSummary('')
    const items: BackgroundBatchPreview[] = []
    for (let index = 0; index < batchFiles.length; index += 1) {
      const file = batchFiles[index]
      if (controller.signal.aborted) break
      try {
        const nextCapture = await captureFromImageFile(file)
        const nextSegmentation = await segmentPerson(nextCapture.dataUrl)
        if (controller.signal.aborted) break
        if (nextSegmentation.personCoverage < 0.01) throw new Error('没有找到足够清晰的人物')
        const rendered = await applyBackgroundEffect(nextCapture.dataUrl, nextSegmentation, {
          ...options,
          corrections: [],
          idPhotoSheet: false,
          outputMaxDimension: 1_200,
        })
        if (controller.signal.aborted) break
        items.push({ index, filename: file.name, status: 'ready', dataUrl: rendered.dataUrl, width: rendered.width, height: rendered.height })
      } catch (caught) {
        items.push({ index, filename: file.name, status: 'error', error: caught instanceof Error ? caught.message : '预览生成失败' })
      }
      setBatchPreviews([...items])
      setBatchProgress({ completed: index + 1, total: batchFiles.length })
      await nextPaint()
    }
    if (controller.signal.aborted) {
      for (let index = items.length; index < batchFiles.length; index += 1) {
        items.push({ index, filename: batchFiles[index].name, status: 'cancelled', error: '已取消，未生成预览' })
      }
    }
    if (batchAbortRef.current === controller) batchAbortRef.current = null
    const readyCount = items.filter((item) => item.status === 'ready').length
    const failedCount = items.filter((item) => item.status === 'error').length
    setBatchPreviews([...items])
    setBatchPhase('ready')
    setBatchSummary(controller.signal.aborted
      ? `批量预览已取消；保留 ${readyCount} 张成功预览`
      : `批量预览完成：${readyCount} 张可导出${failedCount ? `，${failedCount} 张失败` : ''}`)
    onMessage(controller.signal.aborted
      ? `已取消批量背景预览，保留 ${readyCount} 张成功结果`
      : `批量背景预览完成：${readyCount}/${batchFiles.length} 张可导出`)
  }

  const exportBatch = async () => {
    const exportItems = batchPreviews.filter((item) => item.status === 'ready')
    if (exportItems.length === 0) return
    const controller = new AbortController()
    batchAbortRef.current?.abort()
    batchAbortRef.current = controller
    setBatchPhase('exporting')
    setBatchProgress({ completed: 0, total: exportItems.length })
    setBatchSummary('')
    let exported = 0
    let failed = 0
    for (const item of exportItems) {
      if (controller.signal.aborted) break
      const file = batchFiles[item.index]
      try {
        const nextCapture = await captureFromImageFile(file)
        const nextSegmentation = await segmentPerson(nextCapture.dataUrl)
        if (controller.signal.aborted) break
        if (nextSegmentation.personCoverage < 0.01) throw new Error('没有找到足够清晰的人物')
        const rendered = await applyBackgroundEffect(nextCapture.dataUrl, nextSegmentation, {
          ...options,
          corrections: [],
          idPhotoSheet: false,
          outputMaxDimension: 4_096,
        })
        if (controller.signal.aborted) break
        downloadBackground(rendered.dataUrl, backgroundFilename(file.name, options.effect, options.idPhotoPreset, false))
        exported += 1
      } catch {
        failed += 1
      }
      setBatchProgress({ completed: exported + failed, total: exportItems.length })
      await nextPaint()
    }
    if (batchAbortRef.current === controller) batchAbortRef.current = null
    setBatchPhase('ready')
    const summary = controller.signal.aborted
      ? `导出已取消；此前已请求下载 ${exported} 张`
      : `已请求下载 ${exported} 张${failed ? `，${failed} 张重新处理失败` : ''}`
    setBatchSummary(summary)
    onMessage(summary)
  }

  const processCustomBackground = async (file: File) => {
    try {
      validateBackgroundImageFile(file)
      const nextBackground = await captureFromImageFile(file)
      setCustomBackground(nextBackground)
      const nextOptions: BackgroundRenderOptions = {
        ...options,
        effect: 'image',
        backgroundImageDataUrl: nextBackground.dataUrl,
      }
      updateOptions(nextOptions)
      onMessage('自定义背景已载入本机内存，请调整铺放位置并复核人物边缘')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法读取自定义背景图片')
    }
  }

  const clearCustomBackground = () => {
    setCustomBackground(null)
    const nextOptions: BackgroundRenderOptions = {
      ...options,
      effect: options.effect === 'image' ? 'transparent' : options.effect,
      backgroundImageDataUrl: undefined,
    }
    updateOptions(nextOptions)
    onMessage('已从内存移除自定义背景图片')
  }

  const replaceCorrections = (nextCorrections: BackgroundMaskStroke[]) => {
    correctionsRef.current = nextCorrections
    setCorrections(nextCorrections)
  }

  const pointFromEvent = (event: PointerEvent<HTMLDivElement>): BackgroundMaskPoint => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width))),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / Math.max(1, bounds.height))),
    }
  }

  const beginCorrection = (event: PointerEvent<HTMLDivElement>) => {
    if (
      !editingMask
      || event.isPrimary === false
      || (typeof event.button === 'number' && event.button !== 0)
      || correctionsRef.current.length >= 200
    ) return
    event.preventDefault()
    const stroke: BackgroundMaskStroke = {
      id: crypto.randomUUID(),
      mode: correctionMode,
      radius: brushRadius,
      points: [pointFromEvent(event)],
    }
    activeStrokeRef.current = stroke.id
    event.currentTarget.setPointerCapture(event.pointerId)
    replaceCorrections([...correctionsRef.current, stroke])
  }

  const continueCorrection = (event: PointerEvent<HTMLDivElement>) => {
    const strokeId = activeStrokeRef.current
    if (!editingMask || !strokeId || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    event.preventDefault()
    const point = pointFromEvent(event)
    const next = correctionsRef.current.map((stroke) => {
      if (stroke.id !== strokeId || stroke.points.length >= 500) return stroke
      const previous = stroke.points.at(-1)
      if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.003) return stroke
      return { ...stroke, points: [...stroke.points, point] }
    })
    replaceCorrections(next)
  }

  const endCorrection = (event: PointerEvent<HTMLDivElement>) => {
    if (!activeStrokeRef.current) return
    continueCorrection(event)
    activeStrokeRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const startMaskEditing = () => {
    correctionSnapshotRef.current = correctionsRef.current
    setShowOriginal(false)
    setEditingMask(true)
  }

  const cancelMaskEditing = () => {
    replaceCorrections(correctionSnapshotRef.current)
    activeStrokeRef.current = null
    setEditingMask(false)
  }

  const finishMaskEditing = async () => {
    if (!capture || !segmentation) return
    const rendered = await renderEffect(capture, segmentation, options, correctionsRef.current)
    if (!rendered) return
    setEditingMask(false)
    onMessage(`已应用 ${correctionsRef.current.length} 笔人物边缘修正，请复核后导出`)
  }

  const reset = () => {
    requestRef.current += 1
    setPhase('idle')
    setCapture(null)
    setCustomBackground(null)
    setBatchFiles([])
    clearBatchResults()
    setSegmentation(null)
    setFaces([])
    setOutput('')
    setShowOriginal(false)
    setEditingMask(false)
    setCorrections([])
    correctionsRef.current = []
    activeStrokeRef.current = null
    setError('')
    setOptions((current) => ({
      ...current,
      effect: current.effect === 'image' ? 'transparent' : current.effect,
      backgroundImageDataUrl: undefined,
    }))
  }

  const batchBusy = batchPhase === 'previewing' || batchPhase === 'exporting'
  const controlsLocked = editingMask || batchBusy
  const readyBatchCount = batchPreviews.filter((item) => item.status === 'ready').length

  return (
    <section className="camera-tool-panel background-tool-panel" aria-label="人物背景处理">
      <header>
        <div><ImageMinus size={17} aria-hidden="true" /><strong>人物背景</strong></div>
        <span><ShieldCheck size={13} aria-hidden="true" />SelfieSegmenter 模型与照片均留在本机</span>
      </header>

      {phase === 'idle' && (
        <div className="background-tool-empty">
          <div><ImageMinus size={25} aria-hidden="true" /><strong>移除、模糊或替换人物照片背景</strong><small>适合正面或半身人像；支持 PNG、JPEG、WebP 与 BMP</small></div>
          <label className="ocr-upload-button"><Upload size={14} aria-hidden="true" />选择人物照片（可多选）<input className="sr-only" type="file" multiple accept="image/png,image/jpeg,image/webp,image/bmp" onChange={(event) => { void processSelection(Array.from(event.target.files ?? [])); event.target.value = '' }} /></label>
        </div>
      )}

      {(phase === 'segmenting' || phase === 'applying') && (
        <div className="background-tool-loading" role="status" aria-live="polite">
          <span className="small-spinner" aria-hidden="true" />
          <div><strong>{phase === 'segmenting' ? '正在本机分割人物与背景' : '正在写入背景效果'}</strong><small>照片不会上传</small></div>
        </div>
      )}

      {phase === 'error' && (
        <div className="ocr-error-state" role="alert"><strong>人物背景处理失败</strong><span>{error}</span><button type="button" onClick={reset}><RotateCcw size={14} aria-hidden="true" />重新选择</button></div>
      )}

      {phase === 'ready' && capture && segmentation && (
        <div className="background-tool-workbench">
          <div
            className={`background-tool-preview ${options.effect === 'transparent' && !showOriginal && !editingMask ? 'is-transparent' : ''} ${editingMask ? 'is-mask-editing' : ''}`}
            style={{
              aspectRatio: `${outputSize.width} / ${outputSize.height}`,
              maxWidth: `${172 * outputSize.width / outputSize.height}px`,
            }}
            onPointerDown={beginCorrection}
            onPointerMove={continueCorrection}
            onPointerUp={endCorrection}
            onPointerCancel={(event) => {
              activeStrokeRef.current = null
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
            }}
          >
            <img
              src={editingMask || showOriginal ? capture.dataUrl : output}
              alt={editingMask ? '人物蒙版修正原图' : showOriginal ? '人物背景原图' : '人物背景处理预览'}
            />
            {editingMask && (
              <svg
                className="background-mask-strokes"
                viewBox={`0 0 ${outputSize.width} ${outputSize.height}`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {corrections.map((stroke) => stroke.points.length === 1 ? (
                  <circle
                    key={stroke.id}
                    cx={stroke.points[0].x * outputSize.width}
                    cy={stroke.points[0].y * outputSize.height}
                    r={stroke.radius * Math.min(outputSize.width, outputSize.height)}
                    strokeWidth={Math.max(2, Math.min(outputSize.width, outputSize.height) * 0.008)}
                    className={stroke.mode === 'keep' ? 'is-keep' : 'is-remove'}
                  />
                ) : (
                  <polyline
                    key={stroke.id}
                    points={stroke.points.map((point) => `${point.x * outputSize.width},${point.y * outputSize.height}`).join(' ')}
                    strokeWidth={Math.max(2, stroke.radius * Math.min(outputSize.width, outputSize.height) * 2)}
                    className={stroke.mode === 'keep' ? 'is-keep' : 'is-remove'}
                  />
                ))}
              </svg>
            )}
            <span>{editingMask ? correctionMode === 'keep' ? '画笔：保留人物' : '橡皮：移除背景' : showOriginal ? '原图' : effectLabels[options.effect]}</span>
          </div>
          <div className="background-tool-controls">
            <label><span>背景效果</span><select disabled={controlsLocked} aria-label="背景效果" value={options.effect} onChange={(event) => updateOptions({ ...options, effect: event.target.value as BackgroundEffect })}>{Object.entries(effectLabels).map(([value, label]) => <option key={value} value={value} disabled={value === 'image' && !customBackground}>{label}</option>)}</select></label>
            <div className="background-custom-image-control">
              <label className="ocr-upload-button"><Upload size={13} aria-hidden="true" />{customBackground ? '更换自定义背景' : '选择自定义背景'}<input className="sr-only" aria-label="自定义背景图片" type="file" accept="image/png,image/jpeg,image/webp,image/bmp" disabled={controlsLocked} onChange={(event) => { const file = event.target.files?.[0]; if (file) void processCustomBackground(file); event.target.value = '' }} /></label>
              {customBackground && <div><span title={customBackground.filename}>{customBackground.filename}</span><button type="button" disabled={controlsLocked} onClick={clearCustomBackground}><X size={12} aria-hidden="true" />移除</button></div>}
              {error && phase === 'ready' && <small role="alert">{error}</small>}
            </div>
            {options.effect === 'solid' && <label><span>背景颜色</span><input disabled={controlsLocked} aria-label="背景颜色" type="color" value={options.color} onChange={(event) => updateOptions({ ...options, color: event.target.value })} /></label>}
            {options.effect === 'solid' && <label><span>输出尺寸</span><select disabled={controlsLocked} aria-label="证件照输出尺寸" value={options.idPhotoPreset} onChange={(event) => updateOptions({ ...options, idPhotoPreset: event.target.value as IdPhotoPreset })}><option value="original">保留原图比例</option>{Object.entries(idPhotoSpecs).map(([value, spec]) => <option key={value} value={value}>{spec.label} · {spec.physicalSize} · {spec.width} × {spec.height}px</option>)}</select></label>}
            {options.effect === 'solid' && options.idPhotoPreset !== 'original' && <label><span>垂直构图 {options.verticalPosition}%</span><input disabled={controlsLocked} aria-label="证件照垂直构图" type="range" min="0" max="100" value={options.verticalPosition} onChange={(event) => updateOptions({ ...options, verticalPosition: Number(event.target.value) })} /></label>}
            {options.effect === 'solid' && options.idPhotoPreset !== 'original' && batchFiles.length < 2 && <label><span>输出排版</span><select disabled={controlsLocked} aria-label="证件照输出排版" value={options.idPhotoSheet ? 'sheet' : 'single'} onChange={(event) => updateOptions({ ...options, idPhotoSheet: event.target.value === 'sheet' })}><option value="single">单张照片</option><option value="sheet">4 × 6 inch 多张排版 · 1800 × 1200px</option></select></label>}
            {options.effect === 'blur' && <label><span>模糊强度 {options.blurRadius}px</span><input disabled={controlsLocked} aria-label="模糊强度" type="range" min="8" max="60" step="4" value={options.blurRadius} onChange={(event) => updateOptions({ ...options, blurRadius: Number(event.target.value) })} /></label>}
            {options.effect === 'image' && <label><span>背景铺放</span><select disabled={controlsLocked} aria-label="自定义背景铺放" value={options.backgroundImageFit} onChange={(event) => updateOptions({ ...options, backgroundImageFit: event.target.value as BackgroundImageFit })}><option value="cover">铺满画布（可能裁切）</option><option value="contain">完整显示（可能留边）</option></select></label>}
            {options.effect === 'image' && options.backgroundImageFit === 'contain' && <label><span>留边颜色</span><input disabled={controlsLocked} aria-label="自定义背景留边颜色" type="color" value={options.color} onChange={(event) => updateOptions({ ...options, color: event.target.value })} /></label>}
            {options.effect === 'image' && <label><span>背景水平位置 {options.backgroundImagePositionX}%</span><input disabled={controlsLocked} aria-label="自定义背景水平位置" type="range" min="0" max="100" value={options.backgroundImagePositionX} onChange={(event) => updateOptions({ ...options, backgroundImagePositionX: Number(event.target.value) })} /></label>}
            {options.effect === 'image' && <label><span>背景垂直位置 {options.backgroundImagePositionY}%</span><input disabled={controlsLocked} aria-label="自定义背景垂直位置" type="range" min="0" max="100" value={options.backgroundImagePositionY} onChange={(event) => updateOptions({ ...options, backgroundImagePositionY: Number(event.target.value) })} /></label>}
            <label><span>人物边界 {Math.round(options.threshold * 100)}%</span><input disabled={controlsLocked} aria-label="人物边界" type="range" min="0.3" max="0.75" step="0.05" value={options.threshold} onChange={(event) => updateOptions({ ...options, threshold: Number(event.target.value) })} /></label>
            <label><span>边缘柔化</span><select disabled={controlsLocked} aria-label="边缘柔化" value={options.feather} onChange={(event) => updateOptions({ ...options, feather: Number(event.target.value) })}><option value={0.04}>较锐利</option><option value={0.1}>推荐</option><option value={0.18}>更柔和</option></select></label>
            {batchFiles.length > 1 && (
              <section className="background-batch-workflow" aria-label="批量人物背景">
                <header><strong>批量人物背景 · {batchFiles.length} 张</strong><span>当前大图只预览第 1 张</span></header>
                {batchPhase === 'idle' && <button type="button" onClick={() => void generateBatchPreviews()}>生成 {batchFiles.length} 张批量预览</button>}
                {batchBusy && <div className="background-batch-progress" role="status" aria-live="polite"><span>{batchPhase === 'previewing' ? '正在生成预览' : '正在重新处理并下载'} · {batchProgress.completed}/{batchProgress.total}</span><button type="button" onClick={() => batchAbortRef.current?.abort()}><X size={12} aria-hidden="true" />取消</button></div>}
                {batchPhase === 'ready' && (
                  <>
                    <div className="background-batch-results" aria-label="批量人物背景预览结果">
                      {batchPreviews.map((item) => <article key={`${item.index}-${item.filename}`} className={`is-${item.status}`}>
                        {item.dataUrl ? <img src={item.dataUrl} alt={`${item.filename} 背景预览`} /> : <span aria-hidden="true">{item.status === 'cancelled' ? '—' : '!'}</span>}
                        <div><strong title={item.filename}>{item.filename}</strong><small>{item.status === 'ready' ? `${item.width} × ${item.height}px` : item.error}</small></div>
                      </article>)}
                    </div>
                    {batchSummary && <p role="status">{batchSummary}</p>}
                    <div className="background-batch-actions">
                      <button type="button" onClick={() => void generateBatchPreviews()}>重新生成预览</button>
                      <button className="background-export-button" type="button" disabled={readyBatchCount === 0} onClick={() => void exportBatch()}><Download size={13} aria-hidden="true" />确认并导出 {readyBatchCount} 张</button>
                    </div>
                  </>
                )}
                <small>批量按当前统一设置串行处理，预览最长边 1200px；确认后重新生成最高 4096px PNG 并逐张请求下载。批量不套用首图画笔修正，也不生成 4 × 6 inch 排版；需要精修的照片请改用单图。</small>
              </section>
            )}
            {editingMask && (
              <section className="background-mask-editor" aria-label="人物蒙版画笔">
                <div role="group" aria-label="蒙版修正模式">
                  <button type="button" aria-pressed={correctionMode === 'keep'} onClick={() => setCorrectionMode('keep')}><Brush size={13} aria-hidden="true" />保留人物</button>
                  <button type="button" aria-pressed={correctionMode === 'remove'} onClick={() => setCorrectionMode('remove')}><Eraser size={13} aria-hidden="true" />移除背景</button>
                </div>
                <label><span>画笔大小 {Math.round(brushRadius * 100)}%</span><input aria-label="蒙版画笔大小" type="range" min="0.02" max="0.12" step="0.01" value={brushRadius} onChange={(event) => setBrushRadius(Number(event.target.value))} /></label>
                <small>在原图上涂抹；绿色保留人物，红色移除背景。当前 {corrections.length} 笔。</small>
              </section>
            )}
            {options.effect === 'solid' && options.idPhotoPreset !== 'original' && (() => {
              const assessment = assessIdPhotoFaceLayout(faces, sourceSize.width, sourceSize.height, options.idPhotoPreset as Exclude<IdPhotoPreset, 'original'>, options.verticalPosition)
              return <div className="background-id-photo-check" role="status"><strong>单人构图辅助</strong><span>{assessment.faceCount === 1 ? `脸部高度约 ${Math.round(assessment.faceHeightPercent ?? 0)}% · 水平偏移 ${Math.round(Math.abs(assessment.horizontalOffsetPercent ?? 0))}%` : `检测到 ${assessment.faceCount} 张人脸`}</span><small>{assessment.signals.join('；')}。这是启发式复核，不是合规检测。</small></div>
            })()}
            <p>{editingMask
              ? '修正只改变人物蒙版，不涂改原图。完成后会重新生成当前背景效果。'
              : `人物占画面约 ${Math.round(segmentation.personCoverage * 100)}%。自动分割可能遗漏头发丝、透明饰物或快速运动边缘，${batchFiles.length > 1 ? '批量模式只使用自动蒙版；需要画笔修正时请改用单图。' : '可手动画笔修正。'}${options.effect === 'solid' && options.idPhotoPreset !== 'original' ? `尺寸排版仅供辅助，各机构对头部比例、眼位、背景与文件要求不同，不保证受理。${options.idPhotoSheet && batchFiles.length < 2 ? '打印时选择 4 × 6 inch、100% 或实际尺寸，并关闭“适应页面”。' : ''}` : ''}${options.effect === 'image' ? '自定义背景只保留在当前工具内存；铺满会裁边，完整显示可能留边，导出前请检查位置、边缘和内容授权。' : ''}`}</p>
            {editingMask ? (
              <div className="background-mask-actions">
                <button type="button" disabled={corrections.length === 0} onClick={() => replaceCorrections(correctionsRef.current.slice(0, -1))}><Undo2 size={13} aria-hidden="true" />撤销一笔</button>
                <button type="button" disabled={corrections.length === 0} onClick={() => replaceCorrections([])}><RotateCcw size={13} aria-hidden="true" />清除修正</button>
                <button type="button" onClick={cancelMaskEditing}><X size={13} aria-hidden="true" />取消</button>
                <button className="background-mask-apply" type="button" onClick={() => void finishMaskEditing()}><Check size={13} aria-hidden="true" />应用修正</button>
              </div>
            ) : (
              <div>
                <button type="button" onClick={() => setShowOriginal((current) => !current)}>{showOriginal ? '查看效果' : '对照原图'}</button>
                {batchFiles.length < 2 && <button type="button" onClick={startMaskEditing}><Brush size={14} aria-hidden="true" />修正人物边缘</button>}
                {batchFiles.length < 2 && <button className="background-export-button" type="button" onClick={() => downloadBackground(output, backgroundFilename(capture.filename, options.effect, options.idPhotoPreset, options.idPhotoSheet))}><Download size={14} aria-hidden="true" />确认并导出 PNG</button>}
                <button type="button" onClick={reset}><RotateCcw size={14} aria-hidden="true" />选择另一张</button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

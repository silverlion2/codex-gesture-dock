import { Brush, Check, Download, Eraser, ImageMinus, RotateCcw, ShieldCheck, Undo2, Upload, X } from 'lucide-react'
import { useRef, useState, type PointerEvent } from 'react'
import type { CapturedDocument } from '../lib/cameraTools'
import { captureFromImageFile } from '../lib/documentScanner'
import {
  applyBackgroundEffect,
  backgroundFilename,
  segmentPerson,
  type BackgroundEffect,
  type BackgroundMaskMode,
  type BackgroundMaskPoint,
  type BackgroundMaskStroke,
  type BackgroundRenderOptions,
  type PersonSegmentation,
} from '../lib/backgroundRemoval'

interface BackgroundToolPanelProps {
  onMessage: (message: string) => void
}

type BackgroundPhase = 'idle' | 'segmenting' | 'applying' | 'ready' | 'error'

const effectLabels: Record<BackgroundEffect, string> = {
  transparent: '移除为透明',
  blur: '模糊背景',
  solid: '纯色背景',
}

const initialOptions: BackgroundRenderOptions = {
  effect: 'transparent',
  color: '#ffffff',
  blurRadius: 28,
  threshold: 0.5,
  feather: 0.1,
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
  const [segmentation, setSegmentation] = useState<PersonSegmentation | null>(null)
  const [options, setOptions] = useState(initialOptions)
  const [output, setOutput] = useState('')
  const [outputSize, setOutputSize] = useState({ width: 4, height: 3 })
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

  const processFile = async (file: File) => {
    const request = ++requestRef.current
    setPhase('segmenting')
    setError('')
    setCapture(null)
    setSegmentation(null)
    setOutput('')
    setEditingMask(false)
    setCorrections([])
    correctionsRef.current = []
    try {
      const nextCapture = await captureFromImageFile(file)
      await nextPaint()
      const nextSegmentation = await segmentPerson(nextCapture.dataUrl)
      if (request !== requestRef.current) return
      if (nextSegmentation.personCoverage < 0.01) {
        setError('没有找到足够清晰的人物，请选择人物占比较大的照片')
        setPhase('error')
        return
      }
      setCapture(nextCapture)
      setSegmentation(nextSegmentation)
      const rendered = await renderEffect(nextCapture, nextSegmentation, options)
      if (rendered) onMessage('人物已在本机分割，请对照原图检查边缘后导出')
    } catch (caught) {
      if (request !== requestRef.current) return
      setError(caught instanceof Error ? caught.message : '本地人物分割失败')
      setPhase('error')
    }
  }

  const updateOptions = (nextOptions: BackgroundRenderOptions) => {
    setOptions(nextOptions)
    if (capture && segmentation) void renderEffect(capture, segmentation, nextOptions, correctionsRef.current)
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
    setSegmentation(null)
    setOutput('')
    setShowOriginal(false)
    setEditingMask(false)
    setCorrections([])
    correctionsRef.current = []
    activeStrokeRef.current = null
    setError('')
  }

  return (
    <section className="camera-tool-panel background-tool-panel" aria-label="人物背景处理">
      <header>
        <div><ImageMinus size={17} aria-hidden="true" /><strong>人物背景</strong></div>
        <span><ShieldCheck size={13} aria-hidden="true" />SelfieSegmenter 模型与照片均留在本机</span>
      </header>

      {phase === 'idle' && (
        <div className="background-tool-empty">
          <div><ImageMinus size={25} aria-hidden="true" /><strong>移除、模糊或替换人物照片背景</strong><small>适合正面或半身人像；支持 PNG、JPEG、WebP 与 BMP</small></div>
          <label className="ocr-upload-button"><Upload size={14} aria-hidden="true" />选择人物照片<input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/bmp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void processFile(file); event.target.value = '' }} /></label>
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
            <label><span>背景效果</span><select disabled={editingMask} aria-label="背景效果" value={options.effect} onChange={(event) => updateOptions({ ...options, effect: event.target.value as BackgroundEffect })}>{Object.entries(effectLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            {options.effect === 'solid' && <label><span>背景颜色</span><input disabled={editingMask} aria-label="背景颜色" type="color" value={options.color} onChange={(event) => updateOptions({ ...options, color: event.target.value })} /></label>}
            {options.effect === 'blur' && <label><span>模糊强度 {options.blurRadius}px</span><input disabled={editingMask} aria-label="模糊强度" type="range" min="8" max="60" step="4" value={options.blurRadius} onChange={(event) => updateOptions({ ...options, blurRadius: Number(event.target.value) })} /></label>}
            <label><span>人物边界 {Math.round(options.threshold * 100)}%</span><input disabled={editingMask} aria-label="人物边界" type="range" min="0.3" max="0.75" step="0.05" value={options.threshold} onChange={(event) => updateOptions({ ...options, threshold: Number(event.target.value) })} /></label>
            <label><span>边缘柔化</span><select disabled={editingMask} aria-label="边缘柔化" value={options.feather} onChange={(event) => updateOptions({ ...options, feather: Number(event.target.value) })}><option value={0.04}>较锐利</option><option value={0.1}>推荐</option><option value={0.18}>更柔和</option></select></label>
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
            <p>{editingMask
              ? '修正只改变人物蒙版，不涂改原图。完成后会重新生成当前背景效果。'
              : `人物占画面约 ${Math.round(segmentation.personCoverage * 100)}%。自动分割可能遗漏头发丝、透明饰物或快速运动边缘，可手动画笔修正。`}</p>
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
                <button type="button" onClick={startMaskEditing}><Brush size={14} aria-hidden="true" />修正人物边缘</button>
                <button className="background-export-button" type="button" onClick={() => downloadBackground(output, backgroundFilename(capture.filename, options.effect))}><Download size={14} aria-hidden="true" />确认并导出 PNG</button>
                <button type="button" onClick={reset}><RotateCcw size={14} aria-hidden="true" />选择另一张</button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

import {
  ArrowUpRight,
  CircleDot,
  Download,
  ImageIcon,
  Redo2,
  RefreshCw,
  ScanLine,
  Square,
  Trash2,
  Type,
  Undo2,
  Upload,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  annotationIsLargeEnough,
  clampAnnotationPoint,
  defaultImageAnnotation,
  normalizedAnnotationBox,
  nudgeImageAnnotation,
  prepareAnnotationSource,
  renderAnnotatedImage,
  type AnnotatedImage,
  type AnnotationColor,
  type AnnotationStroke,
  type AnnotationTool,
  type ImageAnnotation,
  type NormalizedPoint,
} from '../lib/imageAnnotation'
import type { PreparedCropSource } from '../lib/imageCrop'

interface ImageAnnotationPanelProps {
  onMessage: (message: string) => void
}

type AnnotationPhase = 'idle' | 'preparing' | 'editing' | 'rendering' | 'ready' | 'error'

const tools: Array<{ key: AnnotationTool; label: string; icon: typeof Square }> = [
  { key: 'rectangle', label: '矩形', icon: Square },
  { key: 'arrow', label: '箭头', icon: ArrowUpRight },
  { key: 'marker', label: '编号', icon: CircleDot },
  { key: 'text', label: '文字', icon: Type },
  { key: 'blur', label: '模糊', icon: ScanLine },
]

const colors: Array<{ value: AnnotationColor; label: string }> = [
  { value: '#D43F3A', label: '红色' },
  { value: '#F2B134', label: '黄色' },
  { value: '#278A52', label: '绿色' },
  { value: '#3478C7', label: '蓝色' },
  { value: '#202923', label: '黑色' },
]

const maximumHistoryStates = 101

const strokeLabels: Record<AnnotationStroke, string> = { thin: '细', medium: '中', thick: '粗' }

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function annotationLabel(annotation: ImageAnnotation) {
  if (annotation.type === 'rectangle') return '矩形标注'
  if (annotation.type === 'arrow') return '箭头标注'
  if (annotation.type === 'marker') return `编号 ${annotation.number}`
  if (annotation.type === 'blur') return '模糊区域'
  return `文字：${annotation.text}`
}

function pointFromPointer(event: ReactPointerEvent<SVGSVGElement>): NormalizedPoint {
  const bounds = event.currentTarget.getBoundingClientRect()
  return {
    x: bounds.width > 0 ? (event.clientX - bounds.left) / bounds.width : 0,
    y: bounds.height > 0 ? (event.clientY - bounds.top) / bounds.height : 0,
  }
}

function arrowHeadPoints(annotation: Extract<ImageAnnotation, { type: 'arrow' }>, width: number, height: number) {
  const x1 = annotation.x1 * width
  const y1 = annotation.y1 * height
  const x2 = annotation.x2 * width
  const y2 = annotation.y2 * height
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const head = Math.max(12, Math.min(width, height) * 0.035)
  return `${x2},${y2} ${x2 - head * Math.cos(angle - Math.PI / 6)},${y2 - head * Math.sin(angle - Math.PI / 6)} ${x2 - head * Math.cos(angle + Math.PI / 6)},${y2 - head * Math.sin(angle + Math.PI / 6)}`
}

function nextMarkerNumber(annotations: ImageAnnotation[]) {
  return Math.min(999, Math.max(0, ...annotations.flatMap((annotation) => annotation.type === 'marker' ? [annotation.number] : [])) + 1)
}

function shapeFromDrag(
  id: string,
  tool: 'rectangle' | 'arrow' | 'blur',
  start: NormalizedPoint,
  end: NormalizedPoint,
  color: AnnotationColor,
  stroke: AnnotationStroke,
): ImageAnnotation {
  if (tool === 'arrow') {
    const first = clampAnnotationPoint(start)
    const second = clampAnnotationPoint(end)
    return { id, type: tool, color, stroke, x1: first.x, y1: first.y, x2: second.x, y2: second.y }
  }
  return { id, type: tool, color, stroke, ...normalizedAnnotationBox(start, end) }
}

function AnnotationShape({
  annotation,
  width,
  height,
  selected,
}: {
  annotation: ImageAnnotation
  width: number
  height: number
  selected: boolean
}) {
  const minimumSide = Math.min(width, height)
  const strokeWidth = Math.max(2, minimumSide * (annotation.stroke === 'thin' ? 0.003 : annotation.stroke === 'medium' ? 0.006 : 0.01))
  const selectionProps = selected ? { stroke: '#ffffff', strokeDasharray: `${strokeWidth * 1.5} ${strokeWidth}`, strokeWidth: strokeWidth * 2.4 } : null
  if (annotation.type === 'rectangle' || annotation.type === 'blur') {
    const x = annotation.x * width
    const y = annotation.y * height
    const boxWidth = annotation.width * width
    const boxHeight = annotation.height * height
    return (
      <g>
        {selected && <rect x={x} y={y} width={boxWidth} height={boxHeight} fill="none" {...selectionProps} />}
        <rect className={annotation.type === 'blur' ? 'is-blur' : undefined} x={x} y={y} width={boxWidth} height={boxHeight} fill={annotation.type === 'blur' ? 'rgba(52,120,199,0.2)' : 'none'} stroke={annotation.color} strokeWidth={strokeWidth} />
        {annotation.type === 'blur' && <text x={x + boxWidth / 2} y={y + boxHeight / 2} textAnchor="middle" dominantBaseline="middle" fill={annotation.color} fontSize={Math.max(12, minimumSide * 0.026)} fontWeight="700">模糊</text>}
      </g>
    )
  }
  if (annotation.type === 'arrow') {
    return (
      <g>
        {selected && <line x1={annotation.x1 * width} y1={annotation.y1 * height} x2={annotation.x2 * width} y2={annotation.y2 * height} {...selectionProps} />}
        <line x1={annotation.x1 * width} y1={annotation.y1 * height} x2={annotation.x2 * width} y2={annotation.y2 * height} stroke={annotation.color} strokeWidth={strokeWidth} strokeLinecap="round" />
        <polygon points={arrowHeadPoints(annotation, width, height)} fill={annotation.color} />
      </g>
    )
  }
  if (annotation.type === 'marker') {
    const radius = Math.max(strokeWidth * 3, minimumSide * 0.026)
    return (
      <g>
        {selected && <circle cx={annotation.x * width} cy={annotation.y * height} r={radius + strokeWidth * 1.8} fill="none" {...selectionProps} />}
        <circle cx={annotation.x * width} cy={annotation.y * height} r={radius} fill={annotation.color} />
        <text x={annotation.x * width} y={annotation.y * height} textAnchor="middle" dominantBaseline="middle" fill={annotation.color === '#F2B134' ? '#202923' : '#ffffff'} fontSize={radius * 1.15} fontWeight="700">{annotation.number}</text>
      </g>
    )
  }
  const fontSize = Math.max(14, minimumSide * 0.035)
  return (
    <g>
      {selected && <circle cx={annotation.x * width} cy={annotation.y * height} r={strokeWidth * 2.5} fill="#ffffff" stroke={annotation.color} strokeWidth={strokeWidth} />}
      <text x={annotation.x * width} y={annotation.y * height} fill={annotation.color} stroke="#ffffff" strokeWidth={Math.max(1, strokeWidth * 0.6)} paintOrder="stroke" fontSize={fontSize} fontWeight="700">{annotation.text}</text>
    </g>
  )
}

export function ImageAnnotationPanel({ onMessage }: ImageAnnotationPanelProps) {
  const [phase, setPhase] = useState<AnnotationPhase>('idle')
  const [source, setSource] = useState<PreparedCropSource | null>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [result, setResult] = useState<AnnotatedImage | null>(null)
  const [resultUrl, setResultUrl] = useState('')
  const [history, setHistory] = useState<ImageAnnotation[][]>([[]])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tool, setTool] = useState<AnnotationTool>('rectangle')
  const [color, setColor] = useState<AnnotationColor>('#D43F3A')
  const [stroke, setStroke] = useState<AnnotationStroke>('medium')
  const [textValue, setTextValue] = useState('说明')
  const [dragStart, setDragStart] = useState<NormalizedPoint | null>(null)
  const [dragCurrent, setDragCurrent] = useState<NormalizedPoint | null>(null)
  const [dragPointerId, setDragPointerId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const idRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  const annotations = history[historyIndex] ?? []
  const selectedAnnotation = annotations.find((annotation) => annotation.id === selectedId) ?? null
  const draft = useMemo(() => {
    if (!dragStart || !dragCurrent || (tool !== 'rectangle' && tool !== 'arrow' && tool !== 'blur')) return null
    return shapeFromDrag('draft', tool, dragStart, dragCurrent, color, stroke)
  }, [color, dragCurrent, dragStart, stroke, tool])

  useEffect(() => {
    if (!source) {
      setSourceUrl('')
      return
    }
    const url = URL.createObjectURL(source.blob)
    setSourceUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [source])

  useEffect(() => {
    if (!result) {
      setResultUrl('')
      return
    }
    const url = URL.createObjectURL(result.blob)
    setResultUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [result])

  useEffect(() => () => abortRef.current?.abort(), [])

  const nextId = () => `annotation-${++idRef.current}`

  const commit = (next: ImageAnnotation[], selection: string | null = selectedId) => {
    if (next.length > 100) {
      onMessage('单张图片最多保留 100 个标注')
      return
    }
    const branchedHistory = [...history.slice(0, historyIndex + 1), next]
    const boundedHistory = branchedHistory.slice(-maximumHistoryStates)
    setHistory(boundedHistory)
    setHistoryIndex(boundedHistory.length - 1)
    setSelectedId(selection)
    setResult(null)
  }

  const addAnnotation = (annotation: ImageAnnotation) => {
    if (annotations.length >= 100) {
      onMessage('单张图片最多保留 100 个标注')
      return
    }
    commit([...annotations, annotation], annotation.id)
    onMessage(`已添加${annotationLabel(annotation)}；请在导出前目视复核`)
  }

  const prepare = async (file: File) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('preparing')
    setError('')
    setResult(null)
    try {
      const next = await prepareAnnotationSource(file, controller.signal)
      if (controller.signal.aborted) return
      setSource(next)
      setHistory([[]])
      setHistoryIndex(0)
      setSelectedId(null)
      setPhase('editing')
      onMessage(`图片已在本机载入：${next.width} × ${next.height}；请选择标注工具`)
    } catch (caught) {
      if (controller.signal.aborted) return
      setError(caught instanceof Error ? caught.message : '无法准备图片标注工作区')
      setPhase('error')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  const reset = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setSource(null)
    setResult(null)
    setHistory([[]])
    setHistoryIndex(0)
    setSelectedId(null)
    setTool('rectangle')
    setDragStart(null)
    setDragCurrent(null)
    setDragPointerId(null)
    setError('')
    setPhase('idle')
  }

  const addAtCenter = () => {
    const annotation = defaultImageAnnotation(nextId(), tool, color, stroke, nextMarkerNumber(annotations), textValue)
    addAnnotation(annotation)
  }

  const addPointAnnotation = (point: NormalizedPoint) => {
    if (tool === 'marker') {
      addAnnotation({ id: nextId(), type: tool, color, stroke, ...point, number: nextMarkerNumber(annotations) })
      return
    }
    if (tool === 'text') {
      const text = textValue.trim().slice(0, 80)
      if (!text) {
        onMessage('请先输入 1–80 个文字，再点击图片放置')
        return
      }
      addAnnotation({ id: nextId(), type: tool, color, stroke, ...point, text })
    }
  }

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || !source) return
    const point = pointFromPointer(event)
    if (tool === 'marker' || tool === 'text') {
      addPointAnnotation(point)
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragPointerId(event.pointerId)
    setDragStart(point)
    setDragCurrent(point)
  }

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragPointerId !== event.pointerId) return
    setDragCurrent(pointFromPointer(event))
  }

  const finishDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!source || dragPointerId !== event.pointerId || !dragStart || (tool !== 'rectangle' && tool !== 'arrow' && tool !== 'blur')) return
    const end = pointFromPointer(event)
    const annotation = shapeFromDrag(nextId(), tool, dragStart, end, color, stroke)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    setDragStart(null)
    setDragCurrent(null)
    setDragPointerId(null)
    if (!annotationIsLargeEnough(annotation, source.width, source.height)) {
      onMessage('矩形、箭头或模糊区域不能小于 8 像素')
      return
    }
    addAnnotation(annotation)
  }

  const cancelDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragPointerId !== event.pointerId) return
    setDragStart(null)
    setDragCurrent(null)
    setDragPointerId(null)
  }

  const deleteAnnotation = (id: string) => {
    commit(annotations.filter((annotation) => annotation.id !== id), selectedId === id ? null : selectedId)
  }

  const nudgeSelected = (event: ReactKeyboardEvent<HTMLButtonElement>, annotation: ImageAnnotation) => {
    if (!source) return
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      deleteAnnotation(annotation.id)
      return
    }
    const multiplier = event.shiftKey ? 10 : 1
    const deltaX = event.key === 'ArrowLeft' ? -multiplier / source.width : event.key === 'ArrowRight' ? multiplier / source.width : 0
    const deltaY = event.key === 'ArrowUp' ? -multiplier / source.height : event.key === 'ArrowDown' ? multiplier / source.height : 0
    if (deltaX === 0 && deltaY === 0) return
    event.preventDefault()
    commit(annotations.map((entry) => entry.id === annotation.id ? nudgeImageAnnotation(entry, deltaX, deltaY) : entry), annotation.id)
  }

  const undo = () => {
    if (historyIndex <= 0) return
    setHistoryIndex(historyIndex - 1)
    setSelectedId(null)
    setResult(null)
  }

  const redo = () => {
    if (historyIndex >= history.length - 1) return
    setHistoryIndex(historyIndex + 1)
    setSelectedId(null)
    setResult(null)
  }

  const createPreview = async () => {
    if (!source || annotations.length === 0) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('rendering')
    setError('')
    try {
      const next = await renderAnnotatedImage(source, annotations, controller.signal)
      if (controller.signal.aborted) return
      setResult(next)
      setPhase('ready')
      onMessage(`扁平标注预览已生成：${next.annotationCount} 个标注 · ${next.width} × ${next.height}`)
    } catch (caught) {
      if (controller.signal.aborted) return
      setError(caught instanceof Error ? caught.message : '生成标注预览失败')
      setPhase('error')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  const download = () => {
    if (!result || !resultUrl) return
    const link = document.createElement('a')
    link.href = resultUrl
    link.download = result.filename
    link.click()
    onMessage(`已导出 ${result.filename}；所有标注已扁平写入新 PNG`)
  }

  return (
    <section className="image-annotation-panel" aria-label="本机图片标注">
      {phase === 'idle' && (
        <div className="image-annotation-empty">
          <ArrowUpRight size={27} aria-hidden="true" />
          <strong>给截图或照片添加可复核标注</strong>
          <small>矩形、箭头、编号、文字和局部模糊均只在本机处理；先生成扁平预览，再明确导出新 PNG</small>
          <label className="ocr-upload-button"><Upload size={14} aria-hidden="true" />选择图片<input className="sr-only" aria-label="选择待标注图片" type="file" accept="image/png,image/jpeg,image/webp,image/bmp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void prepare(file); event.target.value = '' }} /></label>
          <span>PNG、JPEG、WebP、BMP · 最大 35 MB · 最多 100 个标注</span>
        </div>
      )}

      {(phase === 'preparing' || phase === 'rendering') && (
        <div className="image-annotation-loading" role="status" aria-live="polite">
          <span className="small-spinner" aria-hidden="true" />
          <div><strong>{phase === 'preparing' ? '正在准备本机标注工作图' : '正在扁平化模糊与可见标注'}</strong><small>源图片不会上传、覆盖或写入元数据</small></div>
          <button type="button" onClick={reset}>取消</button>
        </div>
      )}

      {phase === 'error' && (
        <div className="ocr-error-state" role="alert"><strong>图片标注失败</strong><span>{error}</span><button type="button" onClick={source ? () => setPhase('editing') : reset}><RefreshCw size={14} aria-hidden="true" />{source ? '返回编辑' : '重新选择'}</button></div>
      )}

      {phase === 'editing' && source && sourceUrl && (
        <div className="image-annotation-editor">
          <div className="image-annotation-canvas-column">
            <div className="image-annotation-stage" style={{ aspectRatio: `${source.width} / ${source.height}` }}>
              <img src={sourceUrl} alt="待标注图片" draggable={false} />
              <svg
                viewBox={`0 0 ${source.width} ${source.height}`}
                preserveAspectRatio="none"
                role="img"
                aria-label="图片标注画布；指针拖动矩形、箭头或模糊区域，点击放置编号或文字"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={finishDrag}
                onPointerCancel={cancelDrag}
              >
                {annotations.map((annotation) => <AnnotationShape key={annotation.id} annotation={annotation} width={source.width} height={source.height} selected={annotation.id === selectedId} />)}
                {draft && <AnnotationShape annotation={draft} width={source.width} height={source.height} selected />}
              </svg>
            </div>
            <small>当前工具：{tools.find((entry) => entry.key === tool)?.label}。指针可直接在图片上操作；键盘用户可用“在中心添加”，再从右侧列表微调。</small>
          </div>

          <div className="image-annotation-controls">
            <div className="image-annotation-tool-tabs" role="group" aria-label="标注工具">
              {tools.map(({ key, label, icon: Icon }) => <button key={key} type="button" aria-pressed={tool === key} onClick={() => setTool(key)}><Icon size={13} aria-hidden="true" />{label}</button>)}
            </div>
            <div className="image-annotation-options">
              <label><span>颜色</span><select aria-label="标注颜色" value={color} onChange={(event) => setColor(event.target.value as AnnotationColor)}>{colors.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label>
              <label><span>线宽</span><select aria-label="标注线宽" value={stroke} onChange={(event) => setStroke(event.target.value as AnnotationStroke)}>{Object.entries(strokeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className={tool === 'text' ? '' : 'is-disabled'}><span>文字</span><input aria-label="标注文字" value={textValue} maxLength={80} disabled={tool !== 'text'} onChange={(event) => setTextValue(event.target.value)} /></label>
            </div>
            <div className="image-annotation-history-actions">
              <button type="button" disabled={historyIndex <= 0} onClick={undo}><Undo2 size={13} aria-hidden="true" />撤销</button>
              <button type="button" disabled={historyIndex >= history.length - 1} onClick={redo}><Redo2 size={13} aria-hidden="true" />重做</button>
              <button type="button" onClick={addAtCenter}>在中心添加</button>
              <button type="button" disabled={annotations.length === 0} onClick={() => commit([], null)}><Trash2 size={13} aria-hidden="true" />清空</button>
            </div>
            <div className="image-annotation-list" aria-label={`标注列表，共 ${annotations.length} 项`}>
              {annotations.length === 0 ? <p>还没有标注。选择工具后在图片上操作，或使用“在中心添加”。</p> : annotations.map((annotation, index) => (
                <div key={annotation.id} data-selected={annotation.id === selectedId}>
                  <button type="button" aria-pressed={annotation.id === selectedId} onClick={() => setSelectedId(annotation.id)} onKeyDown={(event) => nudgeSelected(event, annotation)}><span>{index + 1}</span><strong>{annotationLabel(annotation)}</strong><small>{colors.find((entry) => entry.value === annotation.color)?.label} · {strokeLabels[annotation.stroke]}</small></button>
                  <button type="button" aria-label={`删除${annotationLabel(annotation)}`} onClick={() => deleteAnnotation(annotation.id)}><Trash2 size={12} aria-hidden="true" /></button>
                </div>
              ))}
            </div>
            <p>选中列表项后，方向键移动 1 像素，Shift + 方向键移动 10 像素，Delete 删除。模糊会先写入原像素，其他标注随后覆盖；导出前请检查遮挡边缘和文字。</p>
            <dl><div><dt>工作尺寸</dt><dd>{source.width} × {source.height}</dd></div><div><dt>安全缩放</dt><dd>{source.scale < 1 ? `${Math.round(source.scale * 100)}%` : '100%'}</dd></div><div><dt>已选标注</dt><dd>{selectedAnnotation ? annotationLabel(selectedAnnotation) : '无'}</dd></div></dl>
            <div className="image-annotation-primary-actions"><button type="button" disabled={annotations.length === 0} onClick={() => void createPreview()}><ImageIcon size={14} aria-hidden="true" />生成扁平预览</button><button type="button" onClick={reset}>选择其他图片</button></div>
          </div>
        </div>
      )}

      {phase === 'ready' && result && resultUrl && (
        <div className="image-annotation-result">
          <div className="image-annotation-result-preview"><img src={resultUrl} alt="扁平标注结果预览" /></div>
          <div className="image-annotation-result-details">
            <ImageIcon size={21} aria-hidden="true" />
            <strong>{result.width} × {result.height}</strong>
            <span>{result.annotationCount} 个标注 · PNG · {formatBytes(result.blob.size)}</span>
            <p>请放大检查模糊边界、箭头、编号和文字。导出会新建元数据被移除的扁平 PNG；标注不能再从导出图片中单独编辑。</p>
            <div className="image-annotation-primary-actions"><button type="button" onClick={download}><Download size={14} aria-hidden="true" />确认并导出</button><button type="button" onClick={() => { setResult(null); setPhase('editing') }}><RefreshCw size={14} aria-hidden="true" />返回调整</button><button type="button" onClick={reset}>选择其他图片</button></div>
          </div>
        </div>
      )}
    </section>
  )
}

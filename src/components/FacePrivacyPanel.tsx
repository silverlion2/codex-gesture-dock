import { Download, EyeOff, MapPin, Plus, RotateCcw, ShieldAlert, ShieldCheck, Upload } from 'lucide-react'
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { CapturedDocument } from '../lib/cameraTools'
import { captureFromImageFile } from '../lib/documentScanner'
import {
  applyFacePrivacy,
  detectPrivateFaces,
  expandFacePrivacyBox,
  facePrivateFilename,
  normalizeFacePrivacyBox,
  type FacePrivacyBox,
  type FacePrivacyEffect,
} from '../lib/facePrivacy'
import {
  inspectImageMetadata,
  metadataFreeFilename,
  type ImageMetadataReport,
} from '../lib/imageMetadata'

interface FacePrivacyPanelProps {
  onMessage: (message: string) => void
}

type FacePrivacyPhase = 'idle' | 'detecting' | 'applying' | 'ready' | 'error'

interface FacePrivacyDrag {
  id: string
  startClientX: number
  startClientY: number
  originX: number
  originY: number
  moved: boolean
}

const effectLabels: Record<FacePrivacyEffect, string> = {
  blur: '高斯模糊',
  pixelate: '像素化',
  blackout: '黑色遮盖',
}

function downloadPrivatePhoto(dataUrl: string, filename: string) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  link.click()
}

export function FacePrivacyPanel({ onMessage }: FacePrivacyPanelProps) {
  const [phase, setPhase] = useState<FacePrivacyPhase>('idle')
  const [capture, setCapture] = useState<CapturedDocument | null>(null)
  const [boxes, setBoxes] = useState<FacePrivacyBox[]>([])
  const [effect, setEffect] = useState<FacePrivacyEffect>('blur')
  const [margin, setMargin] = useState(0.18)
  const [output, setOutput] = useState('')
  const [outputSize, setOutputSize] = useState({ width: 4, height: 3 })
  const [metadata, setMetadata] = useState<ImageMetadataReport | null>(null)
  const [error, setError] = useState('')
  const requestRef = useRef(0)
  const dragRef = useRef<FacePrivacyDrag | null>(null)
  const suppressClickRef = useRef<string | null>(null)

  const renderPreview = async (
    source: CapturedDocument,
    nextBoxes: FacePrivacyBox[],
    nextEffect: FacePrivacyEffect,
    nextMargin: number,
  ) => {
    const request = ++requestRef.current
    setPhase('applying')
    setError('')
    try {
      const rendered = await applyFacePrivacy(source.dataUrl, nextBoxes, nextEffect, nextMargin)
      if (request !== requestRef.current) return
      setOutput(rendered.dataUrl)
      setOutputSize({ width: rendered.width, height: rendered.height })
      setPhase('ready')
      return true
    } catch (caught) {
      if (request !== requestRef.current) return
      setError(caught instanceof Error ? caught.message : '无法应用人脸隐私效果')
      setPhase('error')
      return false
    }
  }

  const processFile = async (file: File) => {
    const request = ++requestRef.current
    setPhase('detecting')
    setError('')
    setBoxes([])
    setOutput('')
    setMetadata(null)
    setOutputSize({ width: 4, height: 3 })
    try {
      const [nextCapture, nextMetadata] = await Promise.all([
        captureFromImageFile(file),
        inspectImageMetadata(file),
      ])
      const nextBoxes = await detectPrivateFaces(nextCapture.dataUrl)
      if (request !== requestRef.current) return
      setCapture(nextCapture)
      setBoxes(nextBoxes)
      setMetadata(nextMetadata)
      const applied = await renderPreview(nextCapture, nextBoxes, effect, margin)
      if (applied && (request === requestRef.current - 1 || request === requestRef.current)) {
        if (nextBoxes.length === 0) {
          onMessage('未检测到人脸；仍可导出不携带原文件元数据的 PNG')
        } else {
          const metadataSuffix = nextMetadata.items.length > 0
            ? `；另发现 ${nextMetadata.items.length} 项照片隐私元数据`
            : ''
          onMessage(`已在本机检测到 ${nextBoxes.length} 张人脸${metadataSuffix}，请逐项复核`)
        }
      }
    } catch (caught) {
      if (request !== requestRef.current) return
      setError(caught instanceof Error ? caught.message : '本机人脸检测失败')
      setPhase('error')
    }
  }

  const updateBoxes = (nextBoxes: FacePrivacyBox[]) => {
    setBoxes(nextBoxes)
    if (capture) void renderPreview(capture, nextBoxes, effect, margin)
  }

  const addManualBox = () => {
    const box: FacePrivacyBox = {
      id: `manual-${crypto.randomUUID()}`,
      x: 0.36,
      y: 0.3,
      width: 0.28,
      height: 0.35,
      confidence: 1,
      enabled: true,
      source: 'manual',
    }
    updateBoxes([...boxes, box])
    onMessage('已添加手动隐私区；可拖动或用方向键调整位置')
  }

  const adjustBoxWithKeyboard = (box: FacePrivacyBox, event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      updateBoxes(boxes.filter((item) => item.id !== box.id))
      return
    }
    const direction = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key]
    if (!direction) return
    event.preventDefault()
    const step = event.shiftKey ? 0.025 : 0.005
    const candidate = normalizeFacePrivacyBox(event.altKey ? {
      ...box,
      width: Math.max(0.01, box.width + direction[0] * step),
      height: Math.max(0.01, box.height + direction[1] * step),
    } : {
      ...box,
      x: box.x + direction[0] * step,
      y: box.y + direction[1] * step,
    })
    if (!candidate) return
    updateBoxes(boxes.map((item) => item.id === box.id ? candidate : item))
  }

  const movedBox = (box: FacePrivacyBox, event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    const preview = event.currentTarget.parentElement
    if (!drag || drag.id !== box.id || !preview) return box
    const bounds = preview.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return box
    const deltaX = (event.clientX - drag.startClientX) / bounds.width
    const deltaY = (event.clientY - drag.startClientY) / bounds.height
    drag.moved ||= Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) >= 3
    return normalizeFacePrivacyBox({ ...box, x: drag.originX + deltaX, y: drag.originY + deltaY }) ?? box
  }

  const reset = () => {
    requestRef.current += 1
    setPhase('idle')
    setCapture(null)
    setBoxes([])
    setOutput('')
    setMetadata(null)
    setError('')
  }

  const activeCount = boxes.filter((box) => box.enabled).length
  const detectedCount = boxes.filter((box) => box.source !== 'manual').length
  const manualCount = boxes.length - detectedCount

  return (
    <section className="camera-tool-panel face-privacy-panel" aria-label="人脸与照片隐私处理">
      <header>
        <div><EyeOff size={17} aria-hidden="true" /><strong>人脸与照片隐私</strong></div>
        <span><ShieldCheck size={13} aria-hidden="true" />人脸与常见 EXIF 检查均在本机完成</span>
      </header>

      {phase === 'idle' && (
        <div className="face-privacy-empty">
          <div><EyeOff size={25} aria-hidden="true" /><strong>检测人脸与照片隐私元数据</strong><small>支持 PNG、JPEG、WebP、BMP；导出 PNG 不复制原文件元数据</small></div>
          <label className="ocr-upload-button"><Upload size={14} aria-hidden="true" />选择照片<input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/bmp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void processFile(file); event.target.value = '' }} /></label>
        </div>
      )}

      {(phase === 'detecting' || phase === 'applying') && (
        <div className="face-privacy-loading" role="status" aria-live="polite">
          <span className="small-spinner" aria-hidden="true" />
          <div><strong>{phase === 'detecting' ? '正在加载本机模型并检测人脸' : '正在把隐私效果写入图像'}</strong><small>照片不会上传</small></div>
        </div>
      )}

      {phase === 'error' && (
        <div className="ocr-error-state" role="alert"><strong>人脸隐私处理失败</strong><span>{error}</span><button type="button" onClick={reset}><RotateCcw size={14} aria-hidden="true" />重新选择</button></div>
      )}

      {phase === 'ready' && capture && (
        <div className="face-privacy-workbench">
          <div className="face-privacy-preview" style={{ aspectRatio: `${outputSize.width} / ${outputSize.height}` }}>
            <img src={output || capture.dataUrl} alt="人脸隐私处理预览" />
            {boxes.map((box, index) => {
              const expanded = expandFacePrivacyBox(box, margin)
              const boxLabel = box.source === 'manual' ? '手动隐私区' : '人脸'
              return (
                <button
                  key={box.id}
                  type="button"
                  className={box.enabled ? 'is-enabled' : ''}
                  aria-pressed={box.enabled}
                  aria-label={`${boxLabel} ${index + 1} ${box.enabled ? '已处理' : '已跳过'}`}
                  title={box.source === 'manual' ? '手动添加；拖动移动，方向键微调' : `置信度 ${Math.round(box.confidence * 100)}%`}
                  style={{ left: `${expanded.x * 100}%`, top: `${expanded.y * 100}%`, width: `${expanded.width * 100}%`, height: `${expanded.height * 100}%` }}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId)
                    dragRef.current = {
                      id: box.id,
                      startClientX: event.clientX,
                      startClientY: event.clientY,
                      originX: box.x,
                      originY: box.y,
                      moved: false,
                    }
                  }}
                  onPointerMove={(event) => {
                    if (!dragRef.current || dragRef.current.id !== box.id) return
                    const candidate = movedBox(box, event)
                    setBoxes((current) => current.map((item) => item.id === box.id ? candidate : item))
                  }}
                  onPointerUp={(event) => {
                    const drag = dragRef.current
                    if (!drag || drag.id !== box.id) return
                    const candidate = movedBox(box, event)
                    dragRef.current = null
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
                    if (drag.moved) suppressClickRef.current = box.id
                    updateBoxes(boxes.map((item) => item.id === box.id ? candidate : item))
                  }}
                  onPointerCancel={() => {
                    dragRef.current = null
                    updateBoxes(boxes)
                  }}
                  onClick={() => {
                    if (suppressClickRef.current === box.id) {
                      suppressClickRef.current = null
                      return
                    }
                    updateBoxes(boxes.map((item) => item.id === box.id ? { ...item, enabled: !item.enabled } : item))
                  }}
                  onKeyDown={(event) => adjustBoxWithKeyboard(box, event)}
                ><span>{index + 1}</span></button>
              )
            })}
            <span>{boxes.length === 0
              ? '未检测到人脸 · 可手动添加'
              : `检测 ${detectedCount} 张 · 手动 ${manualCount} 处 · 处理 ${activeCount} 处`}</span>
          </div>
          <div className="face-privacy-controls">
            <label><span>隐私效果</span><select value={effect} onChange={(event) => { const next = event.target.value as FacePrivacyEffect; setEffect(next); void renderPreview(capture, boxes, next, margin) }}>{Object.entries(effectLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span>保护范围</span><select value={margin} onChange={(event) => { const next = Number(event.target.value); setMargin(next); void renderPreview(capture, boxes, effect, next) }}><option value={0.1}>紧凑 +10%</option><option value={0.18}>推荐 +18%</option><option value={0.3}>宽松 +30%</option></select></label>
            {metadata && (
              <section className={`photo-metadata-card ${metadata.hasGps ? 'has-high-risk' : ''}`} aria-label="照片元数据隐私检查">
                <div>
                  {metadata.hasGps ? <MapPin size={13} aria-hidden="true" /> : <ShieldAlert size={13} aria-hidden="true" />}
                  <strong>{metadata.status === 'inspected'
                    ? metadata.items.length > 0 ? `发现 ${metadata.items.length} 项常见隐私元数据` : '未发现常见 EXIF 隐私字段'
                    : '元数据检查范围受限'}</strong>
                </div>
                {metadata.items.length > 0 && (
                  <dl>
                    {metadata.items.map((item) => (
                      <div key={item.id} className={item.risk === 'high' ? 'is-high-risk' : ''}>
                        <dt>{item.label}</dt><dd>{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {metadata.message && <p>{metadata.message}</p>}
                <small>导出会重新编码为 PNG，原照片中的 EXIF、GPS、XMP、IPTC 和 ICC 数据不会被复制；仍需目视检查画面内容。</small>
              </section>
            )}
            <p>拖动编号框移动；方向键微调，Shift 快移，Alt + 方向键调整大小，Delete 删除。自动检测可能漏掉侧脸、遮挡或很小的人脸。</p>
            <div>
              <button className="manual-privacy-button" type="button" onClick={addManualBox}><Plus size={14} aria-hidden="true" />添加手动隐私区</button>
              <button type="button" disabled={!output} onClick={() => downloadPrivatePhoto(
                output,
                activeCount > 0 ? facePrivateFilename(capture.filename) : metadataFreeFilename(capture.filename),
              )} className="privacy-export-button"><Download size={14} aria-hidden="true" />{activeCount > 0 ? '确认并导出隐私 PNG' : '导出无元数据 PNG'}</button>
              <button type="button" onClick={reset}><RotateCcw size={14} aria-hidden="true" />选择另一张</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

import { Check, Crosshair, RotateCcw, X } from 'lucide-react'
import { useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { DocumentCorners, DocumentPoint } from '../lib/documentScanner'

interface DocumentCornerEditorProps {
  sourceDataUrl: string
  sourceWidth: number
  sourceHeight: number
  initialCorners: DocumentCorners
  onApply: (corners: DocumentCorners) => void
  onCancel: () => void
}

type CornerKey = keyof DocumentCorners

const cornerLabels: Record<CornerKey, string> = {
  topLeft: '左上角',
  topRight: '右上角',
  bottomRight: '右下角',
  bottomLeft: '左下角',
}

const cornerKeys = Object.keys(cornerLabels) as CornerKey[]

export function DocumentCornerEditor({
  sourceDataUrl,
  sourceWidth,
  sourceHeight,
  initialCorners,
  onApply,
  onCancel,
}: DocumentCornerEditorProps) {
  const [corners, setCorners] = useState(initialCorners)

  const updateCorner = (key: CornerKey, point: DocumentPoint) => {
    setCorners((current) => ({
      ...current,
      [key]: {
        x: Math.max(0, Math.min(sourceWidth - 1, point.x)),
        y: Math.max(0, Math.min(sourceHeight - 1, point.y)),
      },
    }))
  }

  const updateFromPointer = (key: CornerKey, event: PointerEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.parentElement?.getBoundingClientRect()
    if (!bounds || bounds.width === 0 || bounds.height === 0) return
    updateCorner(key, {
      x: ((event.clientX - bounds.left) / bounds.width) * sourceWidth,
      y: ((event.clientY - bounds.top) / bounds.height) * sourceHeight,
    })
  }

  const moveWithKeyboard = (key: CornerKey, event: KeyboardEvent<HTMLButtonElement>) => {
    const direction = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key]
    if (!direction) return
    event.preventDefault()
    const step = event.shiftKey ? 10 : 2
    updateCorner(key, {
      x: corners[key].x + direction[0] * step,
      y: corners[key].y + direction[1] * step,
    })
  }

  const polygon = cornerKeys.map((key) => `${corners[key].x},${corners[key].y}`).join(' ')

  return (
    <section className="document-corner-editor" role="dialog" aria-label="手动调整文档边缘">
      <header>
        <div><Crosshair size={16} aria-hidden="true" /><strong>拖动四角贴合纸张</strong></div>
        <small>键盘方向键微调，Shift + 方向键快速移动</small>
      </header>
      <div
        className="document-corner-canvas"
        style={{ aspectRatio: `${sourceWidth} / ${sourceHeight}` }}
      >
        <img src={sourceDataUrl} alt="待调整边缘的原始文档" />
        <svg viewBox={`0 0 ${sourceWidth} ${sourceHeight}`} preserveAspectRatio="none" aria-hidden="true">
          <polygon points={polygon} />
        </svg>
        {cornerKeys.map((key) => (
          <button
            key={key}
            type="button"
            className="document-corner-handle"
            aria-label={`调整${cornerLabels[key]}`}
            style={{
              left: `${(corners[key].x / sourceWidth) * 100}%`,
              top: `${(corners[key].y / sourceHeight) * 100}%`,
            }}
            onKeyDown={(event) => moveWithKeyboard(key, event)}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              updateFromPointer(key, event)
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) updateFromPointer(key, event)
            }}
            onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
          >
            <span>{cornerLabels[key]}</span>
          </button>
        ))}
      </div>
      <div className="document-corner-actions">
        <button type="button" onClick={() => setCorners(initialCorners)}><RotateCcw size={14} aria-hidden="true" />恢复</button>
        <div>
          <button type="button" onClick={onCancel}><X size={14} aria-hidden="true" />取消</button>
          <button type="button" onClick={() => onApply(corners)}><Check size={14} aria-hidden="true" />应用边缘</button>
        </div>
      </div>
    </section>
  )
}

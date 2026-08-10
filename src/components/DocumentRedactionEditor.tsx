import { Check, EyeOff, Plus, RotateCcw, Trash2, Undo2, X } from 'lucide-react'
import { useState, type KeyboardEvent, type PointerEvent } from 'react'
import {
  normalizeDocumentRedaction,
  type DocumentRedaction,
  type ScannedDocumentPage,
} from '../lib/documentScanner'

interface DocumentRedactionEditorProps {
  page: ScannedDocumentPage
  initialRedactions?: DocumentRedaction[]
  onApply: (redactions: DocumentRedaction[]) => void
  onCancel: () => void
}

interface DraftRedaction {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

function id() {
  return crypto.randomUUID()
}

function draftRectangle(draft: DraftRedaction): DocumentRedaction {
  return {
    id: 'draft',
    x: Math.min(draft.startX, draft.currentX),
    y: Math.min(draft.startY, draft.currentY),
    width: Math.abs(draft.currentX - draft.startX),
    height: Math.abs(draft.currentY - draft.startY),
  }
}

export function DocumentRedactionEditor({ page, initialRedactions = page.redactions, onApply, onCancel }: DocumentRedactionEditorProps) {
  const [redactions, setRedactions] = useState(initialRedactions)
  const [selectedId, setSelectedId] = useState<string | null>(initialRedactions.at(-1)?.id ?? null)
  const [draft, setDraft] = useState<DraftRedaction | null>(null)

  const pointFromEvent = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    }
  }

  const addDefault = () => {
    const redaction = { id: id(), x: 0.3, y: 0.43, width: 0.4, height: 0.12 }
    setRedactions((current) => [...current, redaction])
    setSelectedId(redaction.id)
  }

  const removeSelected = () => {
    if (!selectedId) return
    setRedactions((current) => current.filter((redaction) => redaction.id !== selectedId))
    setSelectedId(null)
  }

  const adjustWithKeyboard = (redaction: DocumentRedaction, event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      setSelectedId(redaction.id)
      setRedactions((current) => current.filter((item) => item.id !== redaction.id))
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
    const candidate = event.altKey
      ? {
          ...redaction,
          width: Math.max(0.01, redaction.width + direction[0] * step),
          height: Math.max(0.01, redaction.height + direction[1] * step),
        }
      : {
          ...redaction,
          x: redaction.x + direction[0] * step,
          y: redaction.y + direction[1] * step,
        }
    const adjusted = normalizeDocumentRedaction(candidate)
    if (!adjusted) return
    setSelectedId(redaction.id)
    setRedactions((current) => current.map((item) => item.id === redaction.id ? adjusted : item))
  }

  const draftBox = draft ? draftRectangle(draft) : null

  return (
    <section className="document-redaction-editor" role="dialog" aria-label="文档隐私遮盖">
      <header>
        <div><EyeOff size={16} aria-hidden="true" /><strong>永久遮盖敏感信息</strong></div>
        <small>拖动画框；方向键移动，Alt + 方向键调整大小</small>
      </header>
      <div
        className="document-redaction-canvas"
        style={{ aspectRatio: `${page.width} / ${page.height}` }}
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget) return
          const point = pointFromEvent(event)
          event.currentTarget.setPointerCapture(event.pointerId)
          setDraft({ startX: point.x, startY: point.y, currentX: point.x, currentY: point.y })
        }}
        onPointerMove={(event) => {
          if (!draft || !event.currentTarget.hasPointerCapture(event.pointerId)) return
          const point = pointFromEvent(event)
          setDraft((current) => current ? { ...current, currentX: point.x, currentY: point.y } : null)
        }}
        onPointerUp={(event) => {
          if (!draft) return
          const normalized = normalizeDocumentRedaction({ ...draftRectangle(draft), id: id() })
          if (normalized) {
            setRedactions((current) => [...current, normalized])
            setSelectedId(normalized.id)
          }
          setDraft(null)
          event.currentTarget.releasePointerCapture(event.pointerId)
        }}
      >
        <img src={page.baseDataUrl} alt="待遮盖的扫描页" />
        {redactions.map((redaction, index) => (
          <button
            key={redaction.id}
            type="button"
            className={redaction.id === selectedId ? 'redaction-box is-selected' : 'redaction-box'}
            aria-label={`遮盖区 ${index + 1}`}
            style={{
              left: `${redaction.x * 100}%`,
              top: `${redaction.y * 100}%`,
              width: `${redaction.width * 100}%`,
              height: `${redaction.height * 100}%`,
            }}
            onClick={() => setSelectedId(redaction.id)}
            onKeyDown={(event) => adjustWithKeyboard(redaction, event)}
          />
        ))}
        {draftBox && (
          <span
            className="redaction-box is-draft"
            style={{
              left: `${draftBox.x * 100}%`,
              top: `${draftBox.y * 100}%`,
              width: `${draftBox.width * 100}%`,
              height: `${draftBox.height * 100}%`,
            }}
            aria-hidden="true"
          />
        )}
      </div>
      <div className="document-redaction-tools">
        <button type="button" onClick={addDefault}><Plus size={14} aria-hidden="true" />添加遮盖区</button>
        <button type="button" disabled={redactions.length === 0} onClick={() => { setRedactions((current) => current.slice(0, -1)); setSelectedId(null) }}><Undo2 size={14} aria-hidden="true" />撤销</button>
        <button type="button" disabled={!selectedId} onClick={removeSelected}><Trash2 size={14} aria-hidden="true" />删除所选</button>
        <button type="button" disabled={redactions.length === 0} onClick={() => { setRedactions([]); setSelectedId(null) }}><RotateCcw size={14} aria-hidden="true" />清除全部</button>
      </div>
      <footer>
        <span>{redactions.length > 0 ? `将永久遮盖 ${redactions.length} 处后写入导出图像` : '当前没有遮盖区'}</span>
        <div>
          <button type="button" onClick={onCancel}><X size={14} aria-hidden="true" />取消</button>
          <button type="button" onClick={() => onApply(redactions)}><Check size={14} aria-hidden="true" />应用遮盖</button>
        </div>
      </footer>
    </section>
  )
}

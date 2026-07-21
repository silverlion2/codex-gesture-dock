import { Hand, Mic, Radio } from 'lucide-react'
import type { GestureViewState } from '../hooks/useGestureControl'
import { GESTURE_BINDINGS, type GestureName } from '../lib/gestures'

interface GestureBookProps {
  enabled: boolean
  gesture: GestureViewState
  microphoneActive?: boolean
}

function liveLabel(
  enabled: boolean,
  gesture: GestureViewState,
  microphoneActive: boolean,
) {
  if (!enabled) return '控制已暂停'
  if (microphoneActive) return 'Codex 话筒已激活'
  if (gesture.modelPhase === 'loading') return '正在加载识别模型'
  if (gesture.modelPhase === 'error') return '识别模型异常'
  if (gesture.awaitingNeutral) return '请松手以继续'
  if (gesture.binding) return gesture.binding.actionLabel
  return '等待手势'
}

export function GestureBook({
  enabled,
  gesture,
  microphoneActive = false,
}: GestureBookProps) {
  return (
    <section className={`gesture-book ${enabled ? 'is-enabled' : 'is-disabled'}`}>
      <header className="gesture-book-header">
        <div>
          <span>GESTURE BOOK · 06</span>
          <strong>Codex 全手势手册</strong>
        </div>
        {microphoneActive ? (
          <Mic className="gesture-mic-active" size={19} aria-hidden="true" />
        ) : (
          <Hand size={19} aria-hidden="true" />
        )}
      </header>

      <div className="gesture-book-live" aria-live="polite">
        <Radio size={14} aria-hidden="true" />
        <span>{liveLabel(enabled, gesture, microphoneActive)}</span>
        <i aria-hidden="true">
          <b style={{ width: `${gesture.progress * 100}%` }} />
        </i>
      </div>

      <div className="gesture-book-grid">
        {(Object.entries(GESTURE_BINDINGS) as [GestureName, (typeof GESTURE_BINDINGS)[GestureName]][]).map(
          ([name, binding], index) => (
            <article
              className={gesture.gesture === name || gesture.binding === binding ? 'is-active' : ''}
              key={name}
            >
              <span className="gesture-number">{String(index + 1).padStart(2, '0')}</span>
              <b aria-hidden="true">{binding.symbol}</b>
              <div>
                <strong>{binding.actionLabel}</strong>
                <small>{binding.gestureLabel}</small>
              </div>
            </article>
          ),
        )}
      </div>

      <footer>
        <span>保持</span>
        <strong>0.85s</strong>
        <span>触发 · 松手复位</span>
      </footer>
    </section>
  )
}

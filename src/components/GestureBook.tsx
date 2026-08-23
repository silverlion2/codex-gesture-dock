import {
  CheckCircle2,
  Hand,
  ListTodo,
  MessageCircle,
  Mic,
  MousePointer2,
  MousePointerClick,
  MoveVertical,
  PanelRightOpen,
  Radio,
  TerminalSquare,
} from 'lucide-react'
import type { GestureViewState } from '../hooks/useGestureControl'
import {
  getGestureBindings,
  type GestureMode,
  type GestureName,
} from '../lib/gestures'

interface GestureBookProps {
  enabled: boolean
  gesture: GestureViewState
  microphoneActive?: boolean
  mode?: GestureMode
}

function liveLabel(
  enabled: boolean,
  gesture: GestureViewState,
  microphoneActive: boolean,
  mode: GestureMode,
) {
  if (!enabled) return '控制已暂停'
  if (microphoneActive) return 'Codex 话筒已激活'
  if (gesture.modelPhase === 'loading') return '正在加载识别模型'
  if (gesture.modelPhase === 'error') return '识别模型异常'
  if (mode === 'pointer') {
    if (gesture.pointerActivity === 'moving') return '正在移动指针'
    if (gesture.pointerActivity === 'clicking') return '已执行单击'
    if (gesture.pointerActivity === 'scrolling-up') return '正在向上滚动'
    if (gesture.pointerActivity === 'scrolling-down') return '正在向下滚动'
    return '等待食指、捏合或张掌'
  }
  if (gesture.awaitingNeutral) return '请松手以继续'
  if (gesture.binding) return gesture.binding.actionLabel
  return '等待手势'
}

function GestureActionIcon({ name }: { name: GestureName }) {
  const props = { size: 18, strokeWidth: 1.8, 'aria-hidden': true as const }
  if (name === 'Victory') return <MessageCircle {...props} />
  if (name === 'Pointing_Up') return <Mic {...props} />
  if (name === 'Open_Palm') return <ListTodo {...props} />
  if (name === 'Thumb_Up') return <CheckCircle2 {...props} />
  if (name === 'ILoveYou') return <TerminalSquare {...props} />
  return <PanelRightOpen {...props} />
}

export function GestureBook({
  enabled,
  gesture,
  microphoneActive = false,
  mode = 'codex',
}: GestureBookProps) {
  const bindings = getGestureBindings(mode)
  const codexMicrophoneActive = mode === 'codex' && microphoneActive
  if (mode === 'pointer') {
    const activity = gesture.pointerActivity ?? 'idle'
    const guide = [
      {
        active: activity === 'moving',
        detail: '伸出食指并移动',
        icon: MousePointer2,
        label: '移动系统指针',
      },
      {
        active: activity === 'clicking',
        detail: '拇指与食指捏合一次',
        icon: MousePointerClick,
        label: '单击左键',
      },
      {
        active: activity === 'scrolling-up' || activity === 'scrolling-down',
        detail: '张开手掌并上下移动',
        icon: MoveVertical,
        label: '滚动页面',
      },
    ]
    return (
      <section className={`gesture-book ${enabled ? 'is-enabled' : 'is-disabled'}`}>
        <header className="gesture-book-header">
          <div>
            <span>AIR POINTER · 03</span>
            <strong>免触控屏幕控制</strong>
          </div>
          <MousePointer2 size={19} aria-hidden="true" />
        </header>

        <div className="gesture-book-live" aria-live="polite">
          <Radio size={14} aria-hidden="true" />
          <span>{liveLabel(enabled, gesture, false, mode)}</span>
          <i aria-hidden="true">
            <b style={{ width: activity === 'idle' ? '0%' : '100%' }} />
          </i>
        </div>

        <div className="gesture-book-grid pointer-guide-grid">
          {guide.map((item, index) => {
            const Icon = item.icon
            return (
              <article className={item.active ? 'is-active' : ''} key={item.label}>
                <span className="gesture-number">{String(index + 1).padStart(2, '0')}</span>
                <b aria-hidden="true"><Icon size={18} strokeWidth={1.8} /></b>
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </div>
              </article>
            )
          })}
        </div>

        <footer>
          <span>无需保持</span>
          <strong>握拳 / 收手</strong>
          <span>停止</span>
        </footer>
      </section>
    )
  }
  return (
    <section className={`gesture-book ${enabled ? 'is-enabled' : 'is-disabled'}`}>
      <header className="gesture-book-header">
        <div>
          <span>GESTURE BOOK · 06</span>
          <strong>{mode === 'windows' ? 'Windows 全手势手册' : 'Codex 全手势手册'}</strong>
        </div>
        {codexMicrophoneActive ? (
          <Mic className="gesture-mic-active" size={19} aria-hidden="true" />
        ) : (
          <Hand size={19} aria-hidden="true" />
        )}
      </header>

      <div className="gesture-book-live" aria-live="polite">
        <Radio size={14} aria-hidden="true" />
        <span>{liveLabel(enabled, gesture, codexMicrophoneActive, mode)}</span>
        <i aria-hidden="true">
          <b style={{ width: `${gesture.progress * 100}%` }} />
        </i>
      </div>

      <div className="gesture-book-grid">
        {(Object.entries(bindings) as [GestureName, (typeof bindings)[GestureName]][]).map(
          ([name, binding], index) => (
            <article
              className={gesture.gesture === name || gesture.binding === binding ? 'is-active' : ''}
              key={name}
            >
              <span className="gesture-number">{String(index + 1).padStart(2, '0')}</span>
              <b aria-hidden="true"><GestureActionIcon name={name} /></b>
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

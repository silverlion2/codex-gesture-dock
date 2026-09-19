import {
  ArrowLeftRight,
  ArrowRightLeft,
  CheckCircle2,
  Hand,
  LayoutGrid,
  ListTodo,
  Maximize2,
  MessageCircle,
  Mic,
  Minimize2,
  MonitorDown,
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
  cameraActive?: boolean
  controlPaused?: boolean
  microphoneActive?: boolean
  mode?: GestureMode
}

function liveLabel(
  enabled: boolean,
  gesture: GestureViewState,
  microphoneActive: boolean,
  mode: GestureMode,
  cameraActive: boolean,
  controlPaused: boolean,
) {
  if (mode === 'windows') {
    if (!cameraActive) return '摄像头未开启'
    if (controlPaused || !enabled) return '控制已暂停'
    if (gesture.modelPhase === 'idle') return '等待识别模型'
    if (gesture.modelPhase === 'loading') return '正在加载识别模型'
    if (gesture.modelPhase === 'error') return '识别模型异常'
    if (gesture.awaitingNeutral) return '移开手，准备下一个动作'
    if (gesture.binding) return `正在识别：${gesture.binding.gestureLabel}`
    return '等待手势'
  }
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

function WindowsActionIcon({ name }: { name: GestureName }) {
  const props = { size: 18, strokeWidth: 1.8, 'aria-hidden': true as const }
  if (name === 'Victory') return <ArrowRightLeft {...props} />
  if (name === 'Pointing_Up') return <LayoutGrid {...props} />
  if (name === 'Open_Palm') return <MonitorDown {...props} />
  if (name === 'Thumb_Up') return <Maximize2 {...props} />
  if (name === 'ILoveYou') return <ArrowLeftRight {...props} />
  return <Minimize2 {...props} />
}

const WINDOWS_GESTURE_DETAILS: Record<GestureName, { pose: string; effect: string }> = {
  Victory: {
    pose: '食指和中指张开，其余手指收拢',
    effect: '相当于 Alt + Tab',
  },
  Pointing_Up: {
    pose: '食指伸直向上，其余手指收拢',
    effect: '查看所有窗口并选择',
  },
  Open_Palm: {
    pose: '五指张开，掌心朝向镜头',
    effect: '暂时收起所有窗口',
  },
  Thumb_Up: {
    pose: '拇指伸直向上，其余手指收拢',
    effect: '再次触发可还原窗口',
  },
  ILoveYou: {
    pose: '拇指、食指、小指伸开，中指和无名指收拢',
    effect: '返回上一个窗口',
  },
  Closed_Fist: {
    pose: '五指收拢，握紧拳头',
    effect: '收起窗口，不会关闭程序',
  },
}

export function GestureBook({
  enabled,
  gesture,
  cameraActive = true,
  controlPaused = false,
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
          <span>{liveLabel(enabled, gesture, false, mode, cameraActive, controlPaused)}</span>
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
    <section className={`gesture-book ${enabled ? 'is-enabled' : 'is-disabled'} ${mode === 'windows' ? 'windows-gesture-book' : ''}`}>
      <header className="gesture-book-header">
        <div>
          {mode !== 'windows' && <span>GESTURE BOOK · 06</span>}
          <strong>{mode === 'windows' ? '六个手势，控制当前窗口' : 'Codex 全手势手册'}</strong>
        </div>
        {codexMicrophoneActive ? (
          <Mic className="gesture-mic-active" size={19} aria-hidden="true" />
        ) : (
          <Hand size={19} aria-hidden="true" />
        )}
      </header>

      <div className="gesture-book-live" aria-live="polite">
        <Radio size={14} aria-hidden="true" />
        <span>{liveLabel(enabled, gesture, codexMicrophoneActive, mode, cameraActive, controlPaused)}</span>
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
              {mode !== 'windows' && <span className="gesture-number">{String(index + 1).padStart(2, '0')}</span>}
              <b aria-hidden="true">
                {mode === 'windows' ? <WindowsActionIcon name={name} /> : <GestureActionIcon name={name} />}
              </b>
              <div>
                <strong>{binding.actionLabel}</strong>
                {mode === 'windows' ? (
                  <>
                    <small className="gesture-pose">{WINDOWS_GESTURE_DETAILS[name].pose}</small>
                    <small className="gesture-effect">{WINDOWS_GESTURE_DETAILS[name].effect}</small>
                  </>
                ) : (
                  <small>{binding.gestureLabel}</small>
                )}
              </div>
            </article>
          ),
        )}
      </div>

      <footer>
        <span>保持</span>
        <strong>0.85s</strong>
        <span>触发 · 松手复位</span>
        {mode === 'windows' && (
          <small>移开手，准备下一个动作；张开手掌执行“显示桌面”，不是紧急停止</small>
        )}
      </footer>
    </section>
  )
}

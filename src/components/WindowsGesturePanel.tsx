import { Hand, Mic, PauseCircle, PlayCircle, Square } from 'lucide-react'
import type { GestureViewState } from '../hooks/useGestureControl'
import type { GestureMode } from '../lib/gestures'
import type { VoiceControlStatus } from '../lib/voiceControl'
import { GestureBook } from './GestureBook'

interface Props {
  gesture: GestureViewState
  gestureEnabled: boolean
  cameraActive: boolean
  starting: boolean
  paused: boolean
  controlBusy: boolean
  desktopAvailable: boolean
  feedback: { message: string; ok: boolean } | null
  voice: VoiceControlStatus
  onStart: () => void
  onStop: () => void
  onPause: () => void
  onVoiceToggle: () => void
  onModeChange: (mode: GestureMode) => void
}

export function WindowsGesturePanel(props: Props) {
  const { cameraActive, starting, paused, voice } = props
  return (
    <section className="windows-gesture-panel" aria-label="Windows 手势控制">
      <header className="desktop-control-heading">
        <h1>用手势，操作桌面</h1>
        <label>
          <span className="sr-only">控制模式</span>
          <select value="windows" onChange={(event) => props.onModeChange(event.target.value as GestureMode)}>
            <option value="windows">Windows 窗口</option>
            <option value="pointer">空中鼠标</option>
            <option value="codex">Codex 任务</option>
          </select>
        </label>
      </header>
      <p className="desktop-control-intro">不必绑定 Codex 任务。把一只手放进镜头，控制当前前台窗口。</p>
      <div className="desktop-start-actions">
        <button className="desktop-start-button" type="button" aria-label="一键启动极简 Windows 桌面手势控制" disabled={starting} onClick={props.onStart}>
          <Hand size={19} aria-hidden="true" />
          {starting ? '正在准备摄像头与手势…' : cameraActive ? '进入手势悬浮球' : '启动手势 · 进入悬浮球'}
        </button>
        {(cameraActive || starting) && <button className="desktop-stop-button" type="button" onClick={props.onStop}>
          <Square size={15} aria-hidden="true" />{starting ? '取消启动' : '关闭摄像头'}
        </button>}
      </div>
      <p className="desktop-start-hint">识别就绪后缩成悬浮球，点击球可恢复面板。不会开启语音。</p>
      {!props.desktopAvailable && <p className="desktop-preview-note">网页仅供查看界面；操作系统窗口请使用 Windows 桌面版。</p>}
      <div className="desktop-safety-row">
        <button type="button" disabled={props.controlBusy} aria-pressed={paused} onClick={props.onPause}>
          {paused ? <PlayCircle size={16} aria-hidden="true" /> : <PauseCircle size={16} aria-hidden="true" />}
          {paused ? '恢复桌面控制' : '暂停桌面控制'}
        </button>
        <span>{paused ? '已暂停 · 手势不会操作窗口' : '暂停后不执行窗口动作，摄像头仍可运行'}</span>
      </div>
      {props.feedback && <p className={`desktop-action-result ${props.feedback.ok ? 'is-success' : 'is-error'}`} role="status">
        {props.feedback.ok ? '执行结果：' : '未执行：'}{props.feedback.message}
      </p>}
      <GestureBook enabled={props.gestureEnabled} gesture={props.gesture} mode="windows" cameraActive={cameraActive} controlPaused={paused} />
      <section className="desktop-voice-control" aria-label="语音控制">
        <div>
          <h2><Mic size={17} aria-hidden="true" />语音控制</h2>
          <p role="status">{voice.message}</p>
        </div>
        <button type="button" aria-label={voice.enabled ? '关闭语音控制' : '开启语音控制'} aria-pressed={voice.enabled} disabled={voice.phase === 'starting'} onClick={props.onVoiceToggle}>
          {voice.phase === 'starting' ? '正在开启…' : voice.enabled ? '关闭语音' : '开启语音'}
        </button>
        <p className="desktop-voice-hint">开启后说“助手 切换窗口”或“助手 暂停控制”。使用系统默认麦克风，本机识别。</p>
      </section>
    </section>
  )
}

import { GripHorizontal, Mic, PersonStanding } from 'lucide-react'
import type { MonitorPhase } from '../hooks/usePoseMonitor'
import type { PostureStatus } from '../lib/posture'

interface FloatingButtonProps {
  actionFeedback?: { message: string; ok: boolean } | null
  hidden: boolean
  gestureActive: boolean
  phase: MonitorPhase
  score: number | null
  status: PostureStatus
  postureActive?: boolean
  voiceListening?: boolean
  onExpand: () => void
}

export function FloatingButton({
  actionFeedback = null,
  hidden,
  gestureActive,
  phase,
  score,
  status,
  postureActive = true,
  voiceListening = false,
  onExpand,
}: FloatingButtonProps) {
  const monitoring = phase === 'monitoring'
  const restoreLabel = monitoring && postureActive
    ? `当前坐姿评分 ${score ?? 0}，恢复迷你摄像头 Dock`
    : monitoring ? '仅手势控制，恢复迷你摄像头 Dock' : '恢复迷你摄像头 Dock'
  const restoreWithVoice = voiceListening ? `语音正在监听。${restoreLabel}` : restoreLabel
  const label = actionFeedback
    ? `${actionFeedback.message}。${restoreWithVoice}`
    : restoreWithVoice

  return (
    <div
      className={`floating-button-wrap status-${status} ${gestureActive ? 'has-gestures' : ''} ${actionFeedback ? (actionFeedback.ok ? 'has-action-success' : 'has-action-error') : ''}`}
      hidden={hidden}
    >
      {actionFeedback && (
        <span className="sr-only" role="status">
          {actionFeedback.message}
        </span>
      )}
      <span className="bubble-drag-handle" aria-hidden="true">
        <GripHorizontal size={14} />
      </span>
      <button
        className="floating-button"
        type="button"
        aria-label={label}
        title="恢复迷你摄像头 Dock"
        onClick={onExpand}
      >
        {monitoring && postureActive && score !== null ? (
          <strong>{score}</strong>
        ) : (
          <PersonStanding size={28} strokeWidth={1.8} aria-hidden="true" />
        )}
        <span className="bubble-live-dot" aria-hidden="true" />
        {voiceListening && <Mic className="bubble-voice-indicator" size={13} aria-hidden="true" />}
        {gestureActive && <span className="bubble-gesture-dot" aria-hidden="true" />}
      </button>
    </div>
  )
}

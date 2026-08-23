import { GripHorizontal, PersonStanding } from 'lucide-react'
import type { MonitorPhase } from '../hooks/usePoseMonitor'
import type { PostureStatus } from '../lib/posture'

interface FloatingButtonProps {
  hidden: boolean
  gestureActive: boolean
  phase: MonitorPhase
  score: number | null
  status: PostureStatus
  onExpand: () => void
}

export function FloatingButton({
  hidden,
  gestureActive,
  phase,
  score,
  status,
  onExpand,
}: FloatingButtonProps) {
  const monitoring = phase === 'monitoring'
  const label = monitoring
    ? `当前坐姿评分 ${score ?? 0}，恢复迷你摄像头 Dock`
    : '恢复迷你摄像头 Dock'

  return (
    <div
      className={`floating-button-wrap status-${status} ${gestureActive ? 'has-gestures' : ''}`}
      hidden={hidden}
    >
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
        {monitoring && score !== null ? (
          <strong>{score}</strong>
        ) : (
          <PersonStanding size={28} strokeWidth={1.8} aria-hidden="true" />
        )}
        <span className="bubble-live-dot" aria-hidden="true" />
        {gestureActive && <span className="bubble-gesture-dot" aria-hidden="true" />}
      </button>
    </div>
  )
}

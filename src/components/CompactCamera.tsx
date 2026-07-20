import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Hand,
  RotateCcw,
  X,
} from 'lucide-react'
import type { RefObject } from 'react'
import type { GestureViewState } from '../hooks/useGestureControl'
import type { MonitorPhase } from '../hooks/usePoseMonitor'
import { GESTURE_BINDINGS } from '../lib/gestures'
import { statusLabel, type PostureStatus } from '../lib/posture'

interface CompactCameraProps {
  videoRef: RefObject<HTMLVideoElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  phase: MonitorPhase
  status: PostureStatus
  error: string
  calibrationProgress: number
  gesture: GestureViewState
  gestureEnabled: boolean
  showGestureGuide: boolean
  onCloseGestureGuide: () => void
  onRecalibrate: () => void
}

export function CompactCamera({
  videoRef,
  canvasRef,
  phase,
  status,
  error,
  calibrationProgress,
  gesture,
  gestureEnabled,
  showGestureGuide,
  onCloseGestureGuide,
  onRecalibrate,
}: CompactCameraProps) {
  return (
    <section className="compact-camera" aria-label="摄像头预览">
      <video ref={videoRef} autoPlay muted playsInline aria-label="实时摄像头画面" />
      <canvas ref={canvasRef} aria-hidden="true" />

      {phase === 'idle' && (
        <div className="camera-placeholder">
          <Camera size={28} aria-hidden="true" />
          <strong>准备开始</strong>
          <span>坐直后点击下方开始监测</span>
        </div>
      )}

      {phase === 'loading' && (
        <div className="camera-placeholder" role="status">
          <span className="small-spinner" aria-hidden="true" />
          <strong>正在准备本地模型</strong>
        </div>
      )}

      {phase === 'error' && (
        <div className="camera-placeholder camera-error" role="alert">
          <AlertCircle size={25} aria-hidden="true" />
          <strong>摄像头没有启动</strong>
          <span>{error}</span>
        </div>
      )}

      {phase === 'ended' && (
        <div className="camera-placeholder">
          <CheckCircle2 size={27} aria-hidden="true" />
          <strong>本次已结束</strong>
          <span>需要时可以再次开始</span>
        </div>
      )}

      {phase === 'calibrating' && (
        <div className="compact-calibration" role="status">
          <strong>{Math.max(1, Math.ceil(4 - calibrationProgress * 4))}</strong>
          <span>{status === 'away' ? '让头部和双肩进入画面' : '保持自然坐直'}</span>
          <i aria-hidden="true">
            <b style={{ width: `${calibrationProgress * 100}%` }} />
          </i>
        </div>
      )}

      {phase === 'monitoring' && (
        <>
          <div className={`camera-status status-${status}`} aria-live="polite">
            <span />
            {statusLabel[status]}
          </div>
          <button
            className="recalibrate-button"
            type="button"
            onClick={onRecalibrate}
          >
            <RotateCcw size={15} aria-hidden="true" />
            重新校准
          </button>
        </>
      )}

      {gestureEnabled && phase === 'monitoring' && !showGestureGuide && (
        <div
          className={`gesture-live ${gesture.binding ? 'has-gesture' : ''}`}
          aria-live="polite"
        >
          <Hand size={15} aria-hidden="true" />
          <div>
            <strong>
              {gesture.modelPhase === 'loading'
                ? '加载手势模型'
                : gesture.modelPhase === 'error'
                  ? '手势模型异常'
                  : gesture.awaitingNeutral
                    ? '松开手势以继续'
                    : gesture.binding
                      ? `${gesture.binding.symbol} ${gesture.binding.actionLabel}`
                      : '等待 Codex 手势'}
            </strong>
            <i aria-hidden="true">
              <b style={{ width: `${gesture.progress * 100}%` }} />
            </i>
          </div>
        </div>
      )}

      {showGestureGuide && (
        <div className="gesture-guide" role="dialog" aria-label="Codex 手势表">
          <header>
            <strong>Codex 核心手势</strong>
            <button
              type="button"
              aria-label="关闭手势表"
              onClick={onCloseGestureGuide}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </header>
          <div className="gesture-guide-grid">
            {Object.entries(GESTURE_BINDINGS).map(([name, binding]) => (
              <div key={name}>
                <b aria-hidden="true">{binding.symbol}</b>
                <span>
                  <strong>{binding.actionLabel}</strong>
                  <small>{binding.gestureLabel}</small>
                </span>
              </div>
            ))}
          </div>
          <p>稳定保持 0.85 秒才会触发；松手后才能执行下一次。</p>
        </div>
      )}
    </section>
  )
}

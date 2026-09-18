import { useEffect } from 'react'
import type { GestureModelPhase } from './useGestureControl'
import type { MonitorPhase } from './usePoseMonitor'

interface Options {
  pending: boolean
  enabled: boolean
  cameraPhase: MonitorPhase
  cameraError: string
  modelPhase: GestureModelPhase
  modelError: string
  onSettled: () => void
  onReady: () => void
  onError: (message: string) => void
}

/** Only a live camera and ready model can finish one-click startup. */
export function useMinimalGestureReadiness({
  pending, enabled, cameraPhase, cameraError, modelPhase, modelError,
  onSettled, onReady, onError,
}: Options) {
  useEffect(() => {
    if (!pending) return
    if (!enabled || cameraPhase === 'ended' || cameraPhase === 'idle') {
      onSettled()
    } else if (cameraPhase === 'error' || modelPhase === 'error') {
      onSettled()
      onError(cameraPhase === 'error'
        ? cameraError || '摄像头启动失败，极简手势控制未启动'
        : `手势识别模型无法启动：${modelError || '请重试'}`)
    } else if (cameraPhase === 'monitoring' && modelPhase === 'ready') {
      onSettled()
      onReady()
    }
  }, [pending, enabled, cameraPhase, cameraError, modelPhase, modelError, onSettled, onReady, onError])

  useEffect(() => {
    if (!pending) return
    const timeout = window.setTimeout(() => {
      onSettled()
      onError('手势启动超时，请检查摄像头后重试')
    }, 45_000)
    return () => window.clearTimeout(timeout)
  }, [pending, onSettled, onError])
}

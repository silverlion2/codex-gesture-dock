import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import {
  advanceGestureMachine,
  CODEX_GESTURE_BINDINGS,
  initialGestureMachineState,
  type GestureAction,
  type GestureActionResult,
  type GestureBinding,
  type GestureName,
} from '../lib/gestures'
import {
  advanceAirPointer,
  disarmAirPointerState,
  initialAirPointerState,
  type HandLandmark,
  type PointerActivity,
  type PointerCommand,
} from '../lib/pointerGestures'
import { createGestureRecognizerClient } from '../lib/gestureRecognizerClient'

export type GestureModelPhase = 'idle' | 'loading' | 'ready' | 'error'

export interface GestureViewState {
  awaitingNeutral: boolean
  binding: GestureBinding | null
  confidence: number
  error: string
  gesture: GestureName | null
  modelPhase: GestureModelPhase
  progress: number
  processedFrames?: number
  pointerActivity?: PointerActivity
}

interface UseGestureControlOptions {
  active: boolean
  bindings: Record<GestureName, GestureBinding>
  enabled: boolean
  onAction: (action: GestureAction) => Promise<GestureActionResult>
  onGesture?: (gesture: GestureName) => boolean
  onPointerCommand?: (command: PointerCommand) => void
  pointerMode?: boolean
  videoRef: RefObject<HTMLVideoElement | null>
}

const GESTURE_INTERVAL_MS = 135
const POINTER_INTERVAL_MS = 75

const idleView: GestureViewState = {
  awaitingNeutral: false,
  binding: null,
  confidence: 0,
  error: '',
  gesture: null,
  modelPhase: 'idle',
  pointerActivity: 'idle',
  progress: 0,
  processedFrames: 0,
}

function stableView(next: GestureViewState): GestureViewState {
  return {
    ...next,
    confidence: Math.round(next.confidence * 100) / 100,
    progress: Math.round(next.progress * 20) / 20,
  }
}

function sameView(left: GestureViewState, right: GestureViewState) {
  return (
    left.awaitingNeutral === right.awaitingNeutral &&
    left.binding === right.binding &&
    left.confidence === right.confidence &&
    left.error === right.error &&
    left.gesture === right.gesture &&
    left.modelPhase === right.modelPhase &&
    left.pointerActivity === right.pointerActivity &&
    left.progress === right.progress
    && (left.processedFrames ?? 0) === (right.processedFrames ?? 0)
  )
}

export function useGestureControl({
  active,
  bindings,
  enabled,
  onAction,
  onGesture,
  onPointerCommand,
  pointerMode = false,
  videoRef,
}: UseGestureControlOptions) {
  const [view, setView] = useState<GestureViewState>(idleView)
  const viewRef = useRef<GestureViewState>(idleView)
  const recognizerRef = useRef<ReturnType<typeof createGestureRecognizerClient> | null>(null)
  const loadingRef = useRef<Promise<ReturnType<typeof createGestureRecognizerClient>> | null>(null)
  const frameRef = useRef<number | null>(null)
  const lastInferenceRef = useRef(0)
  const lastVideoTimeRef = useRef(-1)
  const machineRef = useRef({ ...initialGestureMachineState })
  const pointerStateRef = useRef({ ...initialAirPointerState })
  const pointerUiRef = useRef<{ activity: PointerActivity; until: number }>({
    activity: 'idle',
    until: 0,
  })
  const processedFramesRef = useRef(0)
  const visibilityEpochRef = useRef(0)
  const inferenceBusyRef = useRef(false)

  const publishView = useCallback((nextView: GestureViewState) => {
    const next = stableView(nextView)
    if (sameView(viewRef.current, next)) return
    viewRef.current = next
    setView(next)
  }, [])

  const loadRecognizer = useCallback(async () => {
    if (loadingRef.current) return loadingRef.current
    if (recognizerRef.current) return recognizerRef.current

    const loading = (async () => {
      const recognizer = createGestureRecognizerClient({
        wasmRoot: new URL('./wasm/', window.location.href).toString(),
        modelAssetPath: new URL('./models/gesture_recognizer.task', window.location.href).toString(),
      })
      recognizerRef.current = recognizer
      try {
        await recognizer.initialize()
      } catch (error) {
        recognizer.close()
        if (recognizerRef.current === recognizer) recognizerRef.current = null
        throw error
      }
      return recognizer
    })()
    loadingRef.current = loading

    try {
      return await loading
    } finally {
      if (loadingRef.current === loading) loadingRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!enabled || !active) {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
      machineRef.current = { ...initialGestureMachineState }
      pointerStateRef.current = { ...initialAirPointerState }
      pointerUiRef.current = { activity: 'idle', until: 0 }
      publishView(idleView)
      return
    }

    let cancelled = false
    visibilityEpochRef.current += 1
    const handleVisibilityChange = () => {
      if (!document.hidden) return
      visibilityEpochRef.current += 1
      machineRef.current = { ...initialGestureMachineState }
      pointerStateRef.current = disarmAirPointerState(pointerStateRef.current)
      pointerUiRef.current = { activity: 'idle', until: 0 }
      lastVideoTimeRef.current = -1
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    lastInferenceRef.current = 0
    lastVideoTimeRef.current = -1
    processedFramesRef.current = 0
    publishView({ ...idleView, modelPhase: 'loading' })

    const begin = async () => {
      try {
        const recognizer = await loadRecognizer()
        if (cancelled) return
        publishView({ ...idleView, modelPhase: 'ready' })

        const detect = async () => {
          if (cancelled) return
          const video = videoRef.current
          const now = performance.now()
          const interval = pointerMode ? POINTER_INTERVAL_MS : GESTURE_INTERVAL_MS

          if (
            !document.hidden &&
            !inferenceBusyRef.current &&
            video &&
            video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            video.currentTime !== lastVideoTimeRef.current &&
            now - lastInferenceRef.current >= interval
          ) {
            lastVideoTimeRef.current = video.currentTime
            lastInferenceRef.current = now
            const frameEpoch = visibilityEpochRef.current
            inferenceBusyRef.current = true
            try {
              const bitmap = await createImageBitmap(video)
              if (cancelled || document.hidden || frameEpoch !== visibilityEpochRef.current) {
                bitmap.close()
                if (!cancelled) frameRef.current = requestAnimationFrame(() => void detect())
                return
              }
              const result = await recognizer.detect(bitmap, now)
              if (cancelled || document.hidden || frameEpoch !== visibilityEpochRef.current) {
                if (!cancelled) frameRef.current = requestAnimationFrame(() => void detect())
                return
              }
              const category = result.gestures[0]?.[0]
              if (pointerMode) {
                processedFramesRef.current += 1
                const pointerResult = advanceAirPointer(pointerStateRef.current, {
                  confidence: category?.score ?? 0,
                  gesture: category?.categoryName ?? null,
                  landmarks: (result.landmarks[0] as HandLandmark[] | undefined) ?? null,
                  now,
                })
                pointerStateRef.current = pointerResult.state
                for (const command of pointerResult.commands) onPointerCommand?.(command)
                if (
                  pointerResult.activity === 'clicking' ||
                  pointerResult.activity === 'scrolling-up' ||
                  pointerResult.activity === 'scrolling-down'
                ) {
                  pointerUiRef.current = {
                    activity: pointerResult.activity,
                    until: now + 420,
                  }
                } else if (now >= pointerUiRef.current.until) {
                  pointerUiRef.current = { activity: pointerResult.activity, until: 0 }
                }
                const recognized = category?.categoryName
                publishView({
                  ...idleView,
                  gesture:
                    recognized && recognized in CODEX_GESTURE_BINDINGS
                      ? recognized as GestureName
                      : null,
                  modelPhase: 'ready',
                  pointerActivity: pointerUiRef.current.activity,
                  processedFrames: processedFramesRef.current,
                })
                frameRef.current = requestAnimationFrame(detect)
                return
              }
              const machineResult = advanceGestureMachine(machineRef.current, {
                name: category?.categoryName ?? null,
                confidence: category?.score ?? 0,
                now,
              }, bindings)
              machineRef.current = machineResult.state
              processedFramesRef.current += 1

              publishView({
                awaitingNeutral: machineResult.state.awaitingNeutral,
                binding: machineResult.binding,
                confidence: category?.score ?? 0,
                error: '',
                gesture: machineResult.state.candidate,
                modelPhase: 'ready',
                pointerActivity: 'idle',
                progress: machineResult.state.progress,
                processedFrames: processedFramesRef.current,
              })

              const handled = machineResult.gesture
                ? onGesture?.(machineResult.gesture) ?? false
                : false
              if (machineResult.action && !handled) {
                void Promise.resolve(onAction(machineResult.action)).catch((caught) => {
                  if (cancelled) return
                  publishView({
                    ...viewRef.current,
                    error:
                      caught instanceof Error ? caught.message : '手势动作执行失败',
                  })
                })
              }
            } catch (caught) {
              frameRef.current = null
              recognizer.close()
              if (recognizerRef.current === recognizer) recognizerRef.current = null
              if (!cancelled) {
                publishView({
                  ...viewRef.current,
                  modelPhase: 'error',
                  error:
                    caught instanceof Error ? caught.message : '手势识别运行失败',
                })
              }
              return
            } finally {
              inferenceBusyRef.current = false
            }
          }

          if (!cancelled) frameRef.current = requestAnimationFrame(() => void detect())
        }

        frameRef.current = requestAnimationFrame(() => void detect())
      } catch (caught) {
        if (cancelled) return
        publishView({
          ...idleView,
          modelPhase: 'error',
          error:
            caught instanceof Error
              ? caught.message
              : '手势识别模型无法启动',
        })
      }
    }

    void begin()

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
      lastInferenceRef.current = 0
      lastVideoTimeRef.current = -1
      processedFramesRef.current = 0
      machineRef.current = { ...initialGestureMachineState }
      pointerStateRef.current = { ...initialAirPointerState }
      pointerUiRef.current = { activity: 'idle', until: 0 }
    }
  }, [
    active,
    bindings,
    enabled,
    loadRecognizer,
    onAction,
    onGesture,
    onPointerCommand,
    pointerMode,
    publishView,
    videoRef,
  ])

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      recognizerRef.current?.close()
      recognizerRef.current = null
      loadingRef.current = null
    },
    [],
  )

  return view
}

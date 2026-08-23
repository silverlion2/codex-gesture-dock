import type { GestureRecognizer } from '@mediapipe/tasks-vision'
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
import { loadVisionRuntime } from '../lib/visionRuntime'

export type GestureModelPhase = 'idle' | 'loading' | 'ready' | 'error'

export interface GestureViewState {
  awaitingNeutral: boolean
  binding: GestureBinding | null
  confidence: number
  error: string
  gesture: GestureName | null
  modelPhase: GestureModelPhase
  progress: number
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
  const recognizerRef = useRef<GestureRecognizer | null>(null)
  const loadingRef = useRef<Promise<GestureRecognizer> | null>(null)
  const frameRef = useRef<number | null>(null)
  const lastInferenceRef = useRef(0)
  const lastVideoTimeRef = useRef(-1)
  const machineRef = useRef({ ...initialGestureMachineState })
  const pointerStateRef = useRef({ ...initialAirPointerState })
  const pointerUiRef = useRef<{ activity: PointerActivity; until: number }>({
    activity: 'idle',
    until: 0,
  })

  const publishView = useCallback((nextView: GestureViewState) => {
    const next = stableView(nextView)
    if (sameView(viewRef.current, next)) return
    viewRef.current = next
    setView(next)
  }, [])

  const loadRecognizer = useCallback(async () => {
    if (recognizerRef.current) return recognizerRef.current
    if (loadingRef.current) return loadingRef.current

    const wasmRoot = new URL('./wasm/', window.location.href).toString()
    const modelPath = new URL(
      './models/gesture_recognizer.task',
      window.location.href,
    ).toString()

    loadingRef.current = (async () => {
      const { FilesetResolver, GestureRecognizer } = await loadVisionRuntime()
      const vision = await FilesetResolver.forVisionTasks(wasmRoot)
      const recognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: { modelAssetPath: modelPath },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.58,
        minHandPresenceConfidence: 0.58,
        minTrackingConfidence: 0.55,
        cannedGesturesClassifierOptions: {
          scoreThreshold: 0.68,
          categoryAllowlist: Object.keys(CODEX_GESTURE_BINDINGS),
        },
      })
      recognizerRef.current = recognizer
      return recognizer
    })()

    try {
      return await loadingRef.current
    } finally {
      loadingRef.current = null
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
    const handleVisibilityChange = () => {
      if (!document.hidden) return
      machineRef.current = { ...initialGestureMachineState }
      pointerStateRef.current = disarmAirPointerState(pointerStateRef.current)
      pointerUiRef.current = { activity: 'idle', until: 0 }
      lastVideoTimeRef.current = -1
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    publishView({ ...idleView, modelPhase: 'loading' })

    const begin = async () => {
      try {
        const recognizer = await loadRecognizer()
        if (cancelled) return
        publishView({ ...idleView, modelPhase: 'ready' })

        const detect = () => {
          if (cancelled) return
          const video = videoRef.current
          const now = performance.now()
          const interval = pointerMode ? POINTER_INTERVAL_MS : GESTURE_INTERVAL_MS

          if (
            !document.hidden &&
            video &&
            video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            video.currentTime !== lastVideoTimeRef.current &&
            now - lastInferenceRef.current >= interval
          ) {
            lastVideoTimeRef.current = video.currentTime
            lastInferenceRef.current = now
            const result = recognizer.recognizeForVideo(video, now)
            const category = result.gestures[0]?.[0]
            if (pointerMode) {
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

            publishView({
              awaitingNeutral: machineResult.state.awaitingNeutral,
              binding: machineResult.binding,
              confidence: category?.score ?? 0,
              error: '',
              gesture: machineResult.state.candidate,
              modelPhase: 'ready',
              pointerActivity: 'idle',
              progress: machineResult.state.progress,
            })

            const handled = machineResult.gesture
              ? onGesture?.(machineResult.gesture) ?? false
              : false
            if (machineResult.action && !handled) {
              void onAction(machineResult.action)
            }
          }

          frameRef.current = requestAnimationFrame(detect)
        }

        frameRef.current = requestAnimationFrame(detect)
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
    },
    [],
  )

  return view
}

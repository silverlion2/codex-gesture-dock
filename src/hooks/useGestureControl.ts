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
}

interface UseGestureControlOptions {
  active: boolean
  bindings: Record<GestureName, GestureBinding>
  enabled: boolean
  onAction: (action: GestureAction) => Promise<GestureActionResult>
  onGesture?: (gesture: GestureName) => boolean
  videoRef: RefObject<HTMLVideoElement | null>
}

const GESTURE_INTERVAL_MS = 135

const idleView: GestureViewState = {
  awaitingNeutral: false,
  binding: null,
  confidence: 0,
  error: '',
  gesture: null,
  modelPhase: 'idle',
  progress: 0,
}

export function useGestureControl({
  active,
  bindings,
  enabled,
  onAction,
  onGesture,
  videoRef,
}: UseGestureControlOptions) {
  const [view, setView] = useState<GestureViewState>(idleView)
  const recognizerRef = useRef<GestureRecognizer | null>(null)
  const loadingRef = useRef<Promise<GestureRecognizer> | null>(null)
  const frameRef = useRef<number | null>(null)
  const lastInferenceRef = useRef(0)
  const lastVideoTimeRef = useRef(-1)
  const machineRef = useRef({ ...initialGestureMachineState })

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
      setView(idleView)
      return
    }

    let cancelled = false
    setView({ ...idleView, modelPhase: 'loading' })

    const begin = async () => {
      try {
        const recognizer = await loadRecognizer()
        if (cancelled) return
        setView({ ...idleView, modelPhase: 'ready' })

        const detect = () => {
          if (cancelled) return
          const video = videoRef.current
          const now = performance.now()

          if (
            video &&
            video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            video.currentTime !== lastVideoTimeRef.current &&
            now - lastInferenceRef.current >= GESTURE_INTERVAL_MS
          ) {
            lastVideoTimeRef.current = video.currentTime
            lastInferenceRef.current = now
            const result = recognizer.recognizeForVideo(video, now)
            const category = result.gestures[0]?.[0]
            const machineResult = advanceGestureMachine(machineRef.current, {
              name: category?.categoryName ?? null,
              confidence: category?.score ?? 0,
              now,
            }, bindings)
            machineRef.current = machineResult.state

            setView({
              awaitingNeutral: machineResult.state.awaitingNeutral,
              binding: machineResult.binding,
              confidence: category?.score ?? 0,
              error: '',
              gesture: machineResult.state.candidate,
              modelPhase: 'ready',
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
        setView({
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
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
      machineRef.current = { ...initialGestureMachineState }
    }
  }, [active, bindings, enabled, loadRecognizer, onAction, onGesture, videoRef])

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      recognizerRef.current?.close()
    },
    [],
  )

  return view
}

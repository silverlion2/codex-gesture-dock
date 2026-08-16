import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import {
  drawFaceMask,
  faceExpressionFromCategories,
  neutralFaceExpression,
  smoothFaceExpression,
  type FaceMaskExpression,
  type FaceMaskStyle,
} from '../lib/faceMasks'
import { loadVisionRuntime } from '../lib/visionRuntime'

export type FaceMaskPhase = 'idle' | 'loading' | 'tracking' | 'searching' | 'error'

interface UseFaceMaskOptions {
  active: boolean
  videoRef: RefObject<HTMLVideoElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  style: FaceMaskStyle
}

const INFERENCE_INTERVAL_MS = 50

export function useFaceMask({ active, videoRef, canvasRef, style }: UseFaceMaskOptions) {
  const [phase, setPhase] = useState<FaceMaskPhase>('idle')
  const [error, setError] = useState('')
  const [expression, setExpression] = useState<FaceMaskExpression>(neutralFaceExpression)
  const landmarkerRef = useRef<import('@mediapipe/tasks-vision').FaceLandmarker | null>(null)
  const frameRef = useRef<number | null>(null)
  const activeRef = useRef(active)
  const styleRef = useRef(style)
  const expressionRef = useRef(neutralFaceExpression)
  const lastInferenceRef = useRef(Number.NEGATIVE_INFINITY)
  const lastVideoTimeRef = useRef(-1)
  const lastUiUpdateRef = useRef(0)
  const requestRef = useRef(0)

  activeRef.current = active
  styleRef.current = style

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height)
  }, [canvasRef])

  const predict = useCallback(() => {
    if (!activeRef.current) return
    frameRef.current = requestAnimationFrame(predict)
    const video = videoRef.current
    const canvas = canvasRef.current
    const landmarker = landmarkerRef.current
    if (!video || !canvas || !landmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return

    const now = performance.now()
    if (video.currentTime === lastVideoTimeRef.current || now - lastInferenceRef.current < INFERENCE_INTERVAL_MS) return
    lastVideoTimeRef.current = video.currentTime
    lastInferenceRef.current = now

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
    }
    const context = canvas.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, canvas.width, canvas.height)

    try {
      const result = landmarker.detectForVideo(video, now)
      const landmarks = result.faceLandmarks[0]
      const categories = result.faceBlendshapes[0]?.categories ?? []
      if (!landmarks) {
        setPhase((current) => current === 'searching' ? current : 'searching')
        return
      }
      const nextExpression = smoothFaceExpression(
        expressionRef.current,
        faceExpressionFromCategories(categories),
      )
      expressionRef.current = nextExpression
      drawFaceMask(context, landmarks, nextExpression, styleRef.current, canvas.width, canvas.height, now)
      setPhase((current) => current === 'tracking' ? current : 'tracking')
      if (now - lastUiUpdateRef.current > 160) {
        lastUiUpdateRef.current = now
        setExpression(nextExpression)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '表情跟踪失败')
      setPhase('error')
      activeRef.current = false
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [canvasRef, videoRef])

  useEffect(() => {
    if (!active) {
      requestRef.current += 1
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
      clearCanvas()
      setPhase('idle')
      return
    }

    const request = ++requestRef.current
    setError('')
    setPhase('loading')
    const start = async () => {
      try {
        if (!landmarkerRef.current) {
          const { FaceLandmarker, FilesetResolver } = await loadVisionRuntime()
          const vision = await FilesetResolver.forVisionTasks(new URL('./wasm/', window.location.href).toString())
          const landmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: new URL('./models/face_landmarker.task', window.location.href).toString(),
            },
            runningMode: 'VIDEO',
            numFaces: 1,
            minFaceDetectionConfidence: 0.5,
            minFacePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
            outputFaceBlendshapes: true,
          })
          if (request !== requestRef.current) {
            landmarker.close()
            return
          }
          landmarkerRef.current = landmarker
        }
        if (request !== requestRef.current) return
        lastInferenceRef.current = Number.NEGATIVE_INFINITY
        lastVideoTimeRef.current = -1
        expressionRef.current = neutralFaceExpression
        frameRef.current = requestAnimationFrame(predict)
      } catch (caught) {
        if (request !== requestRef.current) return
        setError(caught instanceof Error ? caught.message : '无法加载本地表情模型')
        setPhase('error')
      }
    }
    void start()

    return () => {
      requestRef.current += 1
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
      clearCanvas()
    }
  }, [active, clearCanvas, predict])

  useEffect(() => () => landmarkerRef.current?.close(), [])

  return { phase, error, expression }
}

import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
} from '@mediapipe/tasks-vision'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import {
  averageFeatures,
  extractPostureFeatures,
  scorePosture,
  statusForScore,
  type Landmark,
  type PostureBaseline,
  type PostureFeatures,
  type PostureStatus,
} from '../lib/posture'
import { addDailySample, loadDailyStats, ratioFromStats } from '../lib/storage'

export type MonitorPhase =
  | 'idle'
  | 'loading'
  | 'calibrating'
  | 'monitoring'
  | 'ended'
  | 'error'

export interface TrendPoint {
  id: number
  status: Exclude<PostureStatus, 'away'>
}

export interface ReminderSettings {
  postureEnabled: boolean
  sensitivity: 'gentle' | 'medium' | 'strict'
  breakEnabled: boolean
  breakMinutes: number
  gestureEnabled: boolean
}

interface UsePoseMonitorOptions {
  videoRef: RefObject<HTMLVideoElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  settings: ReminderSettings
  onReminder: (message: string) => void
}

const CALIBRATION_MS = 4_000
const AWAY_GRACE_MS = 1_200
const MAX_TREND_POINTS = 42
const POSE_INFERENCE_INTERVAL_MS = 100

const reminderDelay: Record<ReminderSettings['sensitivity'], number> = {
  gentle: 15_000,
  medium: 10_000,
  strict: 6_000,
}

function notifyIfAllowed(title: string, body: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body })
  }
}

export function usePoseMonitor({
  videoRef,
  canvasRef,
  settings,
  onReminder,
}: UsePoseMonitorOptions) {
  const [phase, setPhaseState] = useState<MonitorPhase>('idle')
  const [error, setError] = useState('')
  const [score, setScore] = useState<number | null>(null)
  const [status, setStatus] = useState<PostureStatus>('away')
  const [calibrationProgress, setCalibrationProgress] = useState(0)
  const [sessionSeconds, setSessionSeconds] = useState(0)
  const [awayCount, setAwayCount] = useState(0)
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [todayRatio, setTodayRatio] = useState(() =>
    ratioFromStats(loadDailyStats()),
  )

  const phaseRef = useRef<MonitorPhase>('idle')
  const statusRef = useRef<PostureStatus>('away')
  const scoreRef = useRef<number | null>(null)
  const presenceRef = useRef(false)
  const landmarkerRef = useRef<PoseLandmarker | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef<number | null>(null)
  const lastInferenceRef = useRef(Number.NEGATIVE_INFINITY)
  const lastVideoTimeRef = useRef(-1)
  const lastUiUpdateRef = useRef(0)
  const lastSeenRef = useRef(0)
  const wasAwayRef = useRef(true)
  const baselineRef = useRef<PostureBaseline | null>(null)
  const calibrationSamplesRef = useRef<PostureFeatures[]>([])
  const calibrationStartRef = useRef<number | null>(null)
  const poorSinceRef = useRef<number | null>(null)
  const lastPostureReminderRef = useRef(0)
  const lastBreakReminderRef = useRef(0)
  const trendIdRef = useRef(0)
  const sessionRequestRef = useRef(0)
  const disposedRef = useRef(false)

  const setPhase = useCallback((next: MonitorPhase) => {
    phaseRef.current = next
    setPhaseState(next)
  }, [])

  const updateStatus = useCallback((next: PostureStatus) => {
    statusRef.current = next
    presenceRef.current = next !== 'away'
    setStatus(next)
  }, [])

  const resetCalibration = useCallback(() => {
    baselineRef.current = null
    calibrationSamplesRef.current = []
    calibrationStartRef.current = null
    setCalibrationProgress(0)
    scoreRef.current = null
    setScore(null)
    updateStatus('away')
    setPhase('calibrating')
  }, [setPhase, updateStatus])

  const drawPose = useCallback(
    (landmarks: Landmark[], poseStatus: PostureStatus) => {
      const canvas = canvasRef.current
      const video = videoRef.current
      if (!canvas || !video || !video.videoWidth || !video.videoHeight) return

      if (
        canvas.width !== video.videoWidth ||
        canvas.height !== video.videoHeight
      ) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
      }

      const context = canvas.getContext('2d')
      if (!context) return
      context.clearRect(0, 0, canvas.width, canvas.height)

      const color =
        poseStatus === 'poor'
          ? '#ff5a54'
          : poseStatus === 'fair'
            ? '#e8a31a'
            : '#35d477'

      const drawing = new DrawingUtils(context)
      drawing.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
        color,
        lineWidth: 4,
      })
      drawing.drawLandmarks(landmarks, {
        color: '#ffffff',
        fillColor: color,
        lineWidth: 2,
        radius: 4,
      })
    },
    [canvasRef, videoRef],
  )

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height)
  }, [canvasRef])

  const handleFeatures = useCallback(
    (features: PostureFeatures | null, now: number) => {
      if (phaseRef.current === 'calibrating') {
        if (!features) {
          calibrationStartRef.current = null
          calibrationSamplesRef.current = []
          setCalibrationProgress(0)
          updateStatus('away')
          return
        }

        updateStatus('good')
        calibrationStartRef.current ??= now
        calibrationSamplesRef.current.push(features)
        const elapsed = now - calibrationStartRef.current
        setCalibrationProgress(Math.min(1, elapsed / CALIBRATION_MS))

        if (elapsed >= CALIBRATION_MS) {
          const baseline = averageFeatures(calibrationSamplesRef.current)
          if (baseline) {
            baselineRef.current = baseline
            lastSeenRef.current = now
            wasAwayRef.current = false
            scoreRef.current = 100
            setScore(100)
            updateStatus('good')
            setPhase('monitoring')
          }
        }
        return
      }

      if (phaseRef.current !== 'monitoring') return

      if (!features) {
        if (now - lastSeenRef.current > AWAY_GRACE_MS) {
          if (!wasAwayRef.current) {
            wasAwayRef.current = true
            setAwayCount((count) => count + 1)
          }
          scoreRef.current = null
          setScore(null)
          updateStatus('away')
        }
        return
      }

      lastSeenRef.current = now
      wasAwayRef.current = false
      const baseline = baselineRef.current
      if (!baseline) return

      const rawScore = scorePosture(features, baseline)
      const smoothed = Math.round(
        scoreRef.current === null
          ? rawScore
          : scoreRef.current * 0.82 + rawScore * 0.18,
      )
      const nextStatus = statusForScore(smoothed)
      scoreRef.current = smoothed
      statusRef.current = nextStatus
      presenceRef.current = true

      if (now - lastUiUpdateRef.current > 140) {
        lastUiUpdateRef.current = now
        setScore(smoothed)
        setStatus(nextStatus)
      }
    },
    [setPhase, updateStatus],
  )

  const predict = useCallback(() => {
    if (phaseRef.current === 'ended') return

    // A camera can briefly have no current frame while it starts or recovers.
    // Keep the loop alive so a transient readiness gap does not end monitoring.
    frameRef.current = requestAnimationFrame(predict)

    const video = videoRef.current
    const landmarker = landmarkerRef.current

    if (
      !video ||
      !landmarker ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      return
    }

    const now = performance.now()
    if (
      video.currentTime === lastVideoTimeRef.current ||
      now - lastInferenceRef.current < POSE_INFERENCE_INTERVAL_MS
    ) return

    lastVideoTimeRef.current = video.currentTime
    lastInferenceRef.current = now
    const result = landmarker.detectForVideo(video, now)
    const landmarks = result.landmarks[0] as Landmark[] | undefined
    const features = landmarks ? extractPostureFeatures(landmarks) : null

    if (landmarks) drawPose(landmarks, statusRef.current)
    else clearCanvas()

    handleFeatures(features, now)
  }, [clearCanvas, drawPose, handleFeatures, videoRef])

  const loadLandmarker = useCallback(async () => {
    if (landmarkerRef.current) return landmarkerRef.current

    const wasmRoot = new URL('./wasm/', window.location.href).toString()
    const modelPath = new URL(
      './models/pose_landmarker_lite.task',
      window.location.href,
    ).toString()
    const vision = await FilesetResolver.forVisionTasks(wasmRoot)
    const baseOptions = {
      modelAssetPath: modelPath,
    }

    let landmarker: PoseLandmarker
    try {
      landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { ...baseOptions, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.55,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.55,
      })
    } catch {
      if (disposedRef.current) throw new DOMException('监测已取消', 'AbortError')
      landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions,
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.55,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.55,
      })
    }

    if (disposedRef.current) {
      landmarker.close()
      throw new DOMException('监测已取消', 'AbortError')
    }
    landmarkerRef.current = landmarker
    return landmarker
  }, [])

  const startSession = useCallback(async () => {
    const requestId = ++sessionRequestRef.current
    let acquiredStream: MediaStream | null = null
    setError('')
    setPhase('loading')
    setSessionSeconds(0)
    setAwayCount(0)
    setTrend([])
    lastBreakReminderRef.current = 0
    lastPostureReminderRef.current = 0
    poorSinceRef.current = null

    try {
      await loadLandmarker()
      if (requestId !== sessionRequestRef.current) return
      acquiredStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: false,
      })

      if (requestId !== sessionRequestRef.current) {
        acquiredStream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = acquiredStream
      const video = videoRef.current
      if (!video) throw new Error('找不到视频预览元素。')
      video.srcObject = acquiredStream
      await video.play()
      if (requestId !== sessionRequestRef.current) {
        acquiredStream.getTracks().forEach((track) => track.stop())
        if (streamRef.current === acquiredStream) streamRef.current = null
        if (video.srcObject === acquiredStream) video.srcObject = null
        return
      }
      lastInferenceRef.current = Number.NEGATIVE_INFINITY
      lastVideoTimeRef.current = -1
      resetCalibration()
      frameRef.current = requestAnimationFrame(predict)
    } catch (caught) {
      acquiredStream?.getTracks().forEach((track) => track.stop())
      if (streamRef.current === acquiredStream) streamRef.current = null
      const video = videoRef.current
      if (video && video.srcObject === acquiredStream) video.srcObject = null
      if (requestId !== sessionRequestRef.current) return
      const message =
        caught instanceof DOMException && caught.name === 'NotAllowedError'
          ? '摄像头权限被拒绝。请在浏览器地址栏重新允许访问。'
          : caught instanceof Error
            ? caught.message
            : '无法启动摄像头，请检查设备是否被其他应用占用。'
      setError(message)
      setPhase('error')
    }
  }, [loadLandmarker, predict, resetCalibration, setPhase, videoRef])

  const stopSession = useCallback(() => {
    sessionRequestRef.current += 1
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    const video = videoRef.current
    if (video) video.srcObject = null
    clearCanvas()
    setPhase('ended')
  }, [clearCanvas, setPhase, videoRef])

  useEffect(() => {
    if (phase !== 'monitoring') return

    const interval = window.setInterval(() => {
      const currentStatus = statusRef.current

      if (presenceRef.current) {
        setSessionSeconds((seconds) => {
          const next = seconds + 1
          if (
            settings.breakEnabled &&
            next >= settings.breakMinutes * 60 &&
            next - lastBreakReminderRef.current >= settings.breakMinutes * 60
          ) {
            lastBreakReminderRef.current = next
            onReminder('起来走一走，看看远处，让身体休息一下。')
            notifyIfAllowed('该休息了', '起来走一走，看看远处。')
          }
          return next
        })

        if (currentStatus !== 'away') {
          const daily = addDailySample(currentStatus === 'good')
          setTodayRatio(ratioFromStats(daily))
          setTrend((points) => [
            ...points.slice(-(MAX_TREND_POINTS - 1)),
            { id: trendIdRef.current++, status: currentStatus },
          ])
        }
      }

      if (settings.postureEnabled && currentStatus === 'poor') {
        poorSinceRef.current ??= Date.now()
        const poorFor = Date.now() - poorSinceRef.current
        if (
          poorFor >= reminderDelay[settings.sensitivity] &&
          Date.now() - lastPostureReminderRef.current > 60_000
        ) {
          lastPostureReminderRef.current = Date.now()
          onReminder('肩膀放松，头部轻轻向后收，回到校准姿势。')
          notifyIfAllowed('调整一下坐姿', '肩膀放松，头部轻轻向后收。')
        }
      } else {
        poorSinceRef.current = null
      }
    }, 1_000)

    return () => window.clearInterval(interval)
  }, [onReminder, phase, settings])

  useEffect(() => {
    disposedRef.current = false
    const video = videoRef.current
    return () => {
      disposedRef.current = true
      sessionRequestRef.current += 1
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      streamRef.current?.getTracks().forEach((track) => track.stop())
      if (video) video.srcObject = null
      landmarkerRef.current?.close()
    }
  }, [videoRef])

  return {
    phase,
    error,
    score,
    status,
    calibrationProgress,
    sessionSeconds,
    awayCount,
    trend,
    todayRatio,
    startSession,
    stopSession,
    recalibrate: resetCalibration,
  }
}

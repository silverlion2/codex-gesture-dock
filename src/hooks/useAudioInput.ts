import { useCallback, useEffect, useRef, useState } from 'react'

export type AudioInputPhase = 'idle' | 'loading' | 'active' | 'error'

interface UseAudioInputOptions {
  deviceId: string
  onActivated?: () => void
}

const METER_INTERVAL_MS = 90

export function useAudioInput({
  deviceId,
  onActivated,
}: UseAudioInputOptions) {
  const [phase, setPhase] = useState<AudioInputPhase>('idle')
  const [level, setLevel] = useState(0)
  const [error, setError] = useState('')
  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const requestRef = useRef(0)
  const lastMeterUpdateRef = useRef(0)

  const releaseResources = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (contextRef.current) void contextRef.current.close().catch(() => {})
    contextRef.current = null
    lastMeterUpdateRef.current = 0
    setLevel(0)
  }, [])

  const stop = useCallback(() => {
    requestRef.current += 1
    releaseResources()
    setError('')
    setPhase('idle')
  }, [releaseResources])

  const start = useCallback(
    async (deviceOverride?: string) => {
      const requestId = ++requestRef.current
      const requestedDeviceId = deviceOverride ?? deviceId
      releaseResources()
      setError('')
      setPhase('loading')

      let stream: MediaStream | null = null
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: requestedDeviceId
            ? {
                deviceId: { exact: requestedDeviceId },
                echoCancellation: true,
                noiseSuppression: true,
              }
            : {
                echoCancellation: true,
                noiseSuppression: true,
              },
        })

        if (requestId !== requestRef.current) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream
        const context = new AudioContext()
        const analyser = context.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.7
        context.createMediaStreamSource(stream).connect(analyser)
        contextRef.current = context
        const samples = new Uint8Array(analyser.fftSize)

        const updateMeter = (now: number) => {
          if (requestId !== requestRef.current) return
          animationFrameRef.current = requestAnimationFrame(updateMeter)
          if (now - lastMeterUpdateRef.current < METER_INTERVAL_MS) return
          lastMeterUpdateRef.current = now
          analyser.getByteTimeDomainData(samples)
          let sum = 0
          for (const sample of samples) {
            const normalized = (sample - 128) / 128
            sum += normalized * normalized
          }
          const rms = Math.sqrt(sum / samples.length)
          setLevel(Math.min(1, rms * 3.2))
        }

        animationFrameRef.current = requestAnimationFrame(updateMeter)
        setPhase('active')
        onActivated?.()
      } catch (caught) {
        stream?.getTracks().forEach((track) => track.stop())
        if (requestId !== requestRef.current) return
        releaseResources()
        setError(
          caught instanceof DOMException && caught.name === 'NotAllowedError'
            ? '麦克风权限被拒绝，请在系统设置中允许后重试。'
            : caught instanceof Error
              ? caught.message
              : '无法启动麦克风，请检查设备是否可用。',
        )
        setPhase('error')
      }
    },
    [deviceId, onActivated, releaseResources],
  )

  useEffect(
    () => () => {
      requestRef.current += 1
      releaseResources()
    },
    [releaseResources],
  )

  return { phase, level, error, start, stop }
}

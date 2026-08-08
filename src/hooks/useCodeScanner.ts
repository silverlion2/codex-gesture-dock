import { useEffect, useRef, useState, type RefObject } from 'react'

export interface CodeScanResult {
  text: string
  format: string
}
export type CodeScannerPhase = 'idle' | 'loading' | 'scanning' | 'detected' | 'error'

interface UseCodeScannerOptions {
  active: boolean
  videoRef: RefObject<HTMLVideoElement | null>
}

export function useCodeScanner({ active, videoRef }: UseCodeScannerOptions) {
  const [phase, setPhase] = useState<CodeScannerPhase>('idle')
  const [result, setResult] = useState<CodeScanResult | null>(null)
  const [error, setError] = useState('')
  const lastTextRef = useRef('')

  useEffect(() => {
    if (!active) {
      setPhase('idle')
      return
    }

    const video = videoRef.current
    if (!video) {
      setPhase('error')
      setError('找不到摄像头预览')
      return
    }

    let disposed = false
    let stopScanner: (() => void) | undefined
    setPhase('loading')
    setError('')

    void import('@zxing/browser')
      .then(async ({ BarcodeFormat, BrowserMultiFormatReader }) => {
        if (disposed) return
        const reader = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 250,
          delayBetweenScanSuccess: 1_200,
        })
        const controls = await reader.decodeFromVideoElement(video, (nextResult) => {
          if (disposed || !nextResult) return
          const text = nextResult.getText()
          if (text === lastTextRef.current) return
          lastTextRef.current = text
          setResult({
            text,
            format: BarcodeFormat[nextResult.getBarcodeFormat()] ?? 'CODE',
          })
          setPhase('detected')
        })
        if (disposed) controls.stop()
        else {
          stopScanner = () => controls.stop()
          setPhase((current) => (current === 'detected' ? current : 'scanning'))
        }
      })
      .catch((caught) => {
        if (disposed) return
        setPhase('error')
        setError(caught instanceof Error ? caught.message : '扫码组件启动失败')
      })

    return () => {
      disposed = true
      stopScanner?.()
    }
  }, [active, videoRef])

  const clearResult = () => {
    lastTextRef.current = ''
    setResult(null)
    setPhase(active ? 'scanning' : 'idle')
  }

  return { phase, result, error, clearResult }
}

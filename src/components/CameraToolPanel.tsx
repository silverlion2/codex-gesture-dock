import { Check, Copy, ScanLine, ShieldCheck } from 'lucide-react'
import { useId, useState, type RefObject } from 'react'
import type { CodeScannerPhase, CodeScanResult } from '../hooks/useCodeScanner'
import { DocumentToolPanel } from './DocumentToolPanel'

interface CameraToolPanelProps {
  mode: 'codes' | 'document'
  videoRef: RefObject<HTMLVideoElement | null>
  mirrored: boolean
  sessionReady: boolean
  scanPhase: CodeScannerPhase
  scanResult: CodeScanResult | null
  scanError: string
  onClearScan: () => void
  onMessage: (message: string) => void
}
export function CameraToolPanel({
  mode,
  videoRef,
  mirrored,
  sessionReady,
  scanPhase,
  scanResult,
  scanError,
  onClearScan,
  onMessage,
}: CameraToolPanelProps) {
  const [copied, setCopied] = useState(false)
  const [imageResult, setImageResult] = useState<CodeScanResult | null>(null)
  const [imagePhase, setImagePhase] = useState<'idle' | 'decoding' | 'error'>('idle')
  const [imageError, setImageError] = useState('')
  const codeImageInputId = useId()
  const effectiveResult = imageResult ?? scanResult

  const copyResult = async () => {
    if (!effectiveResult) return
    try {
      await navigator.clipboard.writeText(effectiveResult.text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_500)
    } catch {
      onMessage('无法写入剪贴板，请手动复制结果')
    }
  }

  const importCodeImage = async (file: File) => {
    setImagePhase('decoding')
    setImageError('')
    setImageResult(null)
    setCopied(false)
    try {
      const { decodeCodeImage } = await import('../lib/codeImageScanner')
      const result = await decodeCodeImage(file)
      setImageResult(result)
      setImagePhase('idle')
      onMessage(`已在本机从图片识别 ${result.format.replaceAll('_', ' ')}`)
    } catch (caught) {
      setImagePhase('error')
      setImageError(caught instanceof Error ? caught.message : '无法识别这张扫码图片')
    }
  }

  const clearResult = () => {
    setImageResult(null)
    setImageError('')
    setImagePhase('idle')
    setCopied(false)
    onClearScan()
  }

  if (mode === 'codes') {
    return (
      <section className="camera-tool-panel code-tool-panel" aria-label="扫码结果">
        <header>
          <div><ScanLine size={17} aria-hidden="true" /><strong>QR 与条码扫描</strong></div>
          <span><ShieldCheck size={13} aria-hidden="true" />仅本机识别</span>
        </header>
        <div className="code-image-import">
          <label htmlFor={codeImageInputId}><ScanLine size={14} aria-hidden="true" />从图片识别</label>
          <input
            id={codeImageInputId}
            className="sr-only"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/bmp"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void importCodeImage(file)
              event.target.value = ''
            }}
          />
          <small>截图和照片只在本机解码，最大 35 MB</small>
        </div>
        {imagePhase === 'decoding' ? (
          <div className="scanner-status" role="status"><span className="small-spinner" aria-hidden="true" /><div><strong>正在识别本机图片</strong><small>请保持窗口打开</small></div></div>
        ) : effectiveResult ? (
          <div className="scan-result" aria-live="polite">
            <span>{effectiveResult.format.replaceAll('_', ' ')}{imageResult ? ' · 图片' : ' · 摄像头'}</span>
            <strong>{effectiveResult.text}</strong>
            <div>
              <button type="button" onClick={() => void copyResult()}>
                {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                {copied ? '已复制' : '复制内容'}
              </button>
              <button type="button" onClick={clearResult}>继续扫描</button>
            </div>
          </div>
        ) : imagePhase === 'error' ? (
          <div className="document-scan-error" role="alert"><strong>{imageError}</strong><small>可换一张图片，或启动摄像头继续实时扫描</small></div>
        ) : !sessionReady ? (
          <div className="tool-empty-state">也可点击“开始监测”启动摄像头，把码放进取景框。</div>
        ) : (
          <div className="scanner-status" role="status">
            <span className={scanPhase === 'loading' ? 'small-spinner' : 'scanner-pulse'} aria-hidden="true" />
            <div>
              <strong>{scanPhase === 'error' ? '扫描器没有启动' : scanPhase === 'loading' ? '正在加载扫码组件' : '正在寻找二维码或条码'}</strong>
              <small>{scanPhase === 'error' ? scanError : '支持 QR、Data Matrix、EAN、UPC、Code 128 等常用格式'}</small>
            </div>
          </div>
        )}
      </section>
    )
  }

  return <DocumentToolPanel videoRef={videoRef} mirrored={mirrored} sessionReady={sessionReady} onMessage={onMessage} />
}

export default CameraToolPanel

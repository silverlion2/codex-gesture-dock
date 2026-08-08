import { Check, Copy, ScanLine, ShieldCheck } from 'lucide-react'
import { useState, type RefObject } from 'react'
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

  const copyResult = async () => {
    if (!scanResult) return
    try {
      await navigator.clipboard.writeText(scanResult.text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_500)
    } catch {
      onMessage('无法写入剪贴板，请手动复制结果')
    }
  }

  if (mode === 'codes') {
    return (
      <section className="camera-tool-panel code-tool-panel" aria-label="扫码结果">
        <header>
          <div><ScanLine size={17} aria-hidden="true" /><strong>QR 与条码扫描</strong></div>
          <span><ShieldCheck size={13} aria-hidden="true" />仅本机识别</span>
        </header>
        {!sessionReady ? (
          <div className="tool-empty-state">先点击“开始监测”启动摄像头，再把码放进取景框。</div>
        ) : scanResult ? (
          <div className="scan-result" aria-live="polite">
            <span>{scanResult.format.replaceAll('_', ' ')}</span>
            <strong>{scanResult.text}</strong>
            <div>
              <button type="button" onClick={() => void copyResult()}>
                {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                {copied ? '已复制' : '复制内容'}
              </button>
              <button type="button" onClick={onClearScan}>继续扫描</button>
            </div>
          </div>
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

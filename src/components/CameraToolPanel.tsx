import { Check, Copy, Download, FileScan, ScanLine, ShieldCheck } from 'lucide-react'
import { useState, type RefObject } from 'react'
import type { CodeScannerPhase, CodeScanResult } from '../hooks/useCodeScanner'
import {
  captureVideoFrame,
  downloadCapturedDocument,
  type CameraMode,
  type CapturedDocument,
} from '../lib/cameraTools'

interface CameraToolPanelProps {
  mode: Exclude<CameraMode, 'monitor'>
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
  const [capture, setCapture] = useState<CapturedDocument | null>(null)
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

  const takeSnapshot = () => {
    const video = videoRef.current
    if (!video) return
    try {
      setCapture(captureVideoFrame(video, mirrored))
      onMessage('扫描图已在本机生成，确认后再保存')
    } catch (caught) {
      onMessage(caught instanceof Error ? caught.message : '文档扫描失败')
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

  return (
    <section className="camera-tool-panel document-tool-panel" aria-label="文档扫描">
      <header>
        <div><FileScan size={17} aria-hidden="true" /><strong>文档快照</strong></div>
        <span><ShieldCheck size={13} aria-hidden="true" />不会自动保存</span>
      </header>
      {capture ? (
        <div className="document-preview">
          <img src={capture.dataUrl} alt="刚刚捕获的文档扫描预览" />
          <div>
            <button type="button" onClick={() => downloadCapturedDocument(capture)}>
              <Download size={15} aria-hidden="true" />保存 PNG
            </button>
            <button type="button" onClick={() => setCapture(null)}>重新拍摄</button>
          </div>
        </div>
      ) : (
        <div className="document-capture-state">
          <p>将纸张放进取景框并尽量保持平整、光线均匀。画面只在点击拍摄后进入内存。</p>
          <button type="button" disabled={!sessionReady} onClick={takeSnapshot}>
            <FileScan size={16} aria-hidden="true" />
            {sessionReady ? '拍摄文档' : '请先启动摄像头'}
          </button>
        </div>
      )}
    </section>
  )
}

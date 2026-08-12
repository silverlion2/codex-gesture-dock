import {
  Check,
  ContactRound,
  Copy,
  Download,
  EyeOff,
  FileScan,
  FileText,
  GitCompare,
  ImageMinus,
  Palette,
  Play,
  ScanFace,
  ScanLine,
  ScanSearch,
  Square,
} from 'lucide-react'
import { useState, type ReactNode, type RefObject } from 'react'
import type { CodeScannerPhase, CodeScanResult } from '../hooks/useCodeScanner'
import type { MonitorPhase } from '../hooks/usePoseMonitor'
import {
  captureVideoFrame,
  downloadCapturedDocument,
  type CameraMode,
  type CapturedDocument,
} from '../lib/cameraTools'
import { statusLabel, type PostureStatus } from '../lib/posture'

interface MiniCameraControlsProps {
  mode: CameraMode
  phase: MonitorPhase
  status: PostureStatus
  score: number | null
  actionLabel: string
  mirrored: boolean
  videoRef: RefObject<HTMLVideoElement | null>
  scanPhase: CodeScannerPhase
  scanResult: CodeScanResult | null
  scanError: string
  mediaControls: ReactNode
  onClearScan: () => void
  onSessionToggle: () => void
  onMessage: (message: string) => void
}

function monitorSummary(phase: MonitorPhase, status: PostureStatus) {
  if (phase === 'monitoring') return statusLabel[status]
  if (phase === 'loading') return '正在准备本地模型'
  if (phase === 'calibrating') return '正在校准坐姿'
  if (phase === 'error') return '摄像头需要重试'
  if (phase === 'ended') return '本次监测已结束'
  return '摄像头待命'
}

function scannerSummary(
  phase: MonitorPhase,
  scanPhase: CodeScannerPhase,
  scanError: string,
) {
  if (phase !== 'monitoring') return '先启动摄像头再扫码'
  if (scanPhase === 'loading') return '正在加载本地扫码器'
  if (scanPhase === 'error') return scanError || '扫码器启动失败'
  return '将二维码或条码放入取景框'
}

export function MiniCameraControls({
  mode,
  phase,
  status,
  score,
  actionLabel,
  mirrored,
  videoRef,
  scanPhase,
  scanResult,
  scanError,
  mediaControls,
  onClearScan,
  onSessionToggle,
  onMessage,
}: MiniCameraControlsProps) {
  const [capture, setCapture] = useState<CapturedDocument | null>(null)
  const [copied, setCopied] = useState(false)
  const sessionActive = ['loading', 'calibrating', 'monitoring'].includes(phase)
  const sessionReady = phase === 'monitoring'

  const copyScanResult = async () => {
    if (!scanResult) return
    try {
      await navigator.clipboard.writeText(scanResult.text)
      setCopied(true)
      onMessage('扫描结果已复制')
      window.setTimeout(() => setCopied(false), 1_500)
    } catch {
      onMessage('无法写入剪贴板，请打开完整面板查看结果')
    }
  }

  const takeSnapshot = () => {
    const video = videoRef.current
    if (!video) return
    try {
      setCapture(captureVideoFrame(video, mirrored))
      onMessage('文档快照已生成，请确认后保存')
    } catch (caught) {
      onMessage(caught instanceof Error ? caught.message : '文档拍摄失败')
    }
  }

  if (mode === 'monitor') {
    return (
      <section className="mini-camera-controls" aria-label="迷你姿态控制">
        <div className={`mini-camera-reading status-${status}`} aria-live="polite">
          <span className="mini-status-dot" aria-hidden="true" />
          <div>
            <strong>{phase === 'monitoring' && score !== null ? score : '—'}</strong>
            <small>{monitorSummary(phase, status)}</small>
          </div>
        </div>
        <div className="mini-control-actions">
          <button
            className={`mini-camera-primary ${sessionActive ? 'is-stop' : ''}`}
            type="button"
            onClick={onSessionToggle}
          >
            {sessionActive ? (
              <Square size={13} aria-hidden="true" />
            ) : (
              <Play size={14} aria-hidden="true" />
            )}
            {actionLabel}
          </button>
          {mediaControls}
        </div>
      </section>
    )
  }

  if (mode === 'codes') {
    return (
      <section className="mini-camera-controls" aria-label="迷你扫码控制">
        <div className="mini-tool-reading" aria-live="polite">
          <ScanLine size={17} aria-hidden="true" />
          <div>
            <strong>{scanResult ? scanResult.text : 'QR / 条码扫描'}</strong>
            <small>
              {scanResult
                ? scanResult.format.replaceAll('_', ' ')
                : scannerSummary(phase, scanPhase, scanError)}
            </small>
          </div>
        </div>
        <div className="mini-control-actions">
          {scanResult ? (
            <div className="mini-tool-actions">
              <button type="button" aria-label="复制扫描结果" onClick={() => void copyScanResult()}>
                {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
              </button>
              <button type="button" aria-label="继续扫码" onClick={onClearScan}>
                <ScanLine size={15} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button
              className={`mini-camera-primary ${sessionActive ? 'is-stop' : ''}`}
              type="button"
              onClick={onSessionToggle}
            >
              {sessionActive ? <Square size={13} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
              {sessionActive ? '停止' : '启动'}
            </button>
          )}
          {mediaControls}
        </div>
      </section>
    )
  }

  if (mode === 'masks' || mode === 'ocr' || mode === 'card' || mode === 'privacy' || mode === 'background' || mode === 'objects' || mode === 'compare' || mode === 'colors') {
    const Icon = mode === 'masks' ? ScanFace : mode === 'card' ? ContactRound : mode === 'privacy' ? EyeOff : mode === 'background' ? ImageMinus : mode === 'objects' ? ScanSearch : mode === 'compare' ? GitCompare : mode === 'colors' ? Palette : FileText
    return (
      <section className="mini-camera-controls" aria-label={mode === 'masks' ? '迷你动态面具控制' : mode === 'card' ? '迷你名片 OCR 控制' : mode === 'privacy' ? '迷你人脸隐私控制' : mode === 'background' ? '迷你人物背景控制' : mode === 'objects' ? '迷你物体识别控制' : mode === 'compare' ? '迷你图片对比控制' : mode === 'colors' ? '迷你颜色分析控制' : '迷你文件 OCR 控制'}>
        <div className="mini-tool-reading">
          <Icon size={17} aria-hidden="true" />
          <div>
            <strong>{mode === 'masks' ? '表情动态面具' : mode === 'card' ? '名片 OCR' : mode === 'privacy' ? '人脸隐私' : mode === 'background' ? '人物背景' : mode === 'objects' ? '物体识别' : mode === 'compare' ? '图片对比' : mode === 'colors' ? '颜色实验室' : '文件 OCR'}</strong>
            <small>{mode === 'masks' ? sessionReady ? '面具正在跟随表情' : sessionActive ? '正在准备面具跟踪' : '启动摄像头后开始跟踪' : '点击右上角展开，在完整面板中选择文件'}</small>
          </div>
        </div>
        <div className="mini-control-actions">
          {mode === 'masks' && !sessionActive ? (
            <button className="mini-camera-primary" type="button" onClick={onSessionToggle}><Play size={14} aria-hidden="true" />启动</button>
          ) : null}
          {mediaControls}
        </div>
      </section>
    )
  }

  return (
    <section className="mini-camera-controls" aria-label="迷你文档拍摄控制">
      <div className="mini-tool-reading" aria-live="polite">
        {capture ? (
          <img src={capture.dataUrl} alt="刚拍摄的文档缩略图" />
        ) : (
          <FileScan size={17} aria-hidden="true" />
        )}
        <div>
          <strong>{capture ? '文档快照已就绪' : '文档快照'}</strong>
          <small>{capture ? capture.filename : sessionReady ? '对齐纸张后拍摄' : '先启动摄像头'}</small>
        </div>
      </div>
      <div className="mini-control-actions">
        {capture ? (
          <div className="mini-tool-actions">
            <button
              type="button"
              aria-label="保存文档 PNG"
              onClick={() => downloadCapturedDocument(capture)}
            >
              <Download size={15} aria-hidden="true" />
            </button>
            <button type="button" aria-label="重新拍摄文档" onClick={() => setCapture(null)}>
              <FileScan size={15} aria-hidden="true" />
            </button>
          </div>
        ) : sessionReady ? (
          <button className="mini-camera-primary" type="button" onClick={takeSnapshot}>
            <FileScan size={14} aria-hidden="true" />
            拍摄
          </button>
        ) : (
          <button className="mini-camera-primary" type="button" onClick={onSessionToggle}>
            <Play size={14} aria-hidden="true" />
            启动
          </button>
        )}
        {mediaControls}
      </div>
    </section>
  )
}

import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ContactRound,
  FileText,
  FlipHorizontal2,
  GitCompare,
  Hand,
  EyeOff,
  ImageMinus,
  RotateCcw,
} from 'lucide-react'
import type { RefObject } from 'react'
import type { GestureViewState } from '../hooks/useGestureControl'
import type { MonitorPhase } from '../hooks/usePoseMonitor'
import type { CodeScannerPhase } from '../hooks/useCodeScanner'
import type { CameraMode } from '../lib/cameraTools'
import type { CameraFraming } from '../lib/mediaPreferences'
import { statusLabel, type PostureStatus } from '../lib/posture'

interface CompactCameraProps {
  videoRef: RefObject<HTMLVideoElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  phase: MonitorPhase
  status: PostureStatus
  error: string
  calibrationProgress: number
  gesture: GestureViewState
  gestureEnabled: boolean
  mode: CameraMode
  mirrored: boolean
  framing: CameraFraming
  scanPhase: CodeScannerPhase
  onMirrorToggle: () => void
  onRecalibrate: () => void
}

export function CompactCamera({
  videoRef,
  canvasRef,
  phase,
  status,
  error,
  calibrationProgress,
  gesture,
  gestureEnabled,
  mode,
  mirrored,
  framing,
  scanPhase,
  onMirrorToggle,
  onRecalibrate,
}: CompactCameraProps) {
  const fileMode = mode === 'ocr' || mode === 'card' || mode === 'privacy' || mode === 'background' || mode === 'compare'

  return (
    <section
      className={`compact-camera camera-mode-${mode} framing-${framing} ${mirrored ? 'is-mirrored' : ''}`}
      aria-label="摄像头预览"
    >
      <video ref={videoRef} autoPlay muted playsInline aria-label="实时摄像头画面" />
      <canvas ref={canvasRef} aria-hidden="true" hidden={mode !== 'monitor'} />

      {!fileMode && (
        <button
          className="mirror-camera-button"
          type="button"
          aria-pressed={mirrored}
          onClick={onMirrorToggle}
        >
          <FlipHorizontal2 size={14} aria-hidden="true" />
          {mirrored ? '镜像' : '原图'}
        </button>
      )}

      {fileMode && (
        <div className="camera-placeholder file-ocr-placeholder">
          {mode === 'card' ? <ContactRound size={31} aria-hidden="true" /> : mode === 'privacy' ? <EyeOff size={31} aria-hidden="true" /> : mode === 'background' ? <ImageMinus size={31} aria-hidden="true" /> : mode === 'compare' ? <GitCompare size={31} aria-hidden="true" /> : <FileText size={31} aria-hidden="true" />}
          <strong>{mode === 'card' ? '名片 OCR' : mode === 'privacy' ? '人脸隐私' : mode === 'background' ? '人物背景' : mode === 'compare' ? '图片对比' : '文件 OCR'}</strong>
          <span>{mode === 'card' ? '在下方导入名片照片，识别后确认联系人信息' : mode === 'privacy' ? '在下方导入照片，本机检测并隐藏人脸' : mode === 'background' ? '在下方导入人物照片，本机移除、模糊或替换背景' : mode === 'compare' ? '在下方导入两张图片，本机滑动对照并生成差异热图' : '在下方导入图像或 PDF，全程本机处理'}</span>
        </div>
      )}

      {!fileMode && phase === 'idle' && (
        <div className="camera-placeholder">
          <Camera size={28} aria-hidden="true" />
          <strong>准备开始</strong>
          <span>坐直后点击下方开始监测</span>
        </div>
      )}

      {!fileMode && phase === 'loading' && (
        <div className="camera-placeholder" role="status">
          <span className="small-spinner" aria-hidden="true" />
          <strong>正在准备本地模型</strong>
        </div>
      )}

      {!fileMode && phase === 'error' && (
        <div className="camera-placeholder camera-error" role="alert">
          <AlertCircle size={25} aria-hidden="true" />
          <strong>摄像头没有启动</strong>
          <span>{error}</span>
        </div>
      )}

      {!fileMode && phase === 'ended' && (
        <div className="camera-placeholder">
          <CheckCircle2 size={27} aria-hidden="true" />
          <strong>本次已结束</strong>
          <span>需要时可以再次开始</span>
        </div>
      )}

      {!fileMode && phase === 'calibrating' && (
        <div className="compact-calibration" role="status">
          <strong>{Math.max(1, Math.ceil(4 - calibrationProgress * 4))}</strong>
          <span>{status === 'away' ? '让头部和双肩进入画面' : '保持自然坐直'}</span>
          <i aria-hidden="true">
            <b style={{ width: `${calibrationProgress * 100}%` }} />
          </i>
        </div>
      )}

      {phase === 'monitoring' && mode === 'monitor' && (
        <>
          <div className={`camera-status status-${status}`} aria-live="polite">
            <span />
            {statusLabel[status]}
          </div>
          <button
            className="recalibrate-button"
            type="button"
            onClick={onRecalibrate}
          >
            <RotateCcw size={15} aria-hidden="true" />
            重新校准
          </button>
        </>
      )}

      {gestureEnabled && phase === 'monitoring' && mode === 'monitor' && (
        <div
          className={`gesture-live ${gesture.binding ? 'has-gesture' : ''}`}
          aria-live="polite"
        >
          <Hand size={15} aria-hidden="true" />
          <div>
            <strong>
              {gesture.modelPhase === 'loading'
                ? '加载手势模型'
                : gesture.modelPhase === 'error'
                  ? '手势模型异常'
                  : gesture.awaitingNeutral
                    ? '松开手势以继续'
                    : gesture.binding
                      ? `${gesture.binding.symbol} ${gesture.binding.actionLabel}`
                      : '等待 Codex 手势'}
            </strong>
            <i aria-hidden="true">
              <b style={{ width: `${gesture.progress * 100}%` }} />
            </i>
          </div>
        </div>
      )}

      {phase === 'monitoring' && mode === 'codes' && (
        <div className="code-scan-guide" aria-hidden="true">
          <i /><i /><i /><i />
          <span>{scanPhase === 'detected' ? '已识别' : '将二维码或条码放入框内'}</span>
        </div>
      )}

      {phase === 'monitoring' && mode === 'document' && (
        <div className="document-scan-guide" aria-hidden="true">
          <i /><i /><i /><i />
          <span>对齐纸张边缘</span>
        </div>
      )}

    </section>
  )
}

import { Check, Clipboard, Download, RotateCcw, ScanSearch, ShieldCheck, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { captureVideoFrame, type CapturedDocument } from '../lib/cameraTools'
import { captureFromImageFile } from '../lib/documentScanner'
import {
  buildObjectDetectionJson,
  BUNDLED_OBJECT_MODEL,
  detectObjects,
  importObjectDetectionModel,
  loadObjectDetectionLabels,
  objectAnnotatedFilename,
  prepareObjectDetectionModel,
  releaseObjectDetectionModel,
  renderObjectAnnotations,
  type DetectedObject,
  type ObjectDetectionModel,
} from '../lib/objectDetection'

interface ObjectDetectionPanelProps {
  videoRef: RefObject<HTMLVideoElement | null>
  mirrored: boolean
  sessionReady: boolean
  onMessage: (message: string) => void
}

type ObjectDetectionPhase = 'idle' | 'detecting' | 'ready' | 'exporting' | 'error'

function downloadAnnotatedPhoto(dataUrl: string, filename: string) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  link.click()
}

export function ObjectDetectionPanel({ videoRef, mirrored, sessionReady, onMessage }: ObjectDetectionPanelProps) {
  const [phase, setPhase] = useState<ObjectDetectionPhase>('idle')
  const [capture, setCapture] = useState<CapturedDocument | null>(null)
  const [detections, setDetections] = useState<DetectedObject[]>([])
  const [threshold, setThreshold] = useState(0.4)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [customModel, setCustomModel] = useState<ObjectDetectionModel | null>(null)
  const [modelLoading, setModelLoading] = useState(false)
  const [modelError, setModelError] = useState('')
  const requestRef = useRef(0)
  const modelRequestRef = useRef(0)
  const customModelRef = useRef<ObjectDetectionModel | null>(null)
  const activeModel = customModel ?? BUNDLED_OBJECT_MODEL

  useEffect(() => () => {
    if (customModelRef.current) releaseObjectDetectionModel(customModelRef.current)
  }, [])

  const visibleDetections = useMemo(
    () => detections.filter((detection) => detection.confidence >= threshold),
    [detections, threshold],
  )
  const selectedDetections = visibleDetections.filter((detection) => detection.enabled)

  const processCapture = async (captureSource: Promise<CapturedDocument> | CapturedDocument) => {
    const request = ++requestRef.current
    setPhase('detecting')
    setError('')
    setCopied(false)
    setDetections([])
    try {
      const nextCapture = await captureSource
      const nextDetections = await detectObjects(nextCapture.dataUrl, activeModel)
      if (request !== requestRef.current) return
      setCapture(nextCapture)
      setDetections(nextDetections)
      setPhase('ready')
      onMessage(nextDetections.length > 0
        ? `已在本机发现 ${nextDetections.length} 个候选物体，请调整置信度并逐项复核`
        : '未发现受支持的物体；可换用更清晰、主体更大的照片')
    } catch (caught) {
      if (request !== requestRef.current) return
      setError(caught instanceof Error ? caught.message : '本机物体识别失败')
      setPhase('error')
    }
  }

  const importModel = async (file: File) => {
    const request = ++modelRequestRef.current
    setModelLoading(true)
    setModelError('')
    try {
      const nextModel = await importObjectDetectionModel(file)
      await prepareObjectDetectionModel(nextModel)
      if (request !== modelRequestRef.current) {
        releaseObjectDetectionModel(nextModel)
        return
      }
      customModelRef.current = nextModel
      setCustomModel(nextModel)
      onMessage(`已在本机验证并启用自定义模型 ${nextModel.name}`)
    } catch (caught) {
      if (request !== modelRequestRef.current) return
      setModelError(caught instanceof Error ? caught.message : '无法加载自定义物体模型')
    } finally {
      if (request === modelRequestRef.current) setModelLoading(false)
    }
  }

  const importLabels = async (file: File) => {
    if (!customModelRef.current) return
    setModelError('')
    try {
      const labels = await loadObjectDetectionLabels(file)
      const nextModel = { ...customModelRef.current, labels, labelsFilename: file.name }
      customModelRef.current = nextModel
      setCustomModel(nextModel)
      onMessage(`已载入 ${labels.length} 个本机标签；下一次识别将按类别索引使用它们`)
    } catch (caught) {
      setModelError(caught instanceof Error ? caught.message : '无法读取标签映射')
    }
  }

  const restoreBundledModel = () => {
    modelRequestRef.current += 1
    if (customModelRef.current) releaseObjectDetectionModel(customModelRef.current)
    customModelRef.current = null
    setCustomModel(null)
    setModelLoading(false)
    setModelError('')
    onMessage('已恢复随包 EfficientDet-Lite0 模型')
  }

  const captureCamera = () => {
    if (!videoRef.current) return
    try {
      void processCapture(captureVideoFrame(videoRef.current, mirrored))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法读取当前摄像头画面')
      setPhase('error')
    }
  }

  const toggleDetection = (id: string) => {
    setDetections((current) => current.map((detection) => detection.id === id
      ? { ...detection, enabled: !detection.enabled }
      : detection))
  }

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(buildObjectDetectionJson(selectedDetections))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_500)
    } catch {
      onMessage('无法写入剪贴板，请稍后重试')
    }
  }

  const exportAnnotated = async () => {
    if (!capture || selectedDetections.length === 0) return
    setPhase('exporting')
    setError('')
    try {
      const rendered = await renderObjectAnnotations(capture.dataUrl, selectedDetections)
      downloadAnnotatedPhoto(rendered.dataUrl, objectAnnotatedFilename(capture.filename))
      onMessage(`已导出包含 ${selectedDetections.length} 个复核标注的本机 PNG`)
      setPhase('ready')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '物体标注导出失败')
      setPhase('error')
    }
  }

  const reset = () => {
    requestRef.current += 1
    setPhase('idle')
    setCapture(null)
    setDetections([])
    setError('')
    setCopied(false)
  }

  return (
    <section className="camera-tool-panel object-detection-panel" aria-label="本机物体识别">
      <header>
        <div><ScanSearch size={17} aria-hidden="true" /><strong>物体识别</strong></div>
        <span><ShieldCheck size={13} aria-hidden="true" />{activeModel.kind === 'custom' ? '自定义模型' : 'EfficientDet 模型'}与画面均留在本机</span>
      </header>

      {phase === 'idle' && (
        <div className="object-detection-empty">
          <div className="object-detection-empty-copy"><ScanSearch size={25} aria-hidden="true" /><strong>识别并标注画面中的常见物体</strong><small>覆盖 80 类 COCO 标签；支持摄像头、PNG、JPEG、WebP 与 BMP</small></div>
          <div className="object-detection-empty-actions">
            <button type="button" disabled={!sessionReady || modelLoading} onClick={captureCamera}><ScanSearch size={14} aria-hidden="true" />{sessionReady ? '识别当前画面' : '请先启动摄像头'}</button>
            <label className={`ocr-upload-button${modelLoading ? ' is-disabled' : ''}`}><Upload size={14} aria-hidden="true" />选择照片<input className="sr-only" type="file" disabled={modelLoading} accept="image/png,image/jpeg,image/webp,image/bmp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void processCapture(captureFromImageFile(file)); event.target.value = '' }} /></label>
          </div>
          <div className="object-model-settings">
            <div>
              <strong>当前模型：{activeModel.name}</strong>
              <small>{customModel ? `${(customModel.size / 1024 / 1024).toFixed(1)} MB · ${customModel.labels ? `${customModel.labels.length} 个外部标签` : '使用模型内嵌标签'}` : '随应用离线分发并验证'}</small>
            </div>
            <div className="object-model-actions">
              <label className={`ocr-upload-button${modelLoading ? ' is-disabled' : ''}`}><Upload size={13} aria-hidden="true" />{modelLoading ? '正在验证模型' : '导入 .tflite'}<input className="sr-only" type="file" disabled={modelLoading} accept=".tflite,application/octet-stream" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importModel(file); event.target.value = '' }} /></label>
              {customModel && <label className="ocr-upload-button"><Upload size={13} aria-hidden="true" />标签 TXT<input className="sr-only" type="file" accept=".txt,text/plain" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importLabels(file); event.target.value = '' }} /></label>}
              {customModel && <button type="button" onClick={restoreBundledModel}><RotateCcw size={13} aria-hidden="true" />恢复内置模型</button>}
            </div>
            <p>仅导入可信来源、带 MediaPipe 物体检测元数据的模型（最大 100 MB）；文件只保留在本次内存中，不会上传或持久化。</p>
            {modelError && <span role="alert">{modelError}</span>}
          </div>
        </div>
      )}

      {(phase === 'detecting' || phase === 'exporting') && (
        <div className="object-detection-loading" role="status" aria-live="polite">
          <span className="small-spinner" aria-hidden="true" />
          <div><strong>{phase === 'detecting' ? `正在使用${activeModel.kind === 'custom' ? '自定义' : '内置'}本机模型识别物体` : '正在生成带标注的 PNG'}</strong><small>画面不会上传</small></div>
        </div>
      )}

      {phase === 'error' && (
        <div className="ocr-error-state" role="alert"><strong>物体识别失败</strong><span>{error}</span><button type="button" onClick={reset}><RotateCcw size={14} aria-hidden="true" />重新选择</button></div>
      )}

      {phase === 'ready' && capture && (
        <div className="object-detection-workbench">
          <div className="object-detection-preview">
            <img src={capture.dataUrl} alt="物体识别原图" />
            {visibleDetections.map((detection, index) => (
              <button
                key={detection.id}
                type="button"
                className={detection.enabled ? 'is-enabled' : ''}
                aria-pressed={detection.enabled}
                aria-label={`${detection.label} ${index + 1} ${detection.enabled ? '已选中' : '已跳过'}`}
                style={{ left: `${detection.x * 100}%`, top: `${detection.y * 100}%`, width: `${detection.width * 100}%`, height: `${detection.height * 100}%` }}
                onClick={() => toggleDetection(detection.id)}
              ><span>{index + 1}</span></button>
            ))}
            <span>{visibleDetections.length === 0 ? '当前阈值下无结果' : `显示 ${visibleDetections.length} 个 · 选中 ${selectedDetections.length} 个`}</span>
          </div>
          <div className="object-detection-controls">
            <div className="object-model-active" title={activeModel.name}>模型：{activeModel.name}</div>
            <label><span>最低置信度 {Math.round(threshold * 100)}%</span><input aria-label="最低置信度" type="range" min="0.25" max="0.8" step="0.05" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} /></label>
            <div className="object-detection-list" aria-label="检测到的物体">
              {visibleDetections.length === 0 ? <p>降低阈值，或换用主体更清晰的照片。</p> : visibleDetections.map((detection, index) => (
                <button key={detection.id} type="button" aria-pressed={detection.enabled} onClick={() => toggleDetection(detection.id)}>
                  <span>{index + 1}</span><strong>{detection.label}</strong><small>{detection.category} · {Math.round(detection.confidence * 100)}%</small>
                </button>
              ))}
            </div>
            <p>结果仅覆盖训练标签，可能漏检或误检；请逐框复核，不用于安全、身份或无障碍判断。</p>
            <div className="object-detection-actions">
              <button type="button" disabled={selectedDetections.length === 0} onClick={() => void copyJson()}>{copied ? <Check size={13} aria-hidden="true" /> : <Clipboard size={13} aria-hidden="true" />}{copied ? '已复制 JSON' : '复制 JSON'}</button>
              <button type="button" disabled={selectedDetections.length === 0} onClick={() => void exportAnnotated()}><Download size={13} aria-hidden="true" />确认并导出标注 PNG</button>
              <button type="button" onClick={reset}><RotateCcw size={13} aria-hidden="true" />换一张</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

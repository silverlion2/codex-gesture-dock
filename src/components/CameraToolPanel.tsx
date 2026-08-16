import { Check, Copy, Download, ScanLine, ShieldCheck, X } from 'lucide-react'
import { useId, useRef, useState, type RefObject } from 'react'
import type { BatchCodeScanItem } from '../lib/codeImageScanner'
import type { CodeScannerPhase, CodeScanResult } from '../hooks/useCodeScanner'
import { DocumentToolPanel } from './DocumentToolPanel'
import { QrCodeCreatorPanel } from './QrCodeCreatorPanel'

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
  const [codeWorkspace, setCodeWorkspace] = useState<'scan' | 'create'>('scan')
  const [imageResult, setImageResult] = useState<CodeScanResult | null>(null)
  const [imagePhase, setImagePhase] = useState<'idle' | 'decoding' | 'error'>('idle')
  const [imageError, setImageError] = useState('')
  const [batchResults, setBatchResults] = useState<BatchCodeScanItem[]>([])
  const [batchProgress, setBatchProgress] = useState({ completed: 0, total: 0 })
  const batchAbortRef = useRef<AbortController | null>(null)
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

  const importCodeImages = async (files: File[]) => {
    batchAbortRef.current?.abort()
    const controller = new AbortController()
    batchAbortRef.current = controller
    setImagePhase('decoding')
    setImageError('')
    setImageResult(null)
    setBatchResults([])
    setBatchProgress({ completed: 0, total: files.length })
    try {
      const { decodeCodeImageBatch } = await import('../lib/codeImageScanner')
      const results = await decodeCodeImageBatch(files, (completed, total) => setBatchProgress({ completed, total }), controller.signal)
      if (controller.signal.aborted) return
      setBatchResults(results)
      setImagePhase('idle')
      onMessage(`批量扫码完成：${results.filter((item) => item.status === 'detected').length}/${results.length} 张识别成功`)
    } catch (caught) {
      if (controller.signal.aborted) {
        setImagePhase('idle')
        setBatchProgress({ completed: 0, total: 0 })
        return
      }
      setImagePhase('error')
      setImageError(caught instanceof Error ? caught.message : '批量扫码失败')
    } finally {
      if (batchAbortRef.current === controller) batchAbortRef.current = null
    }
  }

  const exportBatchCsv = async () => {
    const { codeScanBatchCsv } = await import('../lib/codeImageScanner')
    const url = URL.createObjectURL(new Blob([codeScanBatchCsv(batchResults)], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'barcode-scan-results.csv'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1_000)
  }

  const clearResult = () => {
    setImageResult(null)
    setBatchResults([])
    setImageError('')
    setImagePhase('idle')
    setCopied(false)
    onClearScan()
  }

  if (mode === 'codes') {
    return (
      <section className="camera-tool-panel code-tool-panel" aria-label="扫码结果">
        <header>
          <div><ScanLine size={17} aria-hidden="true" /><strong>QR 与条码</strong></div>
          <span><ShieldCheck size={13} aria-hidden="true" />仅本机识别与生成</span>
        </header>
        <div className="code-workspace-tabs" role="group" aria-label="QR 与条码工具">
          <button type="button" aria-pressed={codeWorkspace === 'scan'} onClick={() => setCodeWorkspace('scan')}>扫描识别</button>
          <button type="button" aria-pressed={codeWorkspace === 'create'} onClick={() => setCodeWorkspace('create')}>生成 QR</button>
        </div>
        {codeWorkspace === 'create' ? <QrCodeCreatorPanel onMessage={onMessage} /> : <>
        <div className="code-image-import">
          <label htmlFor={codeImageInputId}><ScanLine size={14} aria-hidden="true" />从图片识别</label>
          <input
            id={codeImageInputId}
            className="sr-only"
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/bmp"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? [])
              if (files.length === 1) void importCodeImage(files[0])
              if (files.length > 1) void importCodeImages(files)
              event.target.value = ''
            }}
          />
          <small>单张或批量 2–20 张；单张最大 35 MB、合计 200 MB</small>
        </div>
        {imagePhase === 'decoding' ? (
          <div className="scanner-status" role="status"><span className="small-spinner" aria-hidden="true" /><div><strong>{batchProgress.total > 1 ? `正在批量扫码 ${batchProgress.completed}/${batchProgress.total}` : '正在识别本机图片'}</strong><small>请保持窗口打开</small></div>{batchProgress.total > 1 && <button type="button" onClick={() => batchAbortRef.current?.abort()}><X size={13} aria-hidden="true" />取消</button>}</div>
        ) : batchResults.length > 0 ? (
          <div className="code-batch-results" aria-live="polite"><header><strong>批量扫码结果</strong><span>{batchResults.filter((item) => item.status === 'detected').length}/{batchResults.length} 成功</span></header><ol>{batchResults.map((item, index) => <li key={`${item.filename}-${index}`}><span>{item.filename}</span><strong>{item.status === 'detected' ? item.format.replaceAll('_', ' ') : item.status === 'not-found' ? '未找到码' : '失败'}</strong><small>{item.status === 'detected' ? item.text : item.error}</small></li>)}</ol><div><button type="button" onClick={() => void exportBatchCsv()}><Download size={14} aria-hidden="true" />导出 CSV</button><button type="button" onClick={clearResult}>继续扫描</button></div></div>
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
        </>}
      </section>
    )
  }

  return <DocumentToolPanel videoRef={videoRef} mirrored={mirrored} sessionReady={sessionReady} onMessage={onMessage} />
}

export default CameraToolPanel

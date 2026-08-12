import { AlertTriangle, CopyCheck, Images, RotateCcw, ShieldCheck, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  analyzeSimilarImages,
  findSimilarImagePairs,
  IMAGE_SIMILARITY_MAX_FILES,
  validateSimilarityFiles,
  type SimilarImageBatchResult,
} from '../lib/imageSimilarity'

interface ImageDuplicateFinderProps {
  onMessage: (message: string) => void
}

type DuplicatePhase = 'idle' | 'analyzing' | 'ready' | 'error'

const distanceOptions = [
  { value: 2, label: '严格 · 2 / 128' },
  { value: 8, label: '推荐 · 8 / 128' },
  { value: 16, label: '宽松 · 16 / 128' },
]

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function ImageDuplicateFinder({ onMessage }: ImageDuplicateFinderProps) {
  const [phase, setPhase] = useState<DuplicatePhase>('idle')
  const [files, setFiles] = useState<File[]>([])
  const [batch, setBatch] = useState<SimilarImageBatchResult | null>(null)
  const [maxDistance, setMaxDistance] = useState(8)
  const [progress, setProgress] = useState({ completed: 0, total: 0, filename: '' })
  const [error, setError] = useState('')
  const controllerRef = useRef<AbortController | null>(null)
  const pairs = useMemo(() => batch ? findSimilarImagePairs(batch.items, maxDistance) : [], [batch, maxDistance])

  useEffect(() => () => controllerRef.current?.abort(), [])

  const chooseFiles = (nextFiles: File[]) => {
    try {
      validateSimilarityFiles(nextFiles)
      setFiles(nextFiles)
      setBatch(null)
      setError('')
      setPhase('idle')
    } catch (caught) {
      setFiles([])
      setBatch(null)
      setError(caught instanceof Error ? caught.message : '无法读取所选图片')
      setPhase('error')
    }
  }

  const start = async () => {
    if (files.length < 2) return
    const controller = new AbortController()
    controllerRef.current = controller
    setPhase('analyzing')
    setError('')
    setProgress({ completed: 0, total: files.length, filename: files[0]?.name ?? '' })
    try {
      const result = await analyzeSimilarImages(files, {
        signal: controller.signal,
        onProgress: (completed, total, filename) => setProgress({ completed, total, filename }),
      })
      if (controller.signal.aborted) return
      setBatch(result)
      setPhase('ready')
      const nextPairs = findSimilarImagePairs(result.items, maxDistance)
      onMessage(`本机重复图片分析完成：${result.items.length} 张可用，发现 ${nextPairs.length} 对候选`)
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') {
        setPhase('idle')
        onMessage('已取消重复图片分析；未保存任何图片或哈希')
      } else {
        setError(caught instanceof Error ? caught.message : '本机重复图片分析失败')
        setPhase('error')
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }

  const reset = () => {
    controllerRef.current?.abort()
    controllerRef.current = null
    setPhase('idle')
    setFiles([])
    setBatch(null)
    setProgress({ completed: 0, total: 0, filename: '' })
    setError('')
  }

  return (
    <div className="image-duplicate-finder">
      {phase === 'idle' && (
        <div className="image-duplicate-empty">
          <div className="image-comparison-empty-copy">
            <Images size={25} aria-hidden="true" />
            <strong>查找近重复图片</strong>
            <small>批量计算 128 位双方向 dHash；不会删除、移动或上传任何文件</small>
          </div>
          <div className="image-duplicate-picker">
            <label className="ocr-upload-button">
              <Upload size={14} aria-hidden="true" />{files.length > 0 ? '重新选择图片' : '选择 2–20 张图片'}
              <input
                className="sr-only"
                aria-label="选择待查重图片"
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,image/bmp"
                onChange={(event) => {
                  chooseFiles([...event.target.files ?? []])
                  event.target.value = ''
                }}
              />
            </label>
            <span>{files.length > 0 ? `已选择 ${files.length} 张 · ${formatBytes(files.reduce((sum, file) => sum + file.size, 0))}` : `最多 ${IMAGE_SIMILARITY_MAX_FILES} 张，单张 35 MB、合计 200 MB`}</span>
            <button type="button" disabled={files.length < 2} onClick={() => void start()}><CopyCheck size={14} aria-hidden="true" />开始本机查重</button>
          </div>
        </div>
      )}

      {phase === 'analyzing' && (
        <div className="image-duplicate-loading" role="status" aria-live="polite">
          <span className="small-spinner" aria-hidden="true" />
          <div><strong>正在计算感知哈希 {progress.completed} / {progress.total}</strong><small title={progress.filename}>{progress.filename}</small></div>
          <button type="button" onClick={() => controllerRef.current?.abort()}><X size={14} aria-hidden="true" />取消</button>
        </div>
      )}

      {phase === 'error' && (
        <div className="ocr-error-state" role="alert"><strong>重复图片分析失败</strong><span>{error}</span><button type="button" onClick={reset}><RotateCcw size={14} aria-hidden="true" />重新选择</button></div>
      )}

      {phase === 'ready' && batch && (
        <div className="image-duplicate-results">
          <div className="image-duplicate-summary" aria-label="重复图片分析摘要">
            <div><span>已分析</span><strong>{batch.items.length}</strong></div>
            <div><span>候选对</span><strong>{pairs.length}</strong></div>
            <div><span>失败</span><strong>{batch.issues.length}</strong></div>
            <label><span>最大距离</span><select aria-label="重复图片最大哈希距离" value={maxDistance} onChange={(event) => setMaxDistance(Number(event.target.value))}>{distanceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          </div>

          {batch.issues.length > 0 && (
            <details className="image-duplicate-issues"><summary><AlertTriangle size={13} aria-hidden="true" />{batch.issues.length} 张无法分析</summary>{batch.issues.map((issue) => <p key={`${issue.filename}:${issue.message}`}><strong>{issue.filename}</strong><span>{issue.message}</span></p>)}</details>
          )}

          {pairs.length === 0 ? (
            <div className="image-duplicate-none"><ShieldCheck size={20} aria-hidden="true" /><strong>当前阈值下没有近重复候选</strong><span>可切换为宽松阈值再次检查；这不代表图片在语义上完全不同。</span></div>
          ) : (
            <div className="image-duplicate-pairs" aria-label="近重复图片候选">
              {pairs.map((pair, index) => (
                <article key={pair.id}>
                  <header><strong>候选 {index + 1}</strong><span className={pair.exactBytes ? 'is-exact' : ''}>{pair.exactBytes ? '字节完全相同' : `dHash 距离 ${pair.distance} / 128`}</span></header>
                  <div className="image-duplicate-pair-images">
                    {[pair.left, pair.right].map((item) => <figure key={item.id}><img src={item.previewDataUrl} alt={`${item.filename} 预览`} /><figcaption title={item.filename}><strong>{item.filename}</strong><span>{item.width} × {item.height} · {formatBytes(item.size)}</span></figcaption></figure>)}
                  </div>
                  <footer>结构相似度 {pair.similarity.toFixed(2)}% · {pair.exactBytes ? 'SHA-256 同样一致' : '必须人工确认是否保留、移动或删除'}</footer>
                </article>
              ))}
            </div>
          )}

          <div className="image-duplicate-actions"><p>感知哈希只适合发现近重复版本；旋转、大幅裁切、拼图和语义相似图片可能漏检或误报。应用不会自动操作源文件。</p><button type="button" onClick={reset}><RotateCcw size={14} aria-hidden="true" />分析另一批</button></div>
        </div>
      )}
    </div>
  )
}

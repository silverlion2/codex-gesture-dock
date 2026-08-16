import { Download, ImageIcon, RotateCcw, RotateCw, Scissors, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import ReactCrop, { centerCrop, makeAspectCrop, type PercentCrop, type PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import {
  normalizeRotation,
  prepareCropSource,
  renderCroppedImage,
  type CroppedImage,
  type ImageRotation,
  type PreparedCropSource,
} from '../lib/imageCrop'
import type { ImageOutputFormat } from '../lib/imageOptimizer'

interface ImageCropPanelProps {
  onMessage: (message: string) => void
}

type CropPhase = 'idle' | 'preparing' | 'editing' | 'rendering' | 'ready' | 'error'
type AspectKey = 'free' | 'square' | 'landscape' | 'portrait' | 'wide'

const aspectOptions: Array<{ key: AspectKey; label: string; value?: number }> = [
  { key: 'free', label: '自由' },
  { key: 'square', label: '1:1', value: 1 },
  { key: 'landscape', label: '4:3', value: 4 / 3 },
  { key: 'portrait', label: '3:4', value: 3 / 4 },
  { key: 'wide', label: '16:9', value: 16 / 9 },
]

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function centeredPercentCrop(width: number, height: number, aspect?: number): PercentCrop {
  if (!aspect) return { unit: '%', x: 5, y: 5, width: 90, height: 90 }
  return centerCrop(makeAspectCrop({ unit: '%', width: 90 }, aspect, width, height), width, height)
}

function percentToPixel(crop: PercentCrop, width: number, height: number): PixelCrop {
  return {
    unit: 'px',
    x: crop.x / 100 * width,
    y: crop.y / 100 * height,
    width: crop.width / 100 * width,
    height: crop.height / 100 * height,
  }
}

export function ImageCropPanel({ onMessage }: ImageCropPanelProps) {
  const [file, setFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<CropPhase>('idle')
  const [source, setSource] = useState<PreparedCropSource | null>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [rotation, setRotation] = useState<ImageRotation>(0)
  const [flipHorizontal, setFlipHorizontal] = useState(false)
  const [flipVertical, setFlipVertical] = useState(false)
  const [aspectKey, setAspectKey] = useState<AspectKey>('free')
  const [crop, setCrop] = useState<PercentCrop>({ unit: '%', x: 5, y: 5, width: 90, height: 90 })
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null)
  const [format, setFormat] = useState<ImageOutputFormat>('png')
  const [quality, setQuality] = useState(90)
  const [result, setResult] = useState<CroppedImage | null>(null)
  const [resultUrl, setResultUrl] = useState('')
  const [error, setError] = useState('')
  const imageRef = useRef<HTMLImageElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const aspect = aspectOptions.find((option) => option.key === aspectKey)?.value

  useEffect(() => {
    if (!source) {
      setSourceUrl('')
      return
    }
    const url = URL.createObjectURL(source.blob)
    setSourceUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [source])

  useEffect(() => {
    if (!result) {
      setResultUrl('')
      return
    }
    const url = URL.createObjectURL(result.blob)
    setResultUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [result])

  useEffect(() => () => abortRef.current?.abort(), [])

  const prepare = async (
    nextFile: File,
    nextRotation: ImageRotation,
    nextFlipHorizontal = flipHorizontal,
    nextFlipVertical = flipVertical,
  ) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('preparing')
    setError('')
    setResult(null)
    try {
      const prepared = await prepareCropSource(nextFile, nextRotation, controller.signal, nextFlipHorizontal, nextFlipVertical)
      if (controller.signal.aborted) return
      setSource(prepared)
      setRotation(nextRotation)
      setFlipHorizontal(nextFlipHorizontal)
      setFlipVertical(nextFlipVertical)
      setCompletedCrop(null)
      setPhase('editing')
      const transforms = [nextRotation ? `旋转 ${nextRotation}°` : '', nextFlipHorizontal ? '水平翻转' : '', nextFlipVertical ? '垂直翻转' : ''].filter(Boolean)
      onMessage(transforms.length === 0 ? '图片已在本机载入；请调整裁剪框' : `图片已在本机${transforms.join('、')}；裁剪框已重置`)
    } catch (caught) {
      if (controller.signal.aborted) return
      setError(caught instanceof Error ? caught.message : '无法准备裁剪图片')
      setPhase('error')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  const reset = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setFile(null)
    setSource(null)
    setResult(null)
    setRotation(0)
    setFlipHorizontal(false)
    setFlipVertical(false)
    setAspectKey('free')
    setCrop({ unit: '%', x: 5, y: 5, width: 90, height: 90 })
    setCompletedCrop(null)
    setError('')
    setPhase('idle')
  }

  const changeAspect = (nextKey: AspectKey) => {
    setAspectKey(nextKey)
    const image = imageRef.current
    if (!image) return
    const nextAspect = aspectOptions.find((option) => option.key === nextKey)?.value
    const nextCrop = centeredPercentCrop(image.naturalWidth, image.naturalHeight, nextAspect)
    setCrop(nextCrop)
    setCompletedCrop(percentToPixel(nextCrop, image.width, image.height))
    setResult(null)
  }

  const rotate = (delta: -90 | 90) => {
    if (!file) return
    void prepare(file, normalizeRotation(rotation + delta), flipHorizontal, flipVertical)
  }

  const flip = (axis: 'horizontal' | 'vertical') => {
    if (!file) return
    const nextHorizontal = axis === 'horizontal' ? !flipHorizontal : flipHorizontal
    const nextVertical = axis === 'vertical' ? !flipVertical : flipVertical
    void prepare(file, rotation, nextHorizontal, nextVertical)
  }

  const createPreview = async () => {
    if (!source || !completedCrop) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('rendering')
    setError('')
    try {
      const cropped = await renderCroppedImage(source, {
        x: crop.x / 100 * source.width,
        y: crop.y / 100 * source.height,
        width: crop.width / 100 * source.width,
        height: crop.height / 100 * source.height,
      }, format, quality / 100, controller.signal)
      if (controller.signal.aborted) return
      setResult(cropped)
      setPhase('ready')
      onMessage(`裁剪预览已生成：${cropped.width} × ${cropped.height} · ${cropped.format.toUpperCase()}`)
    } catch (caught) {
      if (controller.signal.aborted) return
      setError(caught instanceof Error ? caught.message : '生成裁剪预览失败')
      setPhase('error')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  const download = () => {
    if (!result || !resultUrl) return
    const link = document.createElement('a')
    link.href = resultUrl
    link.download = result.filename
    link.click()
    onMessage(`已导出 ${result.filename}；源图片未被修改`)
  }

  return (
    <section className="image-crop-panel" aria-label="本机图片裁剪与旋转">
      {phase === 'idle' && (
        <div className="image-crop-empty">
          <Scissors size={25} aria-hidden="true" />
          <strong>裁剪、构图与旋转图片</strong>
          <small>支持触控、拖动和键盘微调裁剪框；所有像素只在本机处理</small>
          <label className="ocr-upload-button"><Upload size={14} aria-hidden="true" />选择图片<input className="sr-only" aria-label="选择待裁剪图片" type="file" accept="image/png,image/jpeg,image/webp,image/bmp" onChange={(event) => { const nextFile = event.target.files?.[0] ?? null; setFile(nextFile); if (nextFile) void prepare(nextFile, 0); event.target.value = '' }} /></label>
          <span>PNG、JPEG、WebP、BMP · 最大 35 MB</span>
        </div>
      )}

      {(phase === 'preparing' || phase === 'rendering') && (
        <div className="image-crop-loading" role="status" aria-live="polite">
          <span className="small-spinner" aria-hidden="true" />
          <div><strong>{phase === 'preparing' ? '正在准备本机裁剪画布' : '正在生成裁剪预览'}</strong><small>不会上传或修改源图片</small></div>
          <button type="button" onClick={reset}>取消</button>
        </div>
      )}

      {phase === 'error' && (
        <div className="ocr-error-state" role="alert"><strong>图片裁剪失败</strong><span>{error}</span><button type="button" onClick={source ? () => setPhase('editing') : reset}><RotateCcw size={14} aria-hidden="true" />{source ? '返回编辑' : '重新选择'}</button></div>
      )}

      {phase === 'editing' && source && sourceUrl && (
        <div className="image-crop-editor">
          <div className="image-crop-stage" aria-label="图片裁剪区域">
            <ReactCrop crop={crop} aspect={aspect} keepSelection minWidth={8} minHeight={8} ruleOfThirds onChange={(_, percentCrop) => { setCrop(percentCrop); setResult(null) }} onComplete={(pixelCrop) => setCompletedCrop(pixelCrop)}>
              <img
                ref={imageRef}
                src={sourceUrl}
                alt="待裁剪图片"
                onLoad={(event) => {
                  const nextCrop = centeredPercentCrop(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight, aspect)
                  setCrop(nextCrop)
                  setCompletedCrop(percentToPixel(nextCrop, event.currentTarget.width, event.currentTarget.height))
                }}
              />
            </ReactCrop>
          </div>
          <div className="image-crop-controls">
            <div className="image-crop-aspects" role="group" aria-label="裁剪比例">{aspectOptions.map((option) => <button key={option.key} type="button" aria-pressed={aspectKey === option.key} onClick={() => changeAspect(option.key)}>{option.label}</button>)}</div>
            <div className="image-crop-rotation"><button type="button" onClick={() => rotate(-90)}><RotateCcw size={14} aria-hidden="true" />向左旋转</button><button type="button" onClick={() => rotate(90)}><RotateCw size={14} aria-hidden="true" />向右旋转</button><button type="button" aria-pressed={flipHorizontal} onClick={() => flip('horizontal')}>水平翻转</button><button type="button" aria-pressed={flipVertical} onClick={() => flip('vertical')}>垂直翻转</button></div>
            <div className="image-crop-output-options">
              <label><span>输出格式</span><select aria-label="裁剪输出格式" value={format} onChange={(event) => setFormat(event.target.value as ImageOutputFormat)}><option value="png">PNG</option><option value="jpeg">JPEG</option><option value="webp">WebP</option></select></label>
              <label className={format === 'png' ? 'is-disabled' : ''}><span>品质 {quality}%</span><input aria-label="裁剪输出品质" type="range" min="40" max="100" value={quality} disabled={format === 'png'} onChange={(event) => setQuality(Number(event.target.value))} /></label>
            </div>
            <dl><div><dt>工作尺寸</dt><dd>{source.width} × {source.height}</dd></div><div><dt>旋转</dt><dd>{rotation}°</dd></div><div><dt>翻转</dt><dd>{flipHorizontal || flipVertical ? [flipHorizontal ? '水平' : '', flipVertical ? '垂直' : ''].filter(Boolean).join(' + ') : '无'}</dd></div><div><dt>原图缩放</dt><dd>{source.scale < 1 ? `${Math.round(source.scale * 100)}% 安全缩放` : '100%'}</dd></div></dl>
            <p>方向键微调选中裁剪框；JPEG 会把透明区域合成白色。工作图受 8192 像素/2400 万像素上限约束。</p>
            <div className="image-crop-actions"><button type="button" disabled={!completedCrop} onClick={() => void createPreview()}><ImageIcon size={14} aria-hidden="true" />生成裁剪预览</button><button type="button" onClick={reset}>选择其他图片</button></div>
          </div>
        </div>
      )}

      {phase === 'ready' && result && resultUrl && (
        <div className="image-crop-result">
          <div className="image-crop-result-preview"><img src={resultUrl} alt="裁剪结果预览" /></div>
          <div className="image-crop-result-details">
            <ImageIcon size={20} aria-hidden="true" />
            <strong>{result.width} × {result.height}</strong>
            <span>{result.format.toUpperCase()}{result.quality === null ? ' · 无损' : ` · 品质 ${Math.round(result.quality * 100)}%`} · {formatBytes(result.blob.size)}</span>
            <p>请检查构图、方向、文字和透明边缘；导出会新建文件，不覆盖源图片。</p>
            <div className="image-crop-actions"><button type="button" onClick={download}><Download size={14} aria-hidden="true" />确认并导出</button><button type="button" onClick={() => { setResult(null); setPhase('editing') }}><RotateCcw size={14} aria-hidden="true" />返回调整</button><button type="button" onClick={reset}>选择其他图片</button></div>
          </div>
        </div>
      )}
    </section>
  )
}

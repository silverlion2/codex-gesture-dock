import { Download, Eye, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PreparedColorAnalysis } from '../lib/colorAnalysis'
import {
  colorVisionFilename,
  colorVisionLabels,
  colorVisionMethod,
  renderColorVisionPng,
  type ColorVisionDeficiency,
} from '../lib/colorVisionSimulation'

interface ColorVisionSimulatorPanelProps {
  analysis: PreparedColorAnalysis
  onMessage: (message: string) => void
  onReset: () => void
}

type PreviewPhase = 'rendering' | 'ready' | 'error'

function downloadUrl(url: string, filename: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
}

export function ColorVisionSimulatorPanel({ analysis, onMessage, onReset }: ColorVisionSimulatorPanelProps) {
  const [deficiency, setDeficiency] = useState<ColorVisionDeficiency>('deutan')
  const [severity, setSeverity] = useState(100)
  const [phase, setPhase] = useState<PreviewPhase>('rendering')
  const [previewUrl, setPreviewUrl] = useState('')
  const [error, setError] = useState('')
  const previewUrlRef = useRef('')

  const replacePreview = useCallback((url: string) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = url
    setPreviewUrl(url)
  }, [])

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    replacePreview('')
    setPhase('rendering')
    setError('')
    const timer = window.setTimeout(() => {
      void renderColorVisionPng(
        analysis.pixels,
        analysis.width,
        analysis.height,
        deficiency,
        severity / 100,
        controller.signal,
      ).then((blob) => {
        if (controller.signal.aborted) return
        replacePreview(URL.createObjectURL(blob))
        setPhase('ready')
        onMessage(`已生成 ${colorVisionLabels[deficiency]} ${severity}% 本机预览，请检查颜色编码是否仍可辨认`)
      }).catch((caught) => {
        if (controller.signal.aborted) return
        setError(caught instanceof Error ? caught.message : '色觉模拟失败')
        setPhase('error')
      })
    }, 160)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [analysis, deficiency, onMessage, replacePreview, severity])

  const exportPreview = () => {
    if (!previewUrl || phase !== 'ready') return
    downloadUrl(previewUrl, colorVisionFilename(analysis.filename, deficiency, severity / 100))
    onMessage('已请求下载色觉模拟 PNG；该图只用于人工无障碍复核')
  }

  return (
    <div className="color-vision-simulator" aria-busy={phase === 'rendering'}>
      <div className="color-vision-comparison">
        <figure><img src={analysis.dataUrl} alt="色觉模拟原图" /><figcaption>原图</figcaption></figure>
        <figure>
          {previewUrl && phase === 'ready'
            ? <img src={previewUrl} alt={`${colorVisionLabels[deficiency]} ${severity}% 模拟图`} />
            : <div className="color-vision-placeholder" role={phase === 'error' ? 'alert' : 'status'}>{phase === 'error' ? error : <><span className="small-spinner" aria-hidden="true" />正在生成有界本机预览</>}</div>}
          <figcaption>{colorVisionLabels[deficiency]} · {severity}%</figcaption>
        </figure>
      </div>

      <div className="color-vision-controls">
        <div className="color-vision-types" role="radiogroup" aria-label="色觉模拟类型">
          {(Object.keys(colorVisionLabels) as ColorVisionDeficiency[]).map((value) => (
            <button key={value} type="button" role="radio" aria-checked={deficiency === value} onClick={() => setDeficiency(value)}>{colorVisionLabels[value]}</button>
          ))}
        </div>
        <label className="color-vision-strength"><span>模拟强度 <output>{severity}%</output></span><input type="range" aria-label="色觉模拟强度" min={0} max={100} step={10} value={severity} onChange={(event) => setSeverity(Number(event.target.value))} /></label>
        <div className="color-vision-method"><Eye size={14} aria-hidden="true" /><span><strong>{colorVisionMethod(deficiency)}</strong> · 线性 sRGB · {analysis.width} × {analysis.height}</span></div>
        <p>这是缺失型色觉的数学近似，只帮助发现“仅靠颜色表达”的风险；它不是诊断，也不能证明设计已无障碍。请同时检查文字、图标、纹理、标签与亮度对比。</p>
        <div className="image-comparison-actions">
          <button type="button" disabled={phase !== 'ready'} onClick={exportPreview}><Download size={14} aria-hidden="true" />确认并导出模拟 PNG</button>
          <button type="button" onClick={onReset}><RefreshCw size={14} aria-hidden="true" />重新选择</button>
        </div>
      </div>
    </div>
  )
}

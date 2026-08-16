import { Check, Copy, Palette, RefreshCw, ShieldCheck, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  evaluateContrast,
  hexToRgb,
  paletteCss,
  paletteJson,
  prepareColorAnalysis,
  sampleColor,
  type PreparedColorAnalysis,
  type SampledColor,
} from '../lib/colorAnalysis'
import { ColorVisionSimulatorPanel } from './ColorVisionSimulatorPanel'

interface ColorAnalysisPanelProps {
  onMessage: (message: string) => void
}

type ColorRole = 'foreground' | 'background'
type AnalysisPhase = 'idle' | 'loading' | 'ready' | 'error'

interface ColorSelection {
  color: SampledColor
  point: { x: number; y: number } | null
}

const black: SampledColor = { r: 0, g: 0, b: 0, hex: '#000000' }
const white: SampledColor = { r: 255, g: 255, b: 255, hex: '#FFFFFF' }

function contrastLabel(pass: boolean) {
  return pass ? '通过' : '未通过'
}

export function ColorAnalysisPanel({ onMessage }: ColorAnalysisPanelProps) {
  const [workspace, setWorkspace] = useState<'palette' | 'vision'>('palette')
  const [phase, setPhase] = useState<AnalysisPhase>('idle')
  const [analysis, setAnalysis] = useState<PreparedColorAnalysis | null>(null)
  const [activeRole, setActiveRole] = useState<ColorRole>('background')
  const [foreground, setForeground] = useState<ColorSelection>({ color: black, point: null })
  const [background, setBackground] = useState<ColorSelection>({ color: white, point: null })
  const [error, setError] = useState('')
  const [copied, setCopied] = useState<'css' | 'json' | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const copyTimerRef = useRef<number | null>(null)

  useEffect(() => () => {
    abortRef.current?.abort()
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
  }, [])

  const report = useMemo(
    () => evaluateContrast(foreground.color, background.color),
    [background.color, foreground.color],
  )

  const setRoleColor = (role: ColorRole, color: SampledColor, point: ColorSelection['point'] = null) => {
    if (role === 'foreground') setForeground({ color, point })
    else setBackground({ color, point })
  }

  const analyze = async (file: File) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('loading')
    setError('')
    try {
      const next = await prepareColorAnalysis(file, controller.signal)
      if (controller.signal.aborted) return
      const dominant = next.palette[0]
      const recommended = dominant.textColor === '#ffffff' ? white : black
      setAnalysis(next)
      setBackground({ color: dominant, point: null })
      setForeground({ color: recommended, point: null })
      setActiveRole('background')
      setPhase('ready')
      onMessage(`已在本机提取 ${next.palette.length} 个代表色，可继续取样并检查文字对比度`)
    } catch (caught) {
      if (controller.signal.aborted) return
      setError(caught instanceof Error ? caught.message : '本地颜色分析失败')
      setPhase('error')
    }
  }

  const reset = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setPhase('idle')
    setAnalysis(null)
    setForeground({ color: black, point: null })
    setBackground({ color: white, point: null })
    setError('')
    setCopied(null)
  }

  const sampleImage = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!analysis) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    const color = sampleColor(analysis.pixels, analysis.width, analysis.height, x, y)
    setRoleColor(activeRole, color, { x, y })
    onMessage(`已把 ${color.hex} 设为${activeRole === 'foreground' ? '文字色' : '背景色'}`)
  }

  const updateHex = (role: ColorRole, value: string) => {
    const color = hexToRgb(value)
    if (color) setRoleColor(role, color)
  }

  const copyPalette = async (format: 'css' | 'json') => {
    if (!analysis) return
    try {
      await navigator.clipboard.writeText(format === 'css' ? paletteCss(analysis.palette) : paletteJson(analysis.palette))
      setCopied(format)
      onMessage(`已复制调色板 ${format.toUpperCase()}`)
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
      copyTimerRef.current = window.setTimeout(() => setCopied(null), 1_500)
    } catch {
      onMessage('无法写入剪贴板，请检查系统权限')
    }
  }

  return (
    <section className="camera-tool-panel color-analysis-panel" aria-label="本机颜色分析">
      <header>
        <div><Palette size={17} aria-hidden="true" /><strong>颜色实验室</strong></div>
        <span><ShieldCheck size={13} aria-hidden="true" />图片、取样点与调色板仅留在本机</span>
      </header>

      <div className="color-workspace-tabs" role="group" aria-label="颜色实验室工具">
        <button type="button" aria-pressed={workspace === 'palette'} onClick={() => setWorkspace('palette')}>取色与对比</button>
        <button type="button" aria-pressed={workspace === 'vision'} onClick={() => setWorkspace('vision')}>色觉预览</button>
      </div>

      {phase === 'idle' && (
        <div className="color-analysis-empty">
          <Palette size={27} aria-hidden="true" />
          <strong>{workspace === 'palette' ? '从图片提取代表色并检查文字对比度' : '预览常见色觉缺失下的图片辨识效果'}</strong>
          <small>导入照片、截图或设计稿；支持 PNG、JPEG、WebP 与 BMP，最大 35 MB，仅在本机处理</small>
          <label className="ocr-upload-button"><Upload size={14} aria-hidden="true" />选择图片<input className="sr-only" aria-label="选择颜色分析图片" type="file" accept="image/png,image/jpeg,image/webp,image/bmp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void analyze(file); event.target.value = '' }} /></label>
        </div>
      )}

      {phase === 'loading' && (
        <div className="image-comparison-loading" role="status" aria-live="polite">
          <span className="small-spinner" aria-hidden="true" />
          <div><strong>正在准备有界颜色画布</strong><small>使用本机 OKLCH 量化与像素处理，图片不会上传</small></div>
        </div>
      )}

      {phase === 'error' && (
        <div className="ocr-error-state" role="alert"><strong>颜色分析失败</strong><span>{error}</span><button type="button" onClick={reset}><RefreshCw size={14} aria-hidden="true" />重新选择</button></div>
      )}

      {phase === 'ready' && analysis && workspace === 'vision' && <ColorVisionSimulatorPanel analysis={analysis} onMessage={onMessage} onReset={reset} />}

      {phase === 'ready' && analysis && workspace === 'palette' && (
        <div className="color-analysis-workbench">
          <div className="color-analysis-visual-column">
            <div className="color-analysis-role-switcher" role="group" aria-label="当前取样目标">
              <button type="button" aria-pressed={activeRole === 'foreground'} onClick={() => setActiveRole('foreground')}>取样文字色</button>
              <button type="button" aria-pressed={activeRole === 'background'} onClick={() => setActiveRole('background')}>取样背景色</button>
            </div>
            <button
              type="button"
              className="color-analysis-image"
              aria-label={`从图片取样${activeRole === 'foreground' ? '文字色' : '背景色'}`}
              style={{ aspectRatio: `${analysis.width} / ${analysis.height}` }}
              onPointerDown={sampleImage}
            >
              <img src={analysis.dataUrl} alt="颜色分析原图" draggable={false} />
              {foreground.point && <i className="color-sample-marker is-foreground" aria-hidden="true" style={{ left: `${foreground.point.x * 100}%`, top: `${foreground.point.y * 100}%`, color: foreground.color.hex }} />}
              {background.point && <i className="color-sample-marker is-background" aria-hidden="true" style={{ left: `${background.point.x * 100}%`, top: `${background.point.y * 100}%`, color: background.color.hex }} />}
            </button>
            <small className="color-analysis-image-note">点击图片为当前目标取样；透明像素按白色合成。{analysis.scale < 1 ? `分析图已缩放至 ${Math.round(analysis.scale * 100)}%。` : ''}</small>
            <div className="color-analysis-palette" aria-label="提取的代表色">
              {analysis.palette.map((color, index) => (
                <button key={`${color.hex}-${index}`} type="button" aria-label={`把代表色 ${color.hex} 设为${activeRole === 'foreground' ? '文字色' : '背景色'}`} style={{ backgroundColor: color.hex, color: color.textColor }} onClick={() => setRoleColor(activeRole, color)}>
                  <strong>{color.hex}</strong><small>{Math.round(color.proportion * 100)}%</small>
                </button>
              ))}
            </div>
          </div>

          <div className="color-analysis-controls">
            <div className="color-analysis-pair">
              <label><span>文字色</span><span className="color-analysis-input"><input type="color" aria-label="文字色选择器" value={foreground.color.hex} onChange={(event) => updateHex('foreground', event.target.value)} /><input aria-label="文字色 HEX" value={foreground.color.hex} onChange={(event) => updateHex('foreground', event.target.value)} /></span></label>
              <button type="button" aria-label="交换文字色和背景色" onClick={() => { setForeground(background); setBackground(foreground) }}>⇄</button>
              <label><span>背景色</span><span className="color-analysis-input"><input type="color" aria-label="背景色选择器" value={background.color.hex} onChange={(event) => updateHex('background', event.target.value)} /><input aria-label="背景色 HEX" value={background.color.hex} onChange={(event) => updateHex('background', event.target.value)} /></span></label>
            </div>
            <div className="color-analysis-preview" style={{ color: foreground.color.hex, backgroundColor: background.color.hex }}>
              <strong>正文预览 Aa</strong><span>清晰文字需要足够的前景与背景对比。</span>
            </div>
            <div className="color-analysis-score" aria-label="WCAG 对比度结果">
              <div><span>对比度</span><strong>{report.ratio.toFixed(2)} : 1</strong></div>
              <ul>
                <li data-pass={report.aaNormal}><span>AA 正文</span><strong>{contrastLabel(report.aaNormal)}</strong></li>
                <li data-pass={report.aaLarge}><span>AA 大字</span><strong>{contrastLabel(report.aaLarge)}</strong></li>
                <li data-pass={report.aaaNormal}><span>AAA 正文</span><strong>{contrastLabel(report.aaaNormal)}</strong></li>
                <li data-pass={report.aaaLarge}><span>AAA 大字</span><strong>{contrastLabel(report.aaaLarge)}</strong></li>
              </ul>
            </div>
            <p>{analysis.originalWidth} × {analysis.originalHeight} → {analysis.width} × {analysis.height} · OKLCH {analysis.palette.length}/6 色。WCAG 比率只适用于当前纯色组合，不能判断图片中文字的位置、字号、描边或整体设计质量。</p>
            <div className="image-comparison-actions">
              <button type="button" onClick={() => void copyPalette('css')}>{copied === 'css' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}复制 CSS</button>
              <button type="button" onClick={() => void copyPalette('json')}>{copied === 'json' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}复制 JSON</button>
              <button type="button" onClick={reset}><RefreshCw size={14} aria-hidden="true" />重新选择</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

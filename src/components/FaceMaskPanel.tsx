import { Eye, Laugh, ScanFace, ShieldCheck } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { FaceMaskStyle } from '../lib/faceMasks'

interface FaceMaskPanelProps {
  style: FaceMaskStyle
  onStyleChange: (style: FaceMaskStyle) => void
  sessionActive: boolean
  onStart: () => void
}

const styles: Array<{
  id: FaceMaskStyle
  name: string
  detail: string
  accent: string
}> = [
  { id: 'fox', name: '霓虹狐', detail: '眨眼变暗 · 张嘴发光 · 微笑增强', accent: '#ff5ca8' },
  { id: 'mecha', name: '机甲面罩', detail: '抬眉升起护目镜 · 张嘴展开下颌', accent: '#43e4ae' },
  { id: 'festival', name: '庆典假面', detail: '微笑出现星光 · 抬眉抬升面具', accent: '#a476ff' },
]

export function FaceMaskPanel({ style, onStyleChange, sessionActive, onStart }: FaceMaskPanelProps) {
  return (
    <section className="camera-tool-panel face-mask-panel" aria-label="表情动态面具">
      <header>
        <div><ScanFace size={17} aria-hidden="true" /><strong>表情动态面具</strong></div>
        <span><ShieldCheck size={13} aria-hidden="true" />视频与表情只在本机处理</span>
      </header>
      <div className="face-mask-style-list" role="radiogroup" aria-label="选择面具样式">
        {styles.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={style === item.id}
            className={style === item.id ? 'is-active' : ''}
            style={{ '--mask-accent': item.accent } as CSSProperties}
            onClick={() => onStyleChange(item.id)}
          >
            <i aria-hidden="true" />
            <span><strong>{item.name}</strong><small>{item.detail}</small></span>
          </button>
        ))}
      </div>
      <div className="face-mask-hints">
        <span><Eye size={14} aria-hidden="true" />试试眨眼、抬眉</span>
        <span><Laugh size={14} aria-hidden="true" />试试微笑、张嘴</span>
        {sessionActive ? (
          <small>摄像头已启动；面具会在模型就绪后叠加，切换样式立即生效。</small>
        ) : (
          <button type="button" onClick={onStart}>启动摄像头体验</button>
        )}
      </div>
    </section>
  )
}

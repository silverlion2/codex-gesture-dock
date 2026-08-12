import { ContactRound, EyeOff, FileScan, FileText, GitCompare, ImageMinus, Palette, ScanFace, ScanLine, ScanSearch, UserRoundCheck } from 'lucide-react'
import type { CameraMode } from '../lib/cameraTools'

interface CameraModeSwitcherProps {
  mode: CameraMode
  onChange: (mode: CameraMode) => void
}
const modes = [
  { id: 'monitor', label: '姿态', icon: UserRoundCheck },
  { id: 'masks', label: '面具', icon: ScanFace },
  { id: 'codes', label: '扫码', icon: ScanLine },
  { id: 'document', label: '文档', icon: FileScan },
  { id: 'ocr', label: '文字', icon: FileText },
  { id: 'card', label: '名片', icon: ContactRound },
  { id: 'privacy', label: '隐私', icon: EyeOff },
  { id: 'background', label: '背景', icon: ImageMinus },
  { id: 'objects', label: '物体', icon: ScanSearch },
  { id: 'compare', label: '图片', icon: GitCompare },
  { id: 'colors', label: '颜色', icon: Palette },
] as const

export function CameraModeSwitcher({ mode, onChange }: CameraModeSwitcherProps) {
  return (
    <div className="camera-mode-switcher" aria-label="摄像头功能" role="group">
      {modes.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className={mode === id ? 'is-active' : ''}
          aria-pressed={mode === id}
          title={label}
          onClick={() => onChange(id)}
        >
          <Icon size={13} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  )
}

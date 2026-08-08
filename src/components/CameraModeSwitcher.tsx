import { FileScan, ScanLine, UserRoundCheck } from 'lucide-react'
import type { CameraMode } from '../lib/cameraTools'

interface CameraModeSwitcherProps {
  mode: CameraMode
  onChange: (mode: CameraMode) => void
}
const modes = [
  { id: 'monitor', label: '姿态', icon: UserRoundCheck },
  { id: 'codes', label: '扫码', icon: ScanLine },
  { id: 'document', label: '文档', icon: FileScan },
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
          onClick={() => onChange(id)}
        >
          <Icon size={13} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  )
}

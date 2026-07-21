import { Bell, Coffee, Hand } from 'lucide-react'
import type { ReminderSettings } from '../hooks/usePoseMonitor'
import type { GestureMode } from '../lib/gestures'

interface WidgetSettingsProps {
  settings: ReminderSettings
  gestureMode: GestureMode
  onChange: (settings: ReminderSettings) => void
  onGestureModeChange: (mode: GestureMode) => void
}

export function WidgetSettings({
  settings,
  gestureMode,
  onChange,
  onGestureModeChange,
}: WidgetSettingsProps) {
  return (
    <section className="widget-settings" aria-label="提醒设置">
      <div className="widget-setting-row">
        <Bell size={18} aria-hidden="true" />
        <span>坐姿提醒</span>
        <button
          className={`mini-toggle ${settings.postureEnabled ? 'is-on' : ''}`}
          type="button"
          role="switch"
          aria-checked={settings.postureEnabled}
          aria-label="坐姿提醒"
          onClick={() =>
            onChange({ ...settings, postureEnabled: !settings.postureEnabled })
          }
        >
          <i />
        </button>
        <label>
          <span className="sr-only">坐姿提醒灵敏度</span>
          <select
            value={settings.sensitivity}
            disabled={!settings.postureEnabled}
            aria-label="坐姿提醒灵敏度"
            onChange={(event) =>
              onChange({
                ...settings,
                sensitivity: event.target.value as ReminderSettings['sensitivity'],
              })
            }
          >
            <option value="gentle">温和</option>
            <option value="medium">中等</option>
            <option value="strict">严格</option>
          </select>
        </label>
      </div>

      <div className="widget-setting-row">
        <Coffee size={18} aria-hidden="true" />
        <span>休息提醒</span>
        <button
          className={`mini-toggle ${settings.breakEnabled ? 'is-on' : ''}`}
          type="button"
          role="switch"
          aria-checked={settings.breakEnabled}
          aria-label="休息提醒"
          onClick={() =>
            onChange({ ...settings, breakEnabled: !settings.breakEnabled })
          }
        >
          <i />
        </button>
        <label>
          <span className="sr-only">休息提醒间隔</span>
          <select
            value={settings.breakMinutes}
            disabled={!settings.breakEnabled}
            aria-label="休息提醒间隔"
            onChange={(event) =>
              onChange({ ...settings, breakMinutes: Number(event.target.value) })
            }
          >
            <option value={30}>30 分钟</option>
            <option value={45}>45 分钟</option>
            <option value={50}>50 分钟</option>
            <option value={60}>60 分钟</option>
          </select>
        </label>
      </div>

      <div className="widget-setting-row">
        <Hand size={18} aria-hidden="true" />
        <span>{gestureMode === 'windows' ? 'Windows 手势' : 'Codex 手势'}</span>
        <button
          className={`mini-toggle ${settings.gestureEnabled ? 'is-on' : ''}`}
          type="button"
          role="switch"
          aria-checked={settings.gestureEnabled}
          aria-label={`${gestureMode === 'windows' ? 'Windows' : 'Codex'} 手势控制`}
          onClick={() =>
            onChange({ ...settings, gestureEnabled: !settings.gestureEnabled })
          }
        >
          <i />
        </button>
        <label>
          <span className="sr-only">手势控制模式</span>
          <select
            value={gestureMode}
            aria-label="手势控制模式"
            onChange={(event) =>
              onGestureModeChange(event.target.value as GestureMode)
            }
          >
            <option value="codex">Codex</option>
            <option value="windows">Windows</option>
          </select>
        </label>
      </div>
    </section>
  )
}

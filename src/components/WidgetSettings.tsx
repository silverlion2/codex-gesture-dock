import { Bell, Coffee, Hand } from 'lucide-react'
import type { ReminderSettings } from '../hooks/usePoseMonitor'

interface WidgetSettingsProps {
  settings: ReminderSettings
  onChange: (settings: ReminderSettings) => void
  onOpenGestureGuide: () => void
}

export function WidgetSettings({
  settings,
  onChange,
  onOpenGestureGuide,
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
        <span>Codex 手势</span>
        <button
          className={`mini-toggle ${settings.gestureEnabled ? 'is-on' : ''}`}
          type="button"
          role="switch"
          aria-checked={settings.gestureEnabled}
          aria-label="Codex 手势控制"
          onClick={() =>
            onChange({ ...settings, gestureEnabled: !settings.gestureEnabled })
          }
        >
          <i />
        </button>
        <button
          className="gesture-guide-button"
          type="button"
          onClick={onOpenGestureGuide}
        >
          手势表
        </button>
      </div>
    </section>
  )
}

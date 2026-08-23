import { Bell, Coffee, Hand, Mic2 } from 'lucide-react'
import type { ReminderSettings } from '../hooks/usePoseMonitor'
import type { GestureMode } from '../lib/gestures'
import {
  EN_VOICE_COMMANDS,
  ZH_VOICE_COMMANDS,
  voiceControlSummary,
  type VoiceControlStatus,
} from '../lib/voiceControl'

interface WidgetSettingsProps {
  settings: ReminderSettings
  gestureMode: GestureMode
  voiceStatus: VoiceControlStatus
  onChange: (settings: ReminderSettings) => void
  onGestureModeChange: (mode: GestureMode) => void
  onVoiceEnabledChange: (enabled: boolean) => void
}

export function WidgetSettings({
  settings,
  gestureMode,
  voiceStatus,
  onChange,
  onGestureModeChange,
  onVoiceEnabledChange,
}: WidgetSettingsProps) {
  const gestureModeLabel =
    gestureMode === 'windows'
      ? 'Windows 手势'
      : gestureMode === 'pointer'
        ? '空中鼠标'
        : 'Codex 手势'
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
        <span>{gestureModeLabel}</span>
        <button
          className={`mini-toggle ${settings.gestureEnabled ? 'is-on' : ''}`}
          type="button"
          role="switch"
          aria-checked={settings.gestureEnabled}
          aria-label={`${gestureModeLabel}控制`}
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
            <option value="pointer">空中鼠标</option>
          </select>
        </label>
      </div>

      <div className="widget-setting-row voice-command-setting">
        <Mic2 size={18} aria-hidden="true" />
        <span>本机语音</span>
        <button
          className={`mini-toggle ${voiceStatus.enabled ? 'is-on' : ''}`}
          type="button"
          role="switch"
          aria-checked={voiceStatus.enabled}
          aria-label="本机语音命令"
          disabled={voiceStatus.phase === 'starting'}
          onClick={() => onVoiceEnabledChange(!voiceStatus.enabled)}
        >
          <i />
        </button>
        <small
          className={`voice-command-status is-${voiceStatus.phase}`}
          role={
            voiceStatus.phase === 'error' || voiceStatus.phase === 'unavailable'
              ? 'alert'
              : 'status'
          }
          title={voiceStatus.message}
        >
          {voiceControlSummary(voiceStatus)}
        </small>
      </div>
      <details className="voice-command-guide">
        <summary>查看固定语音口令（19）</summary>
        <div>
          <strong>中文（简体）</strong>
          <ul>
            {ZH_VOICE_COMMANDS.map((command) => (
              <li key={command}>{command}</li>
            ))}
          </ul>
          <strong>English</strong>
          <ul lang="en">
            {EN_VOICE_COMMANDS.map((command) => (
              <li key={command}>{command}</li>
            ))}
          </ul>
        </div>
      </details>
    </section>
  )
}

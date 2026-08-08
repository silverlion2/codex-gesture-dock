import {
  Maximize,
  Mic,
  MicOff,
  Scan,
  SlidersHorizontal,
} from 'lucide-react'
import type { AudioInputPhase } from '../hooks/useAudioInput'
import type { MediaDeviceOption } from '../hooks/useMediaDevices'
import type { CameraFraming } from '../lib/mediaPreferences'

interface MediaInputControlsProps {
  videoInputs: MediaDeviceOption[]
  audioInputs: MediaDeviceOption[]
  videoDeviceId: string
  audioDeviceId: string
  cameraFraming: CameraFraming
  audioPhase: AudioInputPhase
  audioLevel: number
  audioError: string
  onVideoDeviceChange: (deviceId: string) => void
  onAudioDeviceChange: (deviceId: string) => void
  onCameraFramingChange: (framing: CameraFraming) => void
  onAudioToggle: () => void
}

function DeviceSelects({
  videoInputs,
  audioInputs,
  videoDeviceId,
  audioDeviceId,
  onVideoDeviceChange,
  onAudioDeviceChange,
}: Pick<
  MediaInputControlsProps,
  | 'videoInputs'
  | 'audioInputs'
  | 'videoDeviceId'
  | 'audioDeviceId'
  | 'onVideoDeviceChange'
  | 'onAudioDeviceChange'
>) {
  return (
    <div className="media-device-selects">
      <label>
        <span>摄像头</span>
        <select
          aria-label="选择摄像头"
          value={videoDeviceId}
          onChange={(event) => onVideoDeviceChange(event.target.value)}
        >
          <option value="">系统默认摄像头</option>
          {videoInputs.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>麦克风</span>
        <select
          aria-label="选择麦克风"
          value={audioDeviceId}
          onChange={(event) => onAudioDeviceChange(event.target.value)}
        >
          <option value="">系统默认麦克风</option>
          {audioInputs.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
function FramingControl({
  cameraFraming,
  onCameraFramingChange,
}: Pick<
  MediaInputControlsProps,
  'cameraFraming' | 'onCameraFramingChange'
>) {
  return (
    <div className="camera-framing-control" role="group" aria-label="画面填充方式">
      <button
        type="button"
        aria-pressed={cameraFraming === 'cover'}
        onClick={() => onCameraFramingChange('cover')}
      >
        <Maximize size={14} aria-hidden="true" />
        填满
      </button>
      <button
        type="button"
        aria-pressed={cameraFraming === 'contain'}
        onClick={() => onCameraFramingChange('contain')}
      >
        <Scan size={14} aria-hidden="true" />
        完整
      </button>
    </div>
  )
}

function AudioToggle({
  audioPhase,
  audioLevel,
  onAudioToggle,
}: Pick<
  MediaInputControlsProps,
  'audioPhase' | 'audioLevel' | 'onAudioToggle'
>) {
  const active = audioPhase === 'active'
  const loading = audioPhase === 'loading'
  const levelPercent = Math.round(audioLevel * 100)

  return (
    <div className={`audio-input-toggle ${active ? 'is-active' : ''}`}>
      <button
        type="button"
        aria-label={active || loading ? '关闭麦克风' : '打开麦克风'}
        aria-pressed={active || loading}
        onClick={onAudioToggle}
      >
        {active || loading ? (
          <Mic size={16} aria-hidden="true" />
        ) : (
          <MicOff size={16} aria-hidden="true" />
        )}
        <span>{loading ? '连接中' : active ? '麦克风开启' : '麦克风关闭'}</span>
      </button>
      <span
        className="audio-level-meter"
        role="meter"
        aria-label="麦克风输入电平"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={active ? levelPercent : 0}
      >
        <i style={{ transform: `scaleX(${active ? audioLevel : 0})` }} />
      </span>
    </div>
  )
}

export function CompactMediaControls(props: MediaInputControlsProps) {
  return (
    <div className="compact-media-controls">
      <AudioToggle {...props} />
      <details className="mini-media-menu">
        <summary aria-label="打开摄像头与麦克风设置">
          <SlidersHorizontal size={16} aria-hidden="true" />
        </summary>
        <div className="mini-media-popover">
          <strong>镜头与声音</strong>
          <DeviceSelects {...props} />
          <FramingControl {...props} />
          {props.audioError ? <small role="alert">{props.audioError}</small> : null}
        </div>
      </details>
    </div>
  )
}

export function MediaInputPanel(props: MediaInputControlsProps) {
  return (
    <section className="media-input-panel" aria-label="摄像头与麦克风控制">
      <DeviceSelects {...props} />
      <FramingControl {...props} />
      <AudioToggle {...props} />
      {props.audioError ? <small role="alert">{props.audioError}</small> : null}
    </section>
  )
}

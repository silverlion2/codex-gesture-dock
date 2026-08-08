// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CompactMediaControls,
  MediaInputPanel,
} from './MediaInputControls'

afterEach(cleanup)

function mediaProps() {
  return {
    videoInputs: [{ deviceId: 'front', label: 'Front camera' }],
    audioInputs: [{ deviceId: 'desk', label: 'Desk microphone' }],
    videoDeviceId: '',
    audioDeviceId: '',
    cameraFraming: 'cover' as const,
    audioPhase: 'idle' as const,
    audioLevel: 0,
    audioError: '',
    onVideoDeviceChange: vi.fn(),
    onAudioDeviceChange: vi.fn(),
    onCameraFramingChange: vi.fn(),
    onAudioToggle: vi.fn(),
  }
}

describe('media input controls', () => {
  it('changes camera, microphone, framing, and microphone state', () => {
    const props = mediaProps()
    render(<MediaInputPanel {...props} />)

    fireEvent.change(screen.getByLabelText('选择摄像头'), {
      target: { value: 'front' },
    })
    fireEvent.change(screen.getByLabelText('选择麦克风'), {
      target: { value: 'desk' },
    })
    fireEvent.click(screen.getByRole('button', { name: '完整' }))
    fireEvent.click(screen.getByRole('button', { name: '打开麦克风' }))

    expect(props.onVideoDeviceChange).toHaveBeenCalledWith('front')
    expect(props.onAudioDeviceChange).toHaveBeenCalledWith('desk')
    expect(props.onCameraFramingChange).toHaveBeenCalledWith('contain')
    expect(props.onAudioToggle).toHaveBeenCalledTimes(1)
  })

  it('keeps compact device settings behind a named disclosure', () => {
    render(<CompactMediaControls {...mediaProps()} />)

    expect(
      screen.getByLabelText('打开摄像头与麦克风设置'),
    ).toBeTruthy()
    expect(
      screen
        .getByRole('meter', { name: '麦克风输入电平' })
        .getAttribute('aria-valuenow'),
    ).toBe('0')
  })
})

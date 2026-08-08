// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAudioInput } from './useAudioInput'

describe('useAudioInput', () => {
  const stopTrack = vi.fn()
  const closeContext = vi.fn(async () => undefined)
  const getUserMedia = vi.fn()

  beforeEach(() => {
    stopTrack.mockClear()
    closeContext.mockClear()
    getUserMedia.mockReset()
    getUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: stopTrack }],
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    })
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal(
      'AudioContext',
      class {
        createAnalyser() {
          return {
            fftSize: 256,
            smoothingTimeConstant: 0,
            getByteTimeDomainData: vi.fn(),
          }
        }
        createMediaStreamSource() {
          return { connect: vi.fn() }
        }
        close = closeContext
      },
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('requests the chosen microphone and releases it when muted', async () => {
    const onActivated = vi.fn()
    const { result } = renderHook(() =>
      useAudioInput({ deviceId: 'desk-mic', onActivated }),
    )

    await act(async () => result.current.start())

    expect(getUserMedia).toHaveBeenCalledWith({
      video: false,
      audio: {
        deviceId: { exact: 'desk-mic' },
        echoCancellation: true,
        noiseSuppression: true,
      },
    })
    expect(result.current.phase).toBe('active')
    expect(onActivated).toHaveBeenCalledTimes(1)

    act(() => result.current.stop())
    expect(result.current.phase).toBe('idle')
    expect(stopTrack).toHaveBeenCalledTimes(1)
    expect(closeContext).toHaveBeenCalledTimes(1)
  })

  it('shows an actionable error when microphone permission is denied', async () => {
    getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    const { result } = renderHook(() => useAudioInput({ deviceId: '' }))

    await act(async () => result.current.start())

    expect(result.current.phase).toBe('error')
    expect(result.current.error).toContain('麦克风权限被拒绝')
  })
})

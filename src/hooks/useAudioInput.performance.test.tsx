// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAudioInput } from './useAudioInput'

describe('useAudioInput performance policy', () => {
  const stopTrack = vi.fn()
  const closeContext = vi.fn(async () => {})
  const readSamples = vi.fn((samples: Uint8Array) => samples.fill(160))
  let nextFrame: FrameRequestCallback | null

  beforeEach(() => {
    nextFrame = null
    stopTrack.mockClear()
    closeContext.mockClear()
    readSamples.mockClear()
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: stopTrack }],
        })),
      },
    })
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      nextFrame = callback
      return 1
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('AudioContext', class {
      createAnalyser() {
        return {
          fftSize: 256,
          smoothingTimeConstant: 0,
          getByteTimeDomainData: readSamples,
        }
      }
      createMediaStreamSource() {
        return { connect: vi.fn() }
      }
      close = closeContext
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('releases the microphone stream when the meter is suspended', async () => {
    const { result, rerender } = renderHook(
      ({ meterActive }) => useAudioInput({ deviceId: '', meterActive }),
      { initialProps: { meterActive: true } },
    )

    await act(async () => result.current.start())
    act(() => nextFrame?.(160))
    expect(readSamples).toHaveBeenCalledTimes(1)
    expect(result.current.level).toBe(0.8)

    act(() => rerender({ meterActive: false }))
    expect(result.current.level).toBe(0)
    act(() => nextFrame?.(500))
    expect(readSamples).toHaveBeenCalledTimes(1)
    expect(stopTrack).toHaveBeenCalledOnce()
    expect(closeContext).toHaveBeenCalledOnce()
    expect(result.current.phase).toBe('idle')
  })

  it('releases the microphone when the document becomes hidden', async () => {
    const { result } = renderHook(() =>
      useAudioInput({ deviceId: '', meterActive: true }),
    )

    await act(async () => result.current.start())
    act(() => {
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        value: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(stopTrack).toHaveBeenCalledOnce()
    expect(closeContext).toHaveBeenCalledOnce()
    expect(result.current).toEqual(expect.objectContaining({
      level: 0,
      phase: 'idle',
    }))
  })
})

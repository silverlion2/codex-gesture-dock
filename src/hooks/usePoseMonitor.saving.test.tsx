// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePoseMonitor, type ReminderSettings } from './usePoseMonitor'

const mediaPipe = vi.hoisted(() => ({
  close: vi.fn(),
  detectForVideo: vi.fn(() => ({ landmarks: [] })),
}))

vi.mock('@mediapipe/tasks-vision', () => ({
  DrawingUtils: class {
    drawConnectors() {}
    drawLandmarks() {}
  },
  FilesetResolver: { forVisionTasks: vi.fn(async () => ({})) },
  PoseLandmarker: {
    POSE_CONNECTIONS: [],
    createFromOptions: vi.fn(async () => ({
      close: mediaPipe.close,
      detectForVideo: mediaPipe.detectForVideo,
    })),
  },
}))

const settings: ReminderSettings = {
  postureEnabled: true,
  sensitivity: 'medium',
  breakEnabled: true,
  breakMinutes: 50,
  gestureEnabled: true,
}

describe('usePoseMonitor saving policy', () => {
  let animationFrames: FrameRequestCallback[]
  let now: number
  let videoTime: number

  beforeEach(() => {
    animationFrames = []
    now = 1_000
    videoTime = 0
    mediaPipe.detectForVideo.mockClear()
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      animationFrames.push(callback)
      return animationFrames.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: vi.fn() }],
        })),
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('limits saving-mode inference and pauses it while hidden', async () => {
    const video = document.createElement('video')
    Object.defineProperties(video, {
      currentTime: { configurable: true, get: () => videoTime },
      play: { configurable: true, value: vi.fn(async () => undefined) },
      readyState: {
        configurable: true,
        get: () => HTMLMediaElement.HAVE_CURRENT_DATA,
      },
    })
    const { result } = renderHook(() =>
      usePoseMonitor({
        videoRef: { current: video },
        canvasRef: { current: null },
        settings,
        resourceSaving: true,
        onReminder: vi.fn(),
      }),
    )

    await act(async () => result.current.startSession())
    videoTime = 0.1
    act(() => animationFrames.shift()?.(16))
    expect(mediaPipe.detectForVideo).toHaveBeenCalledTimes(1)

    now += 150
    videoTime = 0.2
    act(() => animationFrames.shift()?.(32))
    expect(mediaPipe.detectForVideo).toHaveBeenCalledTimes(1)

    now += 71
    act(() => animationFrames.shift()?.(48))
    expect(mediaPipe.detectForVideo).toHaveBeenCalledTimes(2)

    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    now += 500
    videoTime = 0.3
    act(() => animationFrames.shift()?.(64))
    expect(mediaPipe.detectForVideo).toHaveBeenCalledTimes(2)
  })
})

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
  FilesetResolver: {
    forVisionTasks: vi.fn(async () => ({})),
  },
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

describe('usePoseMonitor camera loop', () => {
  let animationFrames: FrameRequestCallback[]
  let now: number
  let readyState: number
  let videoTime: number

  beforeEach(() => {
    animationFrames = []
    now = 1_000
    readyState = HTMLMediaElement.HAVE_NOTHING
    videoTime = 0
    mediaPipe.close.mockClear()
    mediaPipe.detectForVideo.mockClear()

    vi.spyOn(performance, 'now').mockImplementation(() => now)
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        animationFrames.push(callback)
        return animationFrames.length
      }),
    )
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

  it('recovers from a video readiness gap and caps synchronous inference', async () => {
    const video = document.createElement('video')
    Object.defineProperties(video, {
      currentTime: { configurable: true, get: () => videoTime },
      play: { configurable: true, value: vi.fn(async () => undefined) },
      readyState: { configurable: true, get: () => readyState },
    })
    const videoRef = { current: video }
    const canvasRef = { current: null }
    const { result, unmount } = renderHook(() =>
      usePoseMonitor({
        videoRef,
        canvasRef,
        settings,
        onReminder: vi.fn(),
      }),
    )

    await act(async () => result.current.startSession())
    expect(animationFrames).toHaveLength(1)

    act(() => animationFrames.shift()?.(16))
    expect(mediaPipe.detectForVideo).not.toHaveBeenCalled()
    expect(animationFrames).toHaveLength(1)

    readyState = HTMLMediaElement.HAVE_CURRENT_DATA
    videoTime = 0.1
    act(() => animationFrames.shift()?.(32))
    expect(mediaPipe.detectForVideo).toHaveBeenCalledTimes(1)

    now += 50
    videoTime = 0.2
    act(() => animationFrames.shift()?.(48))
    expect(mediaPipe.detectForVideo).toHaveBeenCalledTimes(1)

    now += 51
    act(() => animationFrames.shift()?.(64))
    expect(mediaPipe.detectForVideo).toHaveBeenCalledTimes(2)

    unmount()
    expect(mediaPipe.close).toHaveBeenCalledTimes(1)
  })

  it('requests a selected camera by exact device id', async () => {
    const video = document.createElement('video')
    Object.defineProperties(video, {
      play: { configurable: true, value: vi.fn(async () => undefined) },
      readyState: {
        configurable: true,
        get: () => HTMLMediaElement.HAVE_NOTHING,
      },
    })
    const { result } = renderHook(() =>
      usePoseMonitor({
        videoRef: { current: video },
        canvasRef: { current: null },
        settings,
        videoDeviceId: 'front-camera',
        onReminder: vi.fn(),
      }),
    )

    await act(async () => result.current.startSession())

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        deviceId: { exact: 'front-camera' },
      },
      audio: false,
    })
  })
})

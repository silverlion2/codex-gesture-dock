// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGestureControl } from './useGestureControl'
import { CODEX_GESTURE_BINDINGS } from '../lib/gestures'

const runtime = vi.hoisted(() => ({
  recognizeForVideo: vi.fn(),
  initialize: vi.fn(),
  close: vi.fn(),
}))

vi.mock('../lib/visionRuntime', () => ({
  loadVisionRuntime: vi.fn(async () => ({
    FilesetResolver: { forVisionTasks: vi.fn(async () => ({})) },
    GestureRecognizer: {
      createFromOptions: vi.fn(async () => runtime),
    },
  })),
}))

vi.mock('../lib/gestureRecognizerClient', () => ({
  createGestureRecognizerClient: () => ({
    initialize: runtime.initialize,
    detect: vi.fn(async () => runtime.recognizeForVideo()),
    close: runtime.close,
  }),
}))

function resultFor(categoryName: string | null = null, score = 0) {
  return {
    gestures: categoryName ? [[{ categoryName, score }]] : [[]],
    landmarks: [],
  }
}

async function flushStartup() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('useGestureControl runtime safety', () => {
  let frames: FrameRequestCallback[]
  let videoTime: number
  let now: number

  beforeEach(() => {
    frames = []
    videoTime = 0
    now = 1_000
    runtime.recognizeForVideo.mockReset()
    runtime.initialize.mockReset().mockResolvedValue(undefined)
    runtime.close.mockReset()
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ close: vi.fn() })))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function renderControl(onAction = vi.fn(async () => ({
    ok: true as const,
    action: 'quick_chat' as const,
    message: 'ok',
  }))) {
    const video = document.createElement('video')
    Object.defineProperty(video, 'readyState', { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA })
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => videoTime })
    const videoRef = { current: video }
    return {
      onAction,
      ...renderHook(() => useGestureControl({
        active: true,
        bindings: CODEX_GESTURE_BINDINGS,
        enabled: true,
        onAction,
        videoRef,
      })),
    }
  }

  it('stops inference after a recognizer runtime exception and reports it', async () => {
    runtime.recognizeForVideo.mockImplementation(() => {
      throw new Error('recognizer exploded')
    })
    const { result, unmount } = renderControl()
    await flushStartup()
    await vi.waitFor(() => expect(result.current.modelPhase).toBe('ready'))
    expect(frames.length).toBeGreaterThan(0)

    const detector = frames.at(-1)
    frames = []
    runtime.recognizeForVideo.mockImplementationOnce(() => {
      throw new Error('recognizer exploded')
    })
    await act(async () => { await detector?.(0) })

    expect(result.current.modelPhase).toBe('error')
    expect(result.current.error).toBe('recognizer exploded')
    expect(frames).toHaveLength(0)
    unmount()
  })

  it('reports an async action rejection without an unhandled rejection', async () => {
    const onAction = vi.fn(() => Promise.reject(new Error('action failed')))
    runtime.recognizeForVideo.mockImplementation(() => resultFor('Victory', 0.95))
    const { result, unmount } = renderControl(onAction)
    await flushStartup()
    await vi.waitFor(() => expect(result.current.modelPhase).toBe('ready'))

    const firstDetector = frames.at(-1)
    frames = []
    await act(async () => { await firstDetector?.(0) })
    await flushStartup()
    for (let attempt = 0; attempt < 12 && !onAction.mock.calls.length; attempt += 1) {
      videoTime += 1
      now += 200
      await act(async () => { await frames.pop()?.(0) })
      await flushStartup()
    }
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBe('action failed')
    unmount()
  })

  it('closes the worker client when the hook unmounts after initialization', async () => {
    const { unmount } = renderControl()
    await flushStartup()
    unmount()
    expect(runtime.close).toHaveBeenCalledTimes(1)
  })

  it('closes an initializing worker immediately on unmount', async () => {
    let complete!: () => void
    runtime.initialize.mockImplementation(() => new Promise<void>((resolve) => { complete = resolve }))
    const { unmount } = renderControl()
    unmount()
    expect(runtime.close).toHaveBeenCalledTimes(1)
    await act(async () => { complete(); await flushStartup() })
    expect(frames).toHaveLength(0)
  })

  it('discards a capture spanning hide/show and resumes the loop', async () => {
    let finishCapture!: (bitmap: ImageBitmap) => void
    vi.mocked(createImageBitmap).mockImplementationOnce(() => new Promise((resolve) => { finishCapture = resolve }))
    runtime.recognizeForVideo.mockReturnValue(resultFor())
    const { result, unmount } = renderControl()
    await act(flushStartup)
    const detect = frames.pop()
    await act(async () => { detect?.(0); await Promise.resolve() })
    const hidden = vi.spyOn(document, 'hidden', 'get')
    hidden.mockReturnValue(true)
    document.dispatchEvent(new Event('visibilitychange'))
    hidden.mockReturnValue(false)
    document.dispatchEvent(new Event('visibilitychange'))
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap
    await act(async () => { finishCapture(bitmap); await flushStartup() })
    expect(bitmap.close).toHaveBeenCalledOnce()
    expect(runtime.recognizeForVideo).not.toHaveBeenCalled()
    expect(frames.length).toBeGreaterThan(0)
    videoTime += 1
    now += 200
    await act(async () => { frames.pop()?.(0); await flushStartup() })
    expect(result.current.processedFrames).toBe(1)
    unmount()
  })
})

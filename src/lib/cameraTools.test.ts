// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureVideoFrame } from './cameraTools'

afterEach(() => vi.restoreAllMocks())

describe('captureVideoFrame', () => {
  it('captures a mirrored frame with a timestamped local filename', () => {
    const video = document.createElement('video')
    Object.defineProperties(video, {
      readyState: { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA },
      videoWidth: { configurable: true, value: 1280 },
      videoHeight: { configurable: true, value: 720 },
    })
    const drawImage = vi.fn()
    const translate = vi.fn()
    const scale = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
      translate,
      scale,
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/png;base64,scan',
    )

    const result = captureVideoFrame(
      video,
      true,
      new Date('2026-08-08T09:10:11.000Z'),
    )

    expect(translate).toHaveBeenCalledWith(1280, 0)
    expect(scale).toHaveBeenCalledWith(-1, 1)
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 1280, 720)
    expect(result).toEqual({
      dataUrl: 'data:image/png;base64,scan',
      filename: 'codex-scan-2026-08-08T09-10-11Z.png',
    })
  })

  it('refuses to capture before a frame is available', () => {
    const video = document.createElement('video')
    Object.defineProperty(video, 'readyState', {
      configurable: true,
      value: HTMLMediaElement.HAVE_NOTHING,
    })

    expect(() => captureVideoFrame(video, false)).toThrow('摄像头画面尚未就绪')
  })
})

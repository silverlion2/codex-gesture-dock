// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MiniCameraControls } from './MiniCameraControls'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderControls(
  overrides: Partial<React.ComponentProps<typeof MiniCameraControls>> = {},
) {
  const props: React.ComponentProps<typeof MiniCameraControls> = {
    mode: 'monitor',
    phase: 'idle',
    status: 'away',
    score: null,
    actionLabel: '开始监测',
    mirrored: true,
    videoRef: createRef<HTMLVideoElement>(),
    scanPhase: 'idle',
    scanResult: null,
    scanError: '',
    mediaControls: null,
    onClearScan: vi.fn(),
    onSessionToggle: vi.fn(),
    onMessage: vi.fn(),
    ...overrides,
  }

  render(<MiniCameraControls {...props} />)
  return props
}

describe('MiniCameraControls', () => {
  it('starts the camera from the compact posture view', () => {
    const props = renderControls()

    expect(screen.getByText('摄像头待命')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '开始监测' }))
    expect(props.onSessionToggle).toHaveBeenCalledTimes(1)
  })

  it('copies a detected code without opening the full dashboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const props = renderControls({
      mode: 'codes',
      phase: 'monitoring',
      scanPhase: 'detected',
      scanResult: { text: 'https://example.test', format: 'QR_CODE' },
    })

    fireEvent.click(screen.getByRole('button', { name: '复制扫描结果' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://example.test'))
    expect(props.onMessage).toHaveBeenCalledWith('扫描结果已复制')
  })

  it('offers to start the camera before taking a document snapshot', () => {
    const props = renderControls({ mode: 'document' })

    expect(screen.getByText('先启动摄像头')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '启动' }))
    expect(props.onSessionToggle).toHaveBeenCalledTimes(1)
  })

  it('starts expression masks from the compact view', () => {
    const props = renderControls({ mode: 'masks' })

    expect(screen.getByText('表情动态面具')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '启动' }))
    expect(props.onSessionToggle).toHaveBeenCalledTimes(1)
  })

  it('directs compact OCR users to the full panel without starting the camera', () => {
    const props = renderControls({ mode: 'ocr' })

    expect(screen.getByText('文件 OCR')).toBeTruthy()
    expect(screen.getByText('点击右上角展开，在完整面板中选择文件')).toBeTruthy()
    expect(props.onSessionToggle).not.toHaveBeenCalled()
  })

  it('directs compact image-comparison users to the full panel without starting the camera', () => {
    const props = renderControls({ mode: 'compare' })

    expect(screen.getByText('图片对比')).toBeTruthy()
    expect(screen.getByRole('region', { name: '迷你图片对比控制' })).toBeTruthy()
    expect(props.onSessionToggle).not.toHaveBeenCalled()
  })

  it('directs compact color-analysis users to the full panel without starting the camera', () => {
    const props = renderControls({ mode: 'colors' })

    expect(screen.getByText('颜色实验室')).toBeTruthy()
    expect(screen.getByRole('region', { name: '迷你颜色分析控制' })).toBeTruthy()
    expect(props.onSessionToggle).not.toHaveBeenCalled()
  })
})

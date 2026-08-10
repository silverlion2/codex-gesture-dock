// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeCodeImage } from '../lib/codeImageScanner'
import { CameraToolPanel } from './CameraToolPanel'

vi.mock('../lib/codeImageScanner', () => ({
  decodeCodeImage: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderCodePanel(onMessage = vi.fn()) {
  const onClearScan = vi.fn()
  const view = render(
    <CameraToolPanel
      mode="codes"
      videoRef={{ current: null }}
      mirrored={false}
      sessionReady={false}
      scanPhase="idle"
      scanResult={null}
      scanError=""
      onClearScan={onClearScan}
      onMessage={onMessage}
    />,
  )
  return { ...view, onClearScan }
}

describe('CameraToolPanel image scanning', () => {
  it('decodes a local image without requiring the camera', async () => {
    vi.mocked(decodeCodeImage).mockResolvedValue({ text: 'LOCAL-QR-123', format: 'QR_CODE' })
    const onMessage = vi.fn()
    const { container, onClearScan } = renderCodePanel(onMessage)
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
    expect(input.accept).toContain('image/png')

    fireEvent.change(input, { target: { files: [new File(['qr'], 'qr.png', { type: 'image/png' })] } })

    await waitFor(() => expect(screen.getByText('LOCAL-QR-123')).toBeTruthy())
    expect(screen.getByText('QR CODE · 图片')).toBeTruthy()
    expect(onMessage).toHaveBeenCalledWith('已在本机从图片识别 QR CODE')
    fireEvent.click(screen.getByRole('button', { name: '继续扫描' }))
    expect(onClearScan).toHaveBeenCalledTimes(1)
  })

  it('shows an image-specific error while keeping camera startup optional', async () => {
    vi.mocked(decodeCodeImage).mockRejectedValue(new Error('图片中未找到可识别的二维码或条码'))
    const { container } = renderCodePanel()
    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['empty'], 'empty.png', { type: 'image/png' })] },
    })

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('图片中未找到'))
    expect(screen.getByText(/启动摄像头继续实时扫描/)).toBeTruthy()
  })
})

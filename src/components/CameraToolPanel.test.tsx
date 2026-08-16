// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { codeScanBatchCsv, decodeCodeImage, decodeCodeImageBatch } from '../lib/codeImageScanner'
import { CameraToolPanel } from './CameraToolPanel'

vi.mock('../lib/codeImageScanner', () => ({
  decodeCodeImage: vi.fn(),
  decodeCodeImageBatch: vi.fn(),
  codeScanBatchCsv: vi.fn(),
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
  it('switches between local scanning and offline QR creation without starting the camera', () => {
    renderCodePanel()
    expect(screen.getByText(/单张或批量 2–20 张/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '生成 QR' }))
    expect(screen.getByText('待生成二维码')).toBeTruthy()
    expect(screen.getByRole('button', { name: '扫描识别' }).getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: '扫描识别' }))
    expect(screen.getByText(/单张或批量 2–20 张/)).toBeTruthy()
  })

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

  it('scans multiple images, reports partial success, and exports CSV', async () => {
    vi.mocked(decodeCodeImageBatch).mockResolvedValue([
      { filename: 'a.png', status: 'detected', text: 'A-123', format: 'QR_CODE', error: '' },
      { filename: 'b.png', status: 'not-found', text: '', format: '', error: '图片中未找到可识别的二维码或条码' },
    ])
    vi.mocked(codeScanBatchCsv).mockReturnValue('\uFEFFcsv')
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:csv')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const { container } = renderCodePanel()
    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, { target: { files: [new File(['a'], 'a.png', { type: 'image/png' }), new File(['b'], 'b.png', { type: 'image/png' })] } })
    await waitFor(() => expect(screen.getByText('1/2 成功')).toBeTruthy())
    expect(screen.getByText('A-123')).toBeTruthy()
    expect(screen.getByText('未找到码')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '导出 CSV' }))
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
  })
})

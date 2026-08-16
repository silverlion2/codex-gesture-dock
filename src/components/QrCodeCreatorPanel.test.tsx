// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildQrPayload, createQrSvg } from '../lib/qrCodeCreator'
import { QrCodeCreatorPanel } from './QrCodeCreatorPanel'

vi.mock('../lib/qrCodeCreator', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/qrCodeCreator')>(),
  buildQrPayload: vi.fn(),
  createQrSvg: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('QrCodeCreatorPanel', () => {
  it('switches payload types, generates a local preview, copies content, and invalidates stale output', async () => {
    vi.mocked(buildQrPayload).mockReturnValue('https://example.com/')
    vi.mocked(createQrSvg).mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"/>')
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:qr-preview')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) }
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard })
    const onMessage = vi.fn()
    render(<QrCodeCreatorPanel onMessage={onMessage} />)

    fireEvent.click(screen.getByRole('button', { name: '网址' }))
    fireEvent.change(screen.getByLabelText('二维码网址'), { target: { value: 'https://example.com' } })
    fireEvent.click(screen.getByRole('button', { name: '生成二维码' }))

    await waitFor(() => expect(screen.getByRole('img', { name: '生成的网址二维码' })).toBeTruthy())
    expect(vi.mocked(buildQrPayload)).toHaveBeenCalledWith(expect.objectContaining({ kind: 'url', url: 'https://example.com' }))
    expect(vi.mocked(createQrSvg)).toHaveBeenCalledWith('https://example.com/', 512)
    expect(onMessage).toHaveBeenCalledWith('已在本机生成 网址二维码，请用另一台设备试扫后导出')
    expect(screen.getByRole('button', { name: '导出 SVG' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '导出 PNG' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '复制原始内容' }))
    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledWith('https://example.com/'))
    fireEvent.change(screen.getByLabelText('二维码输出尺寸'), { target: { value: '1024' } })
    expect(screen.queryByRole('img', { name: '生成的网址二维码' })).toBeNull()
    expect(screen.queryByRole('button', { name: '导出 SVG' })).toBeNull()
  })

  it('shows writer validation errors without exposing export actions', async () => {
    vi.mocked(buildQrPayload).mockImplementation(() => { throw new Error('请输入要写入二维码的文字') })
    render(<QrCodeCreatorPanel onMessage={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '生成二维码' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('请输入要写入二维码的文字'))
    expect(screen.queryByRole('button', { name: '导出 PNG' })).toBeNull()
  })
})

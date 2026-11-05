// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
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
  vi.unstubAllGlobals()
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

async function readyPreview() {
  vi.mocked(buildQrPayload).mockReturnValue('original content')
  vi.mocked(createQrSvg).mockResolvedValue('<svg/>')
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:qr-preview')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  const onMessage = vi.fn()
  const view = render(<QrCodeCreatorPanel onMessage={onMessage} />)
  fireEvent.click(screen.getByRole('button', { name: '生成二维码' }))
  await screen.findByRole('img')
  onMessage.mockClear()
  return { ...view, onMessage }
}

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

  it.each(['content', 'type', 'size'])('discards a pending generation when %s changes', async (change) => {
    const pending = deferred<string>()
    vi.mocked(buildQrPayload).mockReturnValue('old content')
    vi.mocked(createQrSvg).mockReturnValue(pending.promise)
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:old')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const onMessage = vi.fn()
    render(<QrCodeCreatorPanel onMessage={onMessage} />)
    fireEvent.click(screen.getByRole('button', { name: '生成二维码' }))
    if (change === 'content') fireEvent.change(screen.getByLabelText('二维码文字内容'), { target: { value: 'new content' } })
    if (change === 'type') fireEvent.click(screen.getByRole('button', { name: '网址' }))
    if (change === 'size') fireEvent.change(screen.getByLabelText('二维码输出尺寸'), { target: { value: '1024' } })
    await act(async () => pending.resolve('<svg/>'))
    expect(screen.queryByRole('img')).toBeNull()
    expect(createUrl).not.toHaveBeenCalled()
    expect(onMessage).not.toHaveBeenCalled()
    expect((screen.getByRole('button', { name: '生成二维码' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('keeps the newer result when an older generation rejects', async () => {
    const old = deferred<string>()
    vi.mocked(buildQrPayload).mockReturnValue('new content')
    vi.mocked(createQrSvg).mockReturnValueOnce(old.promise).mockResolvedValueOnce('<svg/>')
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:new')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    render(<QrCodeCreatorPanel onMessage={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '生成二维码' }))
    fireEvent.change(screen.getByLabelText('二维码文字内容'), { target: { value: 'new content' } })
    fireEvent.click(screen.getByRole('button', { name: '生成二维码' }))
    await act(async () => old.reject(new Error('old failure')))
    expect(screen.queryByRole('alert')).toBeNull()
    expect((await screen.findByRole('img')).getAttribute('src')).toBe('blob:new')
  })

  it('reports clipboard denial and allows retry with the same preview', async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const { onMessage } = await readyPreview()
    fireEvent.click(screen.getByRole('button', { name: '复制原始内容' }))
    expect((await screen.findByRole('alert')).textContent).toContain('剪贴板')
    expect(onMessage).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '复制原始内容' }))
    await screen.findByRole('button', { name: '已复制内容' })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(writeText).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('img')).toBeTruthy()
  })

  it.each(['resolve', 'reject'])('ignores a clipboard %s after editing', async (outcome) => {
    const pending = deferred<void>()
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(() => pending.promise) } })
    const { onMessage } = await readyPreview()
    fireEvent.click(screen.getByRole('button', { name: '复制原始内容' }))
    fireEvent.change(screen.getByLabelText('二维码文字内容'), { target: { value: 'changed' } })
    await act(async () => outcome === 'resolve' ? pending.resolve() : pending.reject(new Error('denied')))
    expect(onMessage).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: '已复制内容' })).toBeNull()
  })

  it.each(['edit', 'unmount'])('does not download a PNG that finishes after %s', async (change) => {
    const decoded = new EventTarget()
    vi.stubGlobal('Image', class { addEventListener = decoded.addEventListener.bind(decoded); src = '' })
    const encoding = deferred<Blob>()
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect: vi.fn(), drawImage } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => { void encoding.promise.then(callback) })
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const { unmount, onMessage } = await readyPreview()
    fireEvent.click(screen.getByRole('button', { name: '导出 PNG' }))
    await act(async () => decoded.dispatchEvent(new Event('load')))
    expect(drawImage).toHaveBeenCalledTimes(1)
    if (change === 'edit') fireEvent.change(screen.getByLabelText('二维码文字内容'), { target: { value: 'changed' } })
    else unmount()
    await act(async () => encoding.resolve(new Blob(['png'], { type: 'image/png' })))
    expect(download).not.toHaveBeenCalled()
    expect(onMessage).not.toHaveBeenCalled()
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  })

  it.each(['load', 'error'])('ignores a PNG image %s after returning to editing', async (event) => {
    const decoded = new EventTarget()
    vi.stubGlobal('Image', class { addEventListener = decoded.addEventListener.bind(decoded); src = '' })
    const draw = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    const { onMessage } = await readyPreview()
    fireEvent.click(screen.getByRole('button', { name: '导出 PNG' }))
    fireEvent.click(screen.getByRole('button', { name: '返回编辑' }))
    await act(async () => decoded.dispatchEvent(new Event(event)))
    expect(draw).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(onMessage).not.toHaveBeenCalled()
  })

  it('discards generation after unmount without allocating a preview URL', async () => {
    const pending = deferred<string>()
    vi.mocked(buildQrPayload).mockReturnValue('content')
    vi.mocked(createQrSvg).mockReturnValue(pending.promise)
    const create = vi.spyOn(URL, 'createObjectURL')
    const onMessage = vi.fn()
    const { unmount } = render(<QrCodeCreatorPanel onMessage={onMessage} />)
    fireEvent.click(screen.getByRole('button', { name: '生成二维码' }))
    unmount()
    await act(async () => pending.resolve('<svg/>'))
    expect(create).not.toHaveBeenCalled()
    expect(onMessage).not.toHaveBeenCalled()
  })

  it('releases each preview once, including regeneration under StrictMode', async () => {
    vi.mocked(buildQrPayload).mockReturnValue('content')
    vi.mocked(createQrSvg).mockResolvedValue('<svg/>')
    vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const { unmount } = render(<StrictMode><QrCodeCreatorPanel onMessage={vi.fn()} /></StrictMode>)
    fireEvent.click(screen.getByRole('button', { name: '生成二维码' }))
    await screen.findByRole('img')
    expect(revoke).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '重新生成' }))
    await waitFor(() => expect(screen.getByRole('img').getAttribute('src')).toBe('blob:second'))
    expect(revoke.mock.calls).toEqual([['blob:first']])
    unmount()
    expect(revoke.mock.calls).toEqual([['blob:first'], ['blob:second']])
  })
})

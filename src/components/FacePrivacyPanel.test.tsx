// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureFromImageFile } from '../lib/documentScanner'
import { applyFacePrivacy, detectPrivateFaces } from '../lib/facePrivacy'
import { inspectImageMetadata } from '../lib/imageMetadata'
import { FacePrivacyPanel } from './FacePrivacyPanel'

vi.mock('../lib/documentScanner', () => ({ captureFromImageFile: vi.fn() }))
vi.mock('../lib/facePrivacy', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/facePrivacy')>(),
  applyFacePrivacy: vi.fn(),
  detectPrivateFaces: vi.fn(),
}))
vi.mock('../lib/imageMetadata', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/imageMetadata')>(),
  inspectImageMetadata: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const capture = {
  dataUrl: 'data:image/png;base64,cGhvdG8=',
  filename: 'team.png',
}

const faces = [
  { id: 'face-1', x: 0.1, y: 0.2, width: 0.2, height: 0.3, confidence: 0.94, enabled: true },
  { id: 'face-2', x: 0.6, y: 0.25, width: 0.18, height: 0.28, confidence: 0.88, enabled: true },
]

describe('FacePrivacyPanel', () => {
  it('detects faces, lets the user review each one, and changes the baked effect', async () => {
    vi.mocked(captureFromImageFile).mockResolvedValue(capture)
    vi.mocked(detectPrivateFaces).mockResolvedValue(faces)
    vi.mocked(inspectImageMetadata).mockResolvedValue({
      status: 'inspected',
      hasGps: true,
      items: [{ id: 'gps', label: '拍摄位置', value: '31.23042, 121.47370', risk: 'high' }],
    })
    vi.mocked(applyFacePrivacy).mockResolvedValue({
      dataUrl: 'data:image/png;base64,cHJpdmF0ZQ==',
      width: 1_200,
      height: 800,
    })
    const onMessage = vi.fn()
    const { container } = render(<FacePrivacyPanel onMessage={onMessage} />)

    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['photo'], 'team.png', { type: 'image/png' })] },
    })

    await waitFor(() => expect(screen.getByRole('button', { name: '人脸 1 已处理' })).toBeTruthy())
    expect(screen.getByRole('button', { name: '人脸 2 已处理' })).toBeTruthy()
    expect(screen.getByText('检测 2 张 · 手动 0 处 · 处理 2 处')).toBeTruthy()
    expect(onMessage).toHaveBeenCalledWith('已在本机检测到 2 张人脸；另发现 1 项照片隐私元数据，请逐项复核')
    expect(screen.getByRole('region', { name: '照片元数据隐私检查' }).textContent).toContain('31.23042, 121.47370')

    fireEvent.click(screen.getByRole('button', { name: '人脸 1 已处理' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '人脸 1 已跳过' })).toBeTruthy())
    expect(vi.mocked(applyFacePrivacy).mock.calls.at(-1)?.[1][0].enabled).toBe(false)

    fireEvent.change(screen.getByRole('combobox', { name: '隐私效果' }), { target: { value: 'pixelate' } })
    await waitFor(() => expect(vi.mocked(applyFacePrivacy).mock.calls.at(-1)?.[2]).toBe('pixelate'))
    expect(screen.getByRole('button', { name: '确认并导出隐私 PNG' })).toBeTruthy()
  })

  it('re-encodes a no-face result and enables a metadata-free export', async () => {
    vi.mocked(captureFromImageFile).mockResolvedValue(capture)
    vi.mocked(detectPrivateFaces).mockResolvedValue([])
    vi.mocked(inspectImageMetadata).mockResolvedValue({ status: 'inspected', hasGps: false, items: [] })
    vi.mocked(applyFacePrivacy).mockResolvedValue({
      dataUrl: 'data:image/png;base64,bWV0YWRhdGEtZnJlZQ==',
      width: 1_200,
      height: 800,
    })
    const onMessage = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const { container } = render(<FacePrivacyPanel onMessage={onMessage} />)
    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['photo'], 'empty.png', { type: 'image/png' })] },
    })
    await waitFor(() => expect(screen.getByText(/未检测到人脸/)).toBeTruthy())
    expect(vi.mocked(applyFacePrivacy)).toHaveBeenCalledWith(capture.dataUrl, [], 'blur', 0.18)
    expect(screen.getByText('未发现常见 EXIF 隐私字段')).toBeTruthy()
    const exportButton = screen.getByRole('button', { name: '导出无元数据 PNG' }) as HTMLButtonElement
    expect(exportButton.disabled).toBe(false)
    fireEvent.click(exportButton)
    expect(click).toHaveBeenCalledOnce()
    expect(onMessage).toHaveBeenCalledWith('未检测到人脸；仍可导出不携带原文件元数据的 PNG')
  })

  it('adds, moves, resizes, and removes a manual privacy region', async () => {
    vi.mocked(captureFromImageFile).mockResolvedValue(capture)
    vi.mocked(detectPrivateFaces).mockResolvedValue([])
    vi.mocked(inspectImageMetadata).mockResolvedValue({ status: 'inspected', hasGps: false, items: [] })
    vi.mocked(applyFacePrivacy).mockResolvedValue({
      dataUrl: 'data:image/png;base64,cHJpdmF0ZQ==',
      width: 1_200,
      height: 800,
    })
    const onMessage = vi.fn()
    const { container } = render(<FacePrivacyPanel onMessage={onMessage} />)
    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['photo'], 'missed-face.png', { type: 'image/png' })] },
    })

    await waitFor(() => expect(screen.getByRole('button', { name: '添加手动隐私区' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '添加手动隐私区' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '手动隐私区 1 已处理' })).toBeTruthy())
    expect(vi.mocked(applyFacePrivacy).mock.calls.at(-1)?.[1]).toEqual([
      expect.objectContaining({ source: 'manual', x: 0.36, y: 0.3, width: 0.28, height: 0.35 }),
    ])

    fireEvent.keyDown(screen.getByRole('button', { name: '手动隐私区 1 已处理' }), { key: 'ArrowRight' })
    await waitFor(() => expect(screen.getByRole('button', { name: '手动隐私区 1 已处理' })).toBeTruthy())
    expect(vi.mocked(applyFacePrivacy).mock.calls.at(-1)?.[1][0].x).toBeCloseTo(0.365)

    fireEvent.keyDown(screen.getByRole('button', { name: '手动隐私区 1 已处理' }), { key: 'ArrowRight', altKey: true })
    await waitFor(() => expect(screen.getByRole('button', { name: '手动隐私区 1 已处理' })).toBeTruthy())
    expect(vi.mocked(applyFacePrivacy).mock.calls.at(-1)?.[1][0].width).toBeCloseTo(0.285)

    fireEvent.keyDown(screen.getByRole('button', { name: '手动隐私区 1 已处理' }), { key: 'Delete' })
    await waitFor(() => expect(screen.queryByRole('button', { name: '手动隐私区 1 已处理' })).toBeNull())
    expect(vi.mocked(applyFacePrivacy).mock.calls.at(-1)?.[1]).toEqual([])
    expect(onMessage).toHaveBeenCalledWith('已添加手动隐私区；可拖动或用方向键调整位置')
  })
})

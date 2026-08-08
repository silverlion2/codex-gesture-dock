// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { recognizeLocalFile } from '../lib/localOcr'
import { OcrToolPanel } from './OcrToolPanel'

vi.mock('../lib/localOcr', () => ({
  recognizeLocalFile: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('OcrToolPanel', () => {
  it('offers local image and PDF OCR', () => {
    render(<OcrToolPanel mode="ocr" onMessage={vi.fn()} />)

    expect(screen.getByText('导入图像或 PDF')).toBeTruthy()
    expect(screen.getByText('模型与文件均留在本机')).toBeTruthy()
    expect(screen.getByRole('combobox', { name: '识别语言' })).toBeTruthy()
  })

  it('turns recognized card text into editable fields', async () => {
    vi.mocked(recognizeLocalFile).mockResolvedValue({
      text: 'Alex Chen\nEngineer\nNorthwind Inc.\nalex@example.com\n+1 555 0100',
      pageCount: 1,
      source: 'ocr',
    })
    const onMessage = vi.fn()
    const { container } = render(<OcrToolPanel mode="card" onMessage={onMessage} />)
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    expect(input).toBeTruthy()

    fireEvent.change(input!, {
      target: { files: [new File(['image'], 'card.png', { type: 'image/png' })] },
    })

    await waitFor(() => expect(screen.getByDisplayValue('Alex Chen')).toBeTruthy())
    expect(screen.getByDisplayValue('alex@example.com')).toBeTruthy()
    expect(screen.getByRole('button', { name: '确认并导出 VCF' })).toBeTruthy()
    expect(onMessage).toHaveBeenCalledWith('名片已在本机识别，请确认字段后导出')
  })
})

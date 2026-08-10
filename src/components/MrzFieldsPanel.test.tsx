// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractMrz } from '../lib/mrzExtraction'
import { MrzFieldsPanel } from './MrzFieldsPanel'

const extractionPromise = extractMrz([
  'P<GBRERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
  'L898902C36GBR7408122F1204159ZE184226B<<<<<10',
].join('\n'))!

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('MrzFieldsPanel', () => {
  it('requires human review before copying or exporting editable MRZ fields', async () => {
    const extraction = (await extractionPromise)!
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mrz')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const onMessage = vi.fn()
    render(<MrzFieldsPanel extraction={extraction} onBack={vi.fn()} onMessage={onMessage} />)

    expect(screen.getByText('TD3 · 校验位通过')).toBeTruthy()
    expect(screen.getByText(/不能证明证件或身份真实/)).toBeTruthy()
    expect((screen.getByRole('button', { name: '复制 JSON' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '确认并导出 JSON' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByRole('textbox', { name: '证件号码' }), { target: { value: 'REVIEWED-123' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /我已对照原证件逐项复核/ }))
    fireEvent.click(screen.getByRole('button', { name: '复制 JSON' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    const copied = JSON.parse(writeText.mock.calls[0][0])
    expect(copied).toMatchObject({
      format: 'TD3',
      fields: { documentNumber: 'REVIEWED-123' },
      humanReviewed: true,
      authenticityVerified: false,
    })
    expect(copied).not.toHaveProperty('rawLines')

    fireEvent.click(screen.getByRole('button', { name: '确认并导出 JSON' }))
    expect(click).toHaveBeenCalledTimes(1)
    expect(onMessage).toHaveBeenCalledWith('已导出人工复核的 MRZ JSON')
  })
})

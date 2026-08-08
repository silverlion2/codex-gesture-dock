// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CameraModeSwitcher } from './CameraModeSwitcher'

afterEach(cleanup)

describe('CameraModeSwitcher', () => {
  it('exposes all modes and reports the selected tool', () => {
    const onChange = vi.fn()
    render(<CameraModeSwitcher mode="monitor" onChange={onChange} />)

    expect(screen.getByRole('button', { name: '姿态' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '扫码' }))
    expect(onChange).toHaveBeenCalledWith('codes')
    fireEvent.click(screen.getByRole('button', { name: '文档' }))
    expect(onChange).toHaveBeenCalledWith('document')
  })
})

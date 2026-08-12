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
    fireEvent.click(screen.getByRole('button', { name: '面具' }))
    expect(onChange).toHaveBeenCalledWith('masks')
    fireEvent.click(screen.getByRole('button', { name: '扫码' }))
    expect(onChange).toHaveBeenCalledWith('codes')
    fireEvent.click(screen.getByRole('button', { name: '文档' }))
    expect(onChange).toHaveBeenCalledWith('document')

    fireEvent.click(screen.getByRole('button', { name: '文字' }))
    expect(onChange).toHaveBeenCalledWith('ocr')

    fireEvent.click(screen.getByRole('button', { name: '名片' }))
    expect(onChange).toHaveBeenCalledWith('card')

    fireEvent.click(screen.getByRole('button', { name: '隐私' }))
    expect(onChange).toHaveBeenCalledWith('privacy')

    fireEvent.click(screen.getByRole('button', { name: '背景' }))
    expect(onChange).toHaveBeenCalledWith('background')

    fireEvent.click(screen.getByRole('button', { name: '物体' }))
    expect(onChange).toHaveBeenCalledWith('objects')

    fireEvent.click(screen.getByRole('button', { name: '图片' }))
    expect(onChange).toHaveBeenCalledWith('compare')

    fireEvent.click(screen.getByRole('button', { name: '颜色' }))
    expect(onChange).toHaveBeenCalledWith('colors')
  })
})

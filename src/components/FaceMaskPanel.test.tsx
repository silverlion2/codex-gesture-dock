// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FaceMaskPanel } from './FaceMaskPanel'

afterEach(cleanup)

describe('FaceMaskPanel', () => {
  it('switches mask styles and starts the camera when needed', () => {
    const onStyleChange = vi.fn()
    const onStart = vi.fn()
    render(<FaceMaskPanel style="fox" onStyleChange={onStyleChange} sessionActive={false} onStart={onStart} />)

    expect(screen.getByRole('radio', { name: /霓虹狐/ }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('radio', { name: /机甲面罩/ }))
    expect(onStyleChange).toHaveBeenCalledWith('mecha')
    fireEvent.click(screen.getByRole('button', { name: '启动摄像头体验' }))
    expect(onStart).toHaveBeenCalledTimes(1)
  })
})

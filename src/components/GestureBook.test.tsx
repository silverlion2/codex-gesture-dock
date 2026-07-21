// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { GestureViewState } from '../hooks/useGestureControl'
import { GESTURE_BINDINGS } from '../lib/gestures'
import { GestureBook } from './GestureBook'

const activeGesture: GestureViewState = {
  awaitingNeutral: false,
  binding: GESTURE_BINDINGS.Thumb_Up,
  confidence: 0.97,
  error: '',
  gesture: 'Thumb_Up',
  modelPhase: 'ready',
  progress: 1,
}

afterEach(cleanup)

describe('GestureBook', () => {
  it('keeps every gesture visible and marks the live gesture', () => {
    render(<GestureBook enabled gesture={activeGesture} />)

    const articles = screen.getAllByRole('article')
    expect(articles).toHaveLength(6)
    expect(
      articles.find((article) => article.textContent?.includes('竖起拇指'))
        ?.className,
    ).toContain('is-active')
    expect(screen.getByText('保持')).toBeTruthy()
  })

  it('shows when the pointing gesture has activated the Codex microphone', () => {
    render(<GestureBook enabled gesture={activeGesture} microphoneActive />)

    expect(screen.getByText('Codex 话筒已激活')).toBeTruthy()
  })

  it('shows all Windows mappings in Windows mode', () => {
    render(<GestureBook enabled gesture={activeGesture} mode="windows" />)

    expect(screen.getByText('Windows 全手势手册')).toBeTruthy()
    expect(screen.getByText('显示桌面')).toBeTruthy()
    expect(screen.getByText('打开文件资源管理器')).toBeTruthy()
    expect(screen.getAllByRole('article')).toHaveLength(6)
  })
})

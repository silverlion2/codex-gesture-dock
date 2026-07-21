// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
})

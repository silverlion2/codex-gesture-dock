import { describe, expect, it } from 'vitest'
import { formatTaskTime, moveSelection } from './codexTasks'

describe('Codex task picker helpers', () => {
  it('wraps gesture selection in both directions', () => {
    expect(moveSelection(0, -1, 5)).toBe(4)
    expect(moveSelection(4, 1, 5)).toBe(0)
  })

  it('handles an empty task list', () => {
    expect(moveSelection(3, 1, 0)).toBe(0)
  })

  it('formats recent task time in Chinese', () => {
    const now = new Date('2026-07-20T12:00:00Z').getTime()
    expect(formatTaskTime(now / 1_000 - 120, now)).toBe('2 分钟前')
  })
})

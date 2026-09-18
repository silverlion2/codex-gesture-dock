// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FloatingButton } from './FloatingButton'

describe('FloatingButton', () => {
  it('restores the compact dock while preserving live posture feedback', () => {
    const onExpand = vi.fn()
    render(
      <FloatingButton
        hidden={false}
        gestureActive
        phase="monitoring"
        score={91}
        status="good"
        onExpand={onExpand}
      />,
    )

    const restore = screen.getByRole('button', {
      name: '当前坐姿评分 91，恢复迷你摄像头 Dock',
    })
    expect(restore.textContent).toContain('91')
    fireEvent.click(restore)
    expect(onExpand).toHaveBeenCalledOnce()
  })

  it('exposes a clear restore action before monitoring starts', () => {
    render(
      <FloatingButton
        hidden={false}
        gestureActive={false}
        phase="idle"
        score={null}
        status="away"
        onExpand={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('button', { name: '恢复迷你摄像头 Dock' }),
    ).toBeTruthy()
  })

  it('announces the latest desktop action result in minimal mode', () => {
    render(
      <FloatingButton
        actionFeedback={{ message: '已切换到下一个窗口', ok: true }}
        hidden={false}
        gestureActive
        phase="monitoring"
        score={null}
        status="good"
        onExpand={vi.fn()}
      />,
    )

    expect(screen.getByRole('status').textContent).toBe('已切换到下一个窗口')
    expect(
      screen.getByRole('button', { name: /已切换到下一个窗口/ }),
    ).toBeTruthy()
  })
})

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

    expect(screen.getByText('六个手势，控制当前窗口')).toBeTruthy()
    expect(screen.queryByText('Codex 全手势手册')).toBeNull()
    expect(screen.getAllByText('显示桌面').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('切换到下一个窗口').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('最小化当前窗口')).toBeTruthy()
    expect(screen.getByText('最大化 / 还原当前窗口')).toBeTruthy()
    expect(screen.getAllByRole('article')).toHaveLength(6)
  })

  it('shows exact Windows poses and action effects without claiming a candidate fired', () => {
    const candidateGesture = {
      ...activeGesture,
      binding: GESTURE_BINDINGS.Victory,
      gesture: null,
      progress: 0.4,
    }
    render(<GestureBook enabled gesture={candidateGesture} mode="windows" />)

    expect(screen.getByText('正在识别：胜利手势')).toBeTruthy()
    expect(screen.queryByText('已执行：切换到下一个窗口')).toBeNull()
    expect(screen.getByText('食指和中指张开，其余手指收拢')).toBeTruthy()
    expect(screen.getAllByText('切换到下一个窗口', { exact: false }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('拇指、食指、小指伸开，中指和无名指收拢')).toBeTruthy()
    expect(screen.getByText('再次触发可还原窗口', { exact: false })).toBeTruthy()
    expect(screen.getByText('不是紧急停止', { exact: false })).toBeTruthy()
  })

  it.each([
    ['camera off', { cameraActive: false }, '摄像头未开启'],
    ['model idle', { cameraActive: true }, '等待识别模型'],
    ['loading', { cameraActive: true }, '正在加载识别模型'],
    ['error', { cameraActive: true }, '识别模型异常'],
    ['paused', { cameraActive: true, controlPaused: true }, '控制已暂停'],
  ])('distinguishes Windows %s status', (_label, props, expected) => {
    const modelPhase = _label === 'loading' ? 'loading' : _label === 'error' ? 'error' : _label === 'model idle' ? 'idle' : 'ready'
    render(
      <GestureBook
        enabled
        gesture={{ ...activeGesture, modelPhase }}
        mode="windows"
        {...props}
      />,
    )

    expect(screen.getByText(expected)).toBeTruthy()
  })

  it('shows the three continuous controls in air-pointer mode', () => {
    render(
      <GestureBook
        enabled
        gesture={{ ...activeGesture, pointerActivity: 'clicking' }}
        mode="pointer"
      />,
    )

    expect(screen.getByText('免触控屏幕控制')).toBeTruthy()
    expect(screen.getByText('移动系统指针')).toBeTruthy()
    expect(screen.getByText('单击左键')).toBeTruthy()
    expect(screen.getByText('滚动页面')).toBeTruthy()
    expect(screen.getByText('已执行单击')).toBeTruthy()
    expect(screen.getAllByRole('article')).toHaveLength(3)
  })
})

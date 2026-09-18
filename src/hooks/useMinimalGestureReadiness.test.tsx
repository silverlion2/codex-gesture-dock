// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMinimalGestureReadiness } from './useMinimalGestureReadiness'

function options() {
  return {
    pending: true, enabled: true, cameraPhase: 'monitoring' as const,
    cameraError: '', modelPhase: 'loading' as 'loading' | 'ready' | 'error', modelError: '',
    onSettled: vi.fn(), onReady: vi.fn(), onError: vi.fn(),
  }
}
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('minimal Windows gesture startup readiness', () => {
  it('waits for model readiness, then completes exactly once when pending is cleared', () => {
    const props = options()
    const { rerender } = renderHook(useMinimalGestureReadiness, { initialProps: props })
    expect(props.onReady).not.toHaveBeenCalled()
    rerender({ ...props, modelPhase: 'ready' })
    expect(props.onReady).toHaveBeenCalledTimes(1)
    expect(props.onSettled).toHaveBeenCalledTimes(1)
    rerender({ ...props, pending: false, modelPhase: 'ready' })
    expect(props.onReady).toHaveBeenCalledTimes(1)
  })
  it('handles an already-ready model when startup becomes pending', () => {
    const props = { ...options(), pending: false, modelPhase: 'ready' as const }
    const { rerender } = renderHook(useMinimalGestureReadiness, { initialProps: props })
    expect(props.onReady).not.toHaveBeenCalled()
    rerender({ ...props, pending: true })
    expect(props.onReady).toHaveBeenCalledTimes(1)
  })
  it('reports model failure without collapsing the panel', () => {
    const props = { ...options(), modelPhase: 'error' as const, modelError: 'model unavailable' }
    renderHook(() => useMinimalGestureReadiness(props))
    expect(props.onSettled).toHaveBeenCalledOnce()
    expect(props.onError).toHaveBeenCalledWith(expect.stringContaining('model unavailable'))
    expect(props.onReady).not.toHaveBeenCalled()
  })
  it('cancels pending startup when mode or settings disable gestures', () => {
    const props = { ...options(), enabled: false, modelPhase: 'ready' as const }
    renderHook(() => useMinimalGestureReadiness(props))
    expect(props.onSettled).toHaveBeenCalledOnce()
    expect(props.onReady).not.toHaveBeenCalled()
  })
  it('requires a live camera even when the model is cached and ready', () => {
    const props = { ...options(), cameraPhase: 'ended' as const, modelPhase: 'ready' as const }
    renderHook(() => useMinimalGestureReadiness(props))
    expect(props.onSettled).toHaveBeenCalledOnce()
    expect(props.onReady).not.toHaveBeenCalled()
  })
  it('bounds a stuck startup and clears its timer on cancellation', () => {
    vi.useFakeTimers()
    const props = options()
    const { rerender } = renderHook(useMinimalGestureReadiness, { initialProps: props })
    act(() => vi.advanceTimersByTime(45_000))
    expect(props.onError).toHaveBeenCalledWith(expect.stringContaining('超时'))
    expect(props.onReady).not.toHaveBeenCalled()
    rerender({ ...props, pending: false })
    expect(vi.getTimerCount()).toBe(0)
  })
})

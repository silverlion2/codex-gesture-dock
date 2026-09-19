// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CompactCamera } from './CompactCamera'

vi.mock('../hooks/useFaceMask', () => ({ useFaceMask: () => ({ phase: 'idle', error: '', expression: {} }) }))
afterEach(cleanup)

const props = {
  videoRef: { current: null }, canvasRef: { current: null }, phase: 'monitoring' as const,
  status: 'away' as const, error: '', calibrationProgress: 0,
  gesture: { awaitingNeutral: false, binding: null, confidence: 0, error: '', gesture: null, modelPhase: 'ready' as const, progress: 0 },
  gestureEnabled: true, mode: 'monitor' as const, mirrored: true,
  framing: 'cover' as const, scanPhase: 'idle' as const, faceMaskStyle: 'fox' as const,
  visible: true, onMirrorToggle: vi.fn(), onRecalibrate: vi.fn(),
}

describe('CompactCamera hand-only preview', () => {
  it('does not offer posture recalibration or away status for hands only', () => {
    const { container } = render(<CompactCamera {...props} postureActive={false} postureRequested={false} />)
    expect(screen.queryByRole('button', { name: '重新校准' })).toBeNull()
    expect(container.querySelector('.camera-status')).toBeNull()
    expect(screen.getByText('等待手势')).toBeTruthy()
  })
  it('keeps recalibration available for an explicitly active posture session', () => {
    render(<CompactCamera {...props} postureActive />)
    expect(screen.getByRole('button', { name: '重新校准' })).toBeTruthy()
  })
  it('does not ask users to sit straight before a hand-only camera session', () => {
    render(<CompactCamera {...props} phase="idle" desktopGestureMode postureRequested={false} postureActive={false} />)
    expect(screen.getByText('点击“启动手势”，只需一只手入镜，无需坐姿校准')).toBeTruthy()
    expect(screen.queryByText('坐直后点击下方开始监测')).toBeNull()
  })
})

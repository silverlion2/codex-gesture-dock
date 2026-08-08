// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import axe, { type AxeResults } from 'axe-core'
import { cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodexApprovalPanel } from './components/CodexApprovalPanel'
import { CodexIntegrationPanel } from './components/CodexIntegrationPanel'
import { GestureBook } from './components/GestureBook'
import { TaskPicker } from './components/TaskPicker'
import { WidgetSettings } from './components/WidgetSettings'
import type { GestureViewState } from './hooks/useGestureControl'

const idleGesture: GestureViewState = {
  awaitingNeutral: false,
  binding: null,
  confidence: 0,
  error: '',
  gesture: null,
  modelPhase: 'ready',
  progress: 0,
}

async function accessibilityResults(container: HTMLElement): Promise<AxeResults> {
  return axe.run(container, {
    rules: {
      // jsdom has no layout engine, so color contrast is verified separately
      // against the packaged UI rather than reported as an incomplete result.
      'color-contrast': { enabled: false },
    },
  })
}

afterEach(cleanup)

describe('accessibility', () => {
  it('has no detectable semantic violations in the primary controls', async () => {
    const { container } = render(
      <main>
        <WidgetSettings
          settings={{
            postureEnabled: true,
            sensitivity: 'medium',
            breakEnabled: true,
            breakMinutes: 45,
            gestureEnabled: true,
          }}
          gestureMode="codex"
          onChange={vi.fn()}
          onGestureModeChange={vi.fn()}
        />
        <GestureBook enabled gesture={idleGesture} />
        <CodexIntegrationPanel
          status={null}
          onWindowsControlToggle={vi.fn()}
          onUpdateAction={vi.fn()}
          updateStatus={{
            supported: true,
            phase: 'idle',
            currentVersion: '0.5.0',
            availableVersion: '',
            progress: 0,
            message: '',
          }}
        />
      </main>,
    )

    const results = await accessibilityResults(container)
    expect(results.violations).toEqual([])
  })

  it('keeps the security approval dialog accessible', async () => {
    const { container } = render(
      <main>
        <CodexApprovalPanel
          busy={false}
          onDecision={vi.fn()}
          request={{
            context: 'D:\\workspace\\codex-laptop-camera',
            detail: 'npm test',
            id: 'approval-1',
            kind: 'command',
            reason: 'Run the verified test suite',
            threadId: 'thread-1',
            title: '允许 Codex 执行命令？',
            turnId: 'turn-1',
          }}
        />
      </main>,
    )

    const results = await accessibilityResults(container)
    expect(results.violations).toEqual([])
  })

  it('keeps the separate file and task picker accessible', async () => {
    delete window.widgetControls
    const onClose = vi.fn()
    const { container } = render(
      <main>
        <TaskPicker open onClose={onClose} onMessage={vi.fn()} />
      </main>,
    )

    await screen.findByRole('button', { name: '刷新' })
    const results = await accessibilityResults(container)
    expect(results.violations).toEqual([])

    fireEvent.keyDown(screen.getByLabelText('Codex 任务选择器'), {
      key: 'Escape',
    })
    expect(onClose).toHaveBeenCalledOnce()
  })
})

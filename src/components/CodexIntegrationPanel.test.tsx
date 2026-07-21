// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CodexIntegrationStatus } from '../lib/codexIntegration'
import { CodexIntegrationPanel } from './CodexIntegrationPanel'

describe('CodexIntegrationPanel', () => {
  it('shows both control channels and the bound task', () => {
    const status = {
      ok: true,
      connected: true,
      controlMode: 'app-server+windows-allowlist',
      boundTask: { title: 'Camera control task' },
      taskCount: 12,
      runtime: { connected: true },
      desktop: { connected: true },
      control: {
        enabled: true,
        actionPolicy: 'allowlist',
        auditEnabled: true,
        monitor: {
          running: true,
          connected: true,
          processId: 42,
          processName: 'ChatGPT',
          identityVerified: true,
          identityType: 'msix',
          packageName: 'OpenAI.Codex',
          lastEvent: 'attached',
          lastEventAt: 1,
          lastError: '',
        },
      },
      uiAutomation: {
        ok: true,
        mode: 'read-only',
        elementCount: 8,
        truncated: false,
        message: '',
      },
      layers: {
        windows: { id: 'windows-control-core', connected: true, status: 'operational' },
        program: { id: 'codex', connected: true, status: 'operational' },
      },
      capabilities: {
        appServer: ['tasks'],
        desktopActions: ['dictation'],
        uiAutomation: 'read-only',
        windowEvents: 'live',
        audit: 'metadata-only',
        emergencyStop: true,
        arbitraryInput: false,
      },
      lastEvent: null,
      message: '',
    } as CodexIntegrationStatus

    render(<CodexIntegrationPanel status={status} />)

    expect(screen.getByText('Codex Adapter 已连接')).toBeTruthy()
    expect(screen.getByText('Windows Core 已就绪')).toBeTruthy()
    expect(screen.getByText('UIA 只读 已检查')).toBeTruthy()
    expect(screen.getByText('Window Events 实时')).toBeTruthy()
    expect(screen.getByText('Camera control task')).toBeTruthy()
  })

  it('offers a restart only after an update is downloaded', () => {
    const onUpdateAction = vi.fn()
    render(
      <CodexIntegrationPanel
        status={null}
        updateStatus={{
          supported: true,
          phase: 'downloaded',
          currentVersion: '0.4.0',
          availableVersion: '0.5.0',
          progress: 100,
          message: 'ready',
        }}
        onUpdateAction={onUpdateAction}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '重启安装 0.5.0' }))
    expect(onUpdateAction).toHaveBeenCalledOnce()
  })
})

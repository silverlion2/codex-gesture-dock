// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
      lastEvent: null,
      message: '',
    } as CodexIntegrationStatus

    render(<CodexIntegrationPanel status={status} />)

    expect(screen.getByText('API 已连接')).toBeTruthy()
    expect(screen.getByText('Windows 已连接')).toBeTruthy()
    expect(screen.getByText('Camera control task')).toBeTruthy()
  })
})

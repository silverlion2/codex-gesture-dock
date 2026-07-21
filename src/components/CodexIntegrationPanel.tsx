import type { CodexIntegrationStatus } from '../lib/codexIntegration'

interface CodexIntegrationPanelProps {
  status: CodexIntegrationStatus | null
}

function connectionLabel(connected: boolean) {
  return connected ? '已连接' : '未连接'
}

export function CodexIntegrationPanel({ status }: CodexIntegrationPanelProps) {
  const runtimeConnected = status?.runtime.connected ?? false
  const desktopConnected = status?.desktop.connected ?? false
  const boundTitle = status?.boundTask?.title || '正在识别当前任务'

  return (
    <section className="codex-integration" aria-label="Codex 完整对接状态">
      <header>
        <span>CODEX LINK</span>
        <strong className={runtimeConnected ? 'is-connected' : ''}>
          {runtimeConnected ? 'APP SERVER ONLINE' : 'CONNECTING'}
        </strong>
      </header>
      <div className="codex-link-channels">
        <span className={runtimeConnected ? 'is-connected' : ''}>
          <i aria-hidden="true" /> API {connectionLabel(runtimeConnected)}
        </span>
        <span className={desktopConnected ? 'is-connected' : ''}>
          <i aria-hidden="true" /> Windows {connectionLabel(desktopConnected)}
        </span>
      </div>
      <small title={boundTitle}>{boundTitle}</small>
    </section>
  )
}

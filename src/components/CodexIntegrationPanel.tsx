import type { CodexIntegrationStatus } from '../lib/codexIntegration'
import type { AppUpdateStatus } from '../lib/appUpdate'

interface CodexIntegrationPanelProps {
  status: CodexIntegrationStatus | null
  controlBusy?: boolean
  onWindowsControlToggle?: (enabled: boolean) => void
  updateStatus?: AppUpdateStatus | null
  onUpdateAction?: () => void
}

function connectionLabel(connected: boolean) {
  return connected ? '已连接' : '未连接'
}

export function CodexIntegrationPanel({
  status,
  controlBusy = false,
  onWindowsControlToggle,
  updateStatus,
  onUpdateAction,
}: CodexIntegrationPanelProps) {
  const programConnected = status?.layers?.program.connected ?? false
  const windowsConnected = status?.layers?.windows.connected ?? false
  const uiAutomationReady = status?.uiAutomation?.ok ?? false
  const controlEnabled = status?.control?.enabled ?? true
  const monitorRunning = status?.control?.monitor.running ?? false
  const boundTitle = status?.boundTask?.title || '正在识别当前任务'

  return (
    <section className="codex-integration" aria-label="Codex 完整对接状态">
      <header>
        <span>CODEX LINK</span>
        <strong className={programConnected ? 'is-connected' : ''}>
          {programConnected ? 'TWO-LAYER ONLINE' : 'CONNECTING'}
        </strong>
      </header>
      <div className="codex-link-channels">
        <span className={programConnected ? 'is-connected' : ''}>
          <i aria-hidden="true" /> Codex Adapter {connectionLabel(programConnected)}
        </span>
        <span className={windowsConnected && controlEnabled ? 'is-connected' : ''}>
          <i aria-hidden="true" /> Windows Core{' '}
          {controlEnabled ? (windowsConnected ? '已就绪' : '未就绪') : '已暂停'}
        </span>
        <span className={uiAutomationReady ? 'is-connected' : ''}>
          <i aria-hidden="true" /> UIA 只读 {uiAutomationReady ? '已检查' : '待检查'}
        </span>
        <span className={monitorRunning ? 'is-connected' : ''}>
          <i aria-hidden="true" /> Window Events {monitorRunning ? '实时' : '离线'}
        </span>
      </div>
      {onWindowsControlToggle ? (
        <button
          className={`windows-control-toggle ${controlEnabled ? '' : 'is-paused'}`}
          type="button"
          disabled={controlBusy}
          aria-pressed={controlEnabled}
          onClick={() => onWindowsControlToggle(!controlEnabled)}
        >
          {controlBusy
            ? '正在切换…'
            : controlEnabled
              ? '暂停 Windows 控制'
              : '恢复 Windows 控制'}
        </button>
      ) : null}
      {updateStatus?.supported && onUpdateAction ? (
        <button
          className={`app-update-action is-${updateStatus.phase}`}
          type="button"
          disabled={['checking', 'available', 'downloading'].includes(updateStatus.phase)}
          onClick={onUpdateAction}
        >
          {updateStatus.phase === 'downloaded'
            ? `重启安装 ${updateStatus.availableVersion}`
            : updateStatus.phase === 'downloading'
              ? `正在下载 ${Math.round(updateStatus.progress)}%`
              : updateStatus.phase === 'checking'
                ? '正在检查更新…'
                : `检查更新 · v${updateStatus.currentVersion}`}
        </button>
      ) : null}
      <small title={boundTitle}>{boundTitle}</small>
    </section>
  )
}

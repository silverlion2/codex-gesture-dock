import { Component, type ReactNode } from 'react'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  failed: boolean
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch() {
    // React reports the local exception to the developer console. Do not add
    // telemetry here: task content and local paths must stay on this device.
  }

  private reload = () => {
    window.location.reload()
  }

  private close = () => {
    void window.widgetControls?.close()
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="app-error-boundary" role="alert">
        <strong>Codex Gesture Dock 需要重新加载</strong>
        <p>界面遇到本机错误。摄像头画面和任务内容没有上传。</p>
        <div>
          <button type="button" onClick={this.reload}>
            重新加载
          </button>
          {window.widgetControls?.isElectron && (
            <button type="button" onClick={this.close}>
              退出应用
            </button>
          )}
        </div>
      </main>
    )
  }
}

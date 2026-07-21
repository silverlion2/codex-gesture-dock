import {
  Ban,
  Check,
  FilePenLine,
  LoaderCircle,
  ShieldAlert,
  SquareTerminal,
} from 'lucide-react'
import type {
  CodexApprovalDecision,
  CodexApprovalRequest,
} from '../lib/codexApprovals'

interface CodexApprovalPanelProps {
  busy: boolean
  onDecision: (decision: CodexApprovalDecision) => void
  request: CodexApprovalRequest
}

export function CodexApprovalPanel({
  busy,
  onDecision,
  request,
}: CodexApprovalPanelProps) {
  const RequestIcon = request.kind === 'command' ? SquareTerminal : FilePenLine

  return (
    <section
      className="codex-approval-panel"
      aria-label="Codex 操作审批"
      aria-live="assertive"
    >
      <header className="task-picker-header">
        <div>
          <ShieldAlert size={18} aria-hidden="true" />
          <strong>Codex 请求确认</strong>
        </div>
      </header>

      <div className="codex-approval-content">
        <div className="approval-summary">
          <span className="task-confirm-icon" aria-hidden="true">
            <RequestIcon size={21} />
          </span>
          <div>
            <strong>{request.title}</strong>
            <p>检查具体操作后，仅决定本次权限。</p>
          </div>
        </div>
        <code>{request.detail}</code>
        {request.context && <small>{request.context}</small>}

        <div className="codex-approval-actions">
          <button
            className="approval-deny-button"
            type="button"
            disabled={busy}
            onClick={() => onDecision('decline')}
          >
            <Ban size={16} aria-hidden="true" />
            拒绝
          </button>
          <button
            className="task-confirm-button"
            type="button"
            disabled={busy}
            onClick={() => onDecision('accept')}
          >
            {busy ? (
              <LoaderCircle className="spin-icon" size={16} aria-hidden="true" />
            ) : (
              <Check size={16} aria-hidden="true" />
            )}
            {busy ? '正在响应' : '仅允许本次'}
          </button>
        </div>
        <p className="task-gesture-help">👍 仅允许本次 · ✌ 拒绝</p>
      </div>
    </section>
  )
}

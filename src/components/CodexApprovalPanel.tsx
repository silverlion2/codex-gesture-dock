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
      className="task-picker codex-approval-panel"
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
        <span className="task-confirm-icon" aria-hidden="true">
          <RequestIcon size={27} />
        </span>
        <strong>{request.title}</strong>
        <p>请检查本次具体操作，再决定是否只允许这一次。</p>
        <code>{request.detail}</code>
        {request.context && <small>{request.context}</small>}
        {request.reason && request.reason !== request.detail && (
          <small>{request.reason}</small>
        )}

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

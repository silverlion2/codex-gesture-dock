export type CodexApprovalKind = 'command' | 'file'
export type CodexApprovalDecision = 'accept' | 'decline'

export interface CodexApprovalRequest {
  context: string
  detail: string
  id: string
  kind: CodexApprovalKind
  reason: string
  threadId: string
  title: string
  turnId: string
}

export interface CodexApprovalResult {
  message: string
  ok: boolean
  requestId: string
}

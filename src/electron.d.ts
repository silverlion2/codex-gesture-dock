import type { CodexAction, CodexActionResult } from './lib/gestures'
import type {
  CodexTaskAction,
  CodexTaskActionResult,
  CodexTaskFilter,
  CodexTaskListResult,
} from './lib/codexTasks'
import type {
  CodexApprovalDecision,
  CodexApprovalRequest,
  CodexApprovalResult,
} from './lib/codexApprovals'

export interface WidgetControls {
  isElectron: true
  getState: () => Promise<boolean>
  setExpanded: (expanded: boolean) => Promise<boolean>
  close: () => Promise<boolean>
  runCodexAction: (action: CodexAction) => Promise<CodexActionResult>
  listCodexTasks: (filter: CodexTaskFilter) => Promise<CodexTaskListResult>
  runCodexTaskAction: (
    threadId: string,
    action: CodexTaskAction,
  ) => Promise<CodexTaskActionResult>
  getPendingCodexApprovals: () => Promise<CodexApprovalRequest[]>
  respondCodexApproval: (
    requestId: string,
    decision: CodexApprovalDecision,
  ) => Promise<CodexApprovalResult>
  onCodexApprovalRequest: (
    callback: (request: CodexApprovalRequest) => void,
  ) => () => void
  onCodexApprovalsCleared: (callback: () => void) => () => void
  onStateChange: (callback: (expanded: boolean) => void) => () => void
}

declare global {
  interface Window {
    widgetControls?: WidgetControls
  }
}

export {}

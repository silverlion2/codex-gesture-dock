import type {
  CodexAction,
  CodexActionResult,
  GestureName,
} from './lib/gestures'
import type {
  CodexTaskAction,
  CodexTaskActionResult,
  CodexTaskFilter,
  CodexTaskListResult,
  CodexRecentFileAction,
  CodexRecentFileActionResult,
  CodexRecentFilesResult,
} from './lib/codexTasks'
import type {
  CodexApprovalDecision,
  CodexApprovalRequest,
  CodexApprovalResult,
} from './lib/codexApprovals'
import type {
  CodexIntegrationStatus,
  CodexRuntimeEvent,
  CodexTaskBindingResult,
} from './lib/codexIntegration'

export interface WidgetControls {
  isElectron: true
  getState: () => Promise<boolean>
  setExpanded: (expanded: boolean) => Promise<boolean>
  close: () => Promise<boolean>
  openTaskPicker: () => Promise<boolean>
  closeTaskPicker: () => Promise<boolean>
  sendTaskPickerGesture: (gesture: GestureName) => Promise<boolean>
  showMessage: (message: string) => Promise<boolean>
  runCodexAction: (action: CodexAction) => Promise<CodexActionResult>
  getCodexIntegrationStatus: () => Promise<CodexIntegrationStatus>
  bindCodexTask: (threadId: string) => Promise<CodexTaskBindingResult>
  listCodexTasks: (filter: CodexTaskFilter) => Promise<CodexTaskListResult>
  listRecentCodexFiles: () => Promise<CodexRecentFilesResult>
  openRecentCodexFile: (
    fileId: string,
    mode: CodexRecentFileAction,
  ) => Promise<CodexRecentFileActionResult>
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
  onCodexRuntimeEvent: (
    callback: (runtimeEvent: CodexRuntimeEvent) => void,
  ) => () => void
  onCodexIntegrationChanged: (callback: () => void) => () => void
  onStateChange: (callback: (expanded: boolean) => void) => () => void
  onTaskPickerStateChange: (callback: (open: boolean) => void) => () => void
  onTaskPickerGesture: (callback: (gesture: GestureName) => void) => () => void
  onMessage: (callback: (message: string) => void) => () => void
}

declare global {
  interface Window {
    widgetControls?: WidgetControls
  }
}

export {}

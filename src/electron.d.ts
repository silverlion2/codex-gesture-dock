import type {
  CodexAction,
  CodexActionResult,
  GestureName,
  WindowsAction,
  WindowsActionResult,
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
  CodexUiAutomationStatus,
  WindowsControlEvent,
  WindowsControlStatus,
} from './lib/codexIntegration'
import type { AppUpdateStatus } from './lib/appUpdate'
import type {
  PointerCommand,
  PointerControlStatus,
} from './lib/pointerGestures'
import type {
  VoiceCommandEvent,
  VoiceControlStatus,
} from './lib/voiceControl'

export type WidgetViewMode = 'minimal' | 'collapsed' | 'expanded'

export interface WidgetControls {
  isElectron: true
  getState: () => Promise<boolean>
  setExpanded: (expanded: boolean) => Promise<boolean>
  getViewMode: () => Promise<WidgetViewMode>
  setViewMode: (mode: WidgetViewMode) => Promise<WidgetViewMode>
  close: () => Promise<boolean>
  openTaskPicker: () => Promise<boolean>
  closeTaskPicker: () => Promise<boolean>
  sendTaskPickerGesture: (gesture: GestureName) => Promise<boolean>
  showMessage: (message: string) => Promise<boolean>
  runCodexAction: (action: CodexAction) => Promise<CodexActionResult>
  runWindowsAction: (action: WindowsAction) => Promise<WindowsActionResult>
  setPointerControlEnabled: (enabled: boolean) => Promise<PointerControlStatus>
  sendPointerCommand: (command: PointerCommand) => void
  getVoiceControlStatus: () => Promise<VoiceControlStatus>
  setVoiceControlEnabled: (enabled: boolean) => Promise<VoiceControlStatus>
  getUpdateStatus: () => Promise<AppUpdateStatus>
  checkForUpdates: () => Promise<AppUpdateStatus>
  installUpdate: () => Promise<boolean>
  getCodexIntegrationStatus: () => Promise<CodexIntegrationStatus>
  inspectCodexUi: () => Promise<CodexUiAutomationStatus>
  setWindowsControlEnabled: (enabled: boolean) => Promise<WindowsControlStatus>
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
  onWindowsControlEvent: (
    callback: (event: WindowsControlEvent) => void,
  ) => () => void
  onVoiceCommand: (callback: (event: VoiceCommandEvent) => void) => () => void
  onVoiceControlStatus: (
    callback: (status: VoiceControlStatus) => void,
  ) => () => void
  onUpdateStatus: (callback: (status: AppUpdateStatus) => void) => () => void
  onStateChange: (callback: (expanded: boolean) => void) => () => void
  onViewModeChange: (callback: (mode: WidgetViewMode) => void) => () => void
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

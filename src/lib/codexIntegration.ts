import type { CodexTask } from './codexTasks'

export interface CodexRuntimeInfo {
  connected: boolean
  command: string
  userAgent: string
  codexHome: string
  platformFamily: string
  platformOs: string
  lastError: string
}

export interface CodexDesktopStatus {
  connected: boolean
  processId: number | null
  processName: string
  windowTitle: string
  message: string
}

export interface CodexUiElement {
  controlType: string
  automationId: string
  name: string
  nameRedacted: boolean
  isEnabled: boolean
  isOffscreen: boolean
  isKeyboardFocusable: boolean
  supportsInvoke: boolean
  supportsToggle: boolean
  supportsSelectionItem: boolean
}

export interface CodexUiAutomationStatus {
  ok: boolean
  programId?: 'codex'
  mode: 'read-only'
  processId?: number | null
  processName?: string
  windowTitle?: string
  elementCount: number
  observedCount?: number
  truncated: boolean
  elements?: CodexUiElement[]
  message: string
}

export interface ControlLayerStatus {
  id: string
  connected: boolean
  status: 'operational' | 'unavailable'
  enabled?: boolean
  monitoring?: boolean
  identityVerified?: boolean
  capabilityCount?: number
  actionPolicy?: 'allowlist'
  uiAutomation?: 'read-only'
  transport?: 'app-server'
}

export interface WindowsMonitorStatus {
  running: boolean
  connected: boolean
  processId: number | null
  processName: string
  identityVerified: boolean
  identityType: string
  packageName: string
  lastEvent: string
  lastEventAt: number
  lastError: string
}

export interface WindowsControlStatus {
  enabled: boolean
  actionPolicy: 'allowlist'
  auditEnabled: boolean
  monitor: WindowsMonitorStatus
}

export interface WindowsControlEvent {
  type: string
  processId: number | null
  connected: boolean
  identityVerified: boolean
  timestamp: number
}

export interface CodexRuntimeEvent {
  method: string
  threadId: string
  turnId: string
  status: string
  itemType: string
  timestamp: number
}

export interface CodexIntegrationStatus {
  ok: boolean
  connected: boolean
  controlMode: string
  boundTask: CodexTask | null
  taskCount: number
  runtime: CodexRuntimeInfo
  desktop: CodexDesktopStatus
  control: WindowsControlStatus
  uiAutomation: CodexUiAutomationStatus
  layers: {
    windows: ControlLayerStatus
    program: ControlLayerStatus
  }
  capabilities: {
    appServer: string[]
    desktopActions: string[]
    uiAutomation: 'read-only'
    windowEvents: 'live'
    audit: 'metadata-only'
    emergencyStop: boolean
    arbitraryInput: false
  }
  lastEvent: CodexRuntimeEvent | null
  message: string
}

export interface CodexTaskBindingResult {
  ok: boolean
  taskId: string
  message: string
}

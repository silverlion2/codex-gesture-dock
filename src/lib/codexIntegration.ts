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
  lastEvent: CodexRuntimeEvent | null
  message: string
}

export interface CodexTaskBindingResult {
  ok: boolean
  taskId: string
  message: string
}

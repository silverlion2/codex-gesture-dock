export type AppUpdatePhase =
  | 'unsupported'
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'error'

export interface AppUpdateStatus {
  supported: boolean
  phase: AppUpdatePhase
  currentVersion: string
  availableVersion: string
  progress: number
  message: string
}

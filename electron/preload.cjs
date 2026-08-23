const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('widgetControls', {
  isElectron: true,
  getState: () => ipcRenderer.invoke('widget:get-state'),
  setExpanded: (expanded) => ipcRenderer.invoke('widget:set-expanded', expanded),
  getViewMode: () => ipcRenderer.invoke('widget:get-view-mode'),
  setViewMode: (mode) => ipcRenderer.invoke('widget:set-view-mode', mode),
  close: () => ipcRenderer.invoke('widget:close'),
  openTaskPicker: () => ipcRenderer.invoke('task-picker:open'),
  closeTaskPicker: () => ipcRenderer.invoke('task-picker:close'),
  sendTaskPickerGesture: (gesture) =>
    ipcRenderer.invoke('task-picker:send-gesture', gesture),
  showMessage: (message) => ipcRenderer.invoke('widget:show-message', message),
  runCodexAction: (action) => ipcRenderer.invoke('codex:run-action', action),
  runWindowsAction: (action) => ipcRenderer.invoke('windows:run-action', action),
  setPointerControlEnabled: (enabled) =>
    ipcRenderer.invoke('windows:set-pointer-enabled', enabled),
  sendPointerCommand: (command) => ipcRenderer.send('windows:pointer-command', command),
  getVoiceControlStatus: () => ipcRenderer.invoke('voice:get-status'),
  setVoiceControlEnabled: (enabled) =>
    ipcRenderer.invoke('voice:set-enabled', enabled),
  getUpdateStatus: () => ipcRenderer.invoke('updates:get-status'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  getCodexIntegrationStatus: () =>
    ipcRenderer.invoke('codex:get-integration-status'),
  inspectCodexUi: () => ipcRenderer.invoke('windows:inspect-codex-ui'),
  setWindowsControlEnabled: (enabled) =>
    ipcRenderer.invoke('windows:set-control-enabled', enabled),
  bindCodexTask: (threadId) => ipcRenderer.invoke('codex:bind-task', threadId),
  listCodexTasks: (filter) => ipcRenderer.invoke('codex:list-tasks', filter),
  listRecentCodexFiles: () => ipcRenderer.invoke('codex:list-recent-files'),
  openRecentCodexFile: (fileId, mode) =>
    ipcRenderer.invoke('codex:open-recent-file', fileId, mode),
  runCodexTaskAction: (threadId, action) =>
    ipcRenderer.invoke('codex:run-task-action', threadId, action),
  getPendingCodexApprovals: () =>
    ipcRenderer.invoke('codex:get-pending-approvals'),
  respondCodexApproval: (requestId, decision) =>
    ipcRenderer.invoke('codex:respond-approval', requestId, decision),
  onCodexApprovalRequest: (callback) => {
    const listener = (_event, request) => callback(request)
    ipcRenderer.on('codex:approval-requested', listener)
    return () => ipcRenderer.removeListener('codex:approval-requested', listener)
  },
  onCodexApprovalsCleared: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('codex:approvals-cleared', listener)
    return () => ipcRenderer.removeListener('codex:approvals-cleared', listener)
  },
  onCodexRuntimeEvent: (callback) => {
    const listener = (_event, runtimeEvent) => callback(runtimeEvent)
    ipcRenderer.on('codex:runtime-event', listener)
    return () => ipcRenderer.removeListener('codex:runtime-event', listener)
  },
  onCodexIntegrationChanged: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('codex:integration-changed', listener)
    return () => ipcRenderer.removeListener('codex:integration-changed', listener)
  },
  onWindowsControlEvent: (callback) => {
    const listener = (_event, windowsEvent) => callback(windowsEvent)
    ipcRenderer.on('windows:control-event', listener)
    return () => ipcRenderer.removeListener('windows:control-event', listener)
  },
  onVoiceCommand: (callback) => {
    const listener = (_event, command) => callback(command)
    ipcRenderer.on('voice:command', listener)
    return () => ipcRenderer.removeListener('voice:command', listener)
  },
  onVoiceControlStatus: (callback) => {
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('voice:status', listener)
    return () => ipcRenderer.removeListener('voice:status', listener)
  },
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('updates:status', listener)
    return () => ipcRenderer.removeListener('updates:status', listener)
  },
  onStateChange: (callback) => {
    const listener = (_event, expanded) => callback(Boolean(expanded))
    ipcRenderer.on('widget:state-changed', listener)
    return () => ipcRenderer.removeListener('widget:state-changed', listener)
  },
  onViewModeChange: (callback) => {
    const listener = (_event, mode) => callback(mode)
    ipcRenderer.on('widget:view-mode-changed', listener)
    return () => ipcRenderer.removeListener('widget:view-mode-changed', listener)
  },
  onTaskPickerStateChange: (callback) => {
    const listener = (_event, open) => callback(Boolean(open))
    ipcRenderer.on('task-picker:state-changed', listener)
    return () => ipcRenderer.removeListener('task-picker:state-changed', listener)
  },
  onTaskPickerGesture: (callback) => {
    const listener = (_event, gesture) => callback(gesture)
    ipcRenderer.on('task-picker:gesture', listener)
    return () => ipcRenderer.removeListener('task-picker:gesture', listener)
  },
  onMessage: (callback) => {
    const listener = (_event, message) => callback(String(message))
    ipcRenderer.on('widget:message', listener)
    return () => ipcRenderer.removeListener('widget:message', listener)
  },
})

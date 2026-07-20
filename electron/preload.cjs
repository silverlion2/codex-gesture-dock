const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('widgetControls', {
  isElectron: true,
  getState: () => ipcRenderer.invoke('widget:get-state'),
  setExpanded: (expanded) => ipcRenderer.invoke('widget:set-expanded', expanded),
  close: () => ipcRenderer.invoke('widget:close'),
  runCodexAction: (action) => ipcRenderer.invoke('codex:run-action', action),
  listCodexTasks: (filter) => ipcRenderer.invoke('codex:list-tasks', filter),
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
  onStateChange: (callback) => {
    const listener = (_event, expanded) => callback(Boolean(expanded))
    ipcRenderer.on('widget:state-changed', listener)
    return () => ipcRenderer.removeListener('widget:state-changed', listener)
  },
})

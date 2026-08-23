const path = require('node:path')

const DEFAULT_SYSTEM_ROOT = 'C:\\Windows'
const POWERSHELL_RELATIVE_PATH = [
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe',
]

function isLocalAbsoluteWindowsPath(value) {
  return (
    typeof value === 'string' &&
    /^[a-z]:[\\/]/i.test(value) &&
    path.win32.isAbsolute(value) &&
    !value.includes('\0')
  )
}

function getWindowsPowerShellPath({
  systemRoot = process.env.SystemRoot || process.env.windir,
} = {}) {
  const requestedRoot = typeof systemRoot === 'string' ? systemRoot.trim() : ''
  const normalizedRoot = path.win32.normalize(requestedRoot || DEFAULT_SYSTEM_ROOT)
  const safeRoot = isLocalAbsoluteWindowsPath(normalizedRoot)
    ? normalizedRoot
    : DEFAULT_SYSTEM_ROOT
  return path.win32.join(safeRoot, ...POWERSHELL_RELATIVE_PATH)
}

function assertWindowsPowerShellPath(value) {
  if (
    !isLocalAbsoluteWindowsPath(value) ||
    path.win32.basename(value).toLowerCase() !== 'powershell.exe'
  ) {
    throw new TypeError('A local absolute Windows PowerShell path is required')
  }
  return path.win32.normalize(value)
}

module.exports = {
  assertWindowsPowerShellPath,
  getWindowsPowerShellPath,
  isLocalAbsoluteWindowsPath,
}

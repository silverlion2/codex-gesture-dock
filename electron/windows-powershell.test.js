import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  assertWindowsPowerShellPath,
  getWindowsPowerShellPath,
} = require('./windows-powershell.cjs')

describe('Windows PowerShell path policy', () => {
  it('pins helpers to the local System32 Windows PowerShell executable', () => {
    expect(getWindowsPowerShellPath({ systemRoot: 'D:\\Windows' })).toBe(
      'D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    )
  })

  it('fails closed to the standard local Windows root for unsafe roots', () => {
    expect(getWindowsPowerShellPath({ systemRoot: '.\\portable' })).toBe(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    )
    expect(getWindowsPowerShellPath({ systemRoot: '\\\\server\\share' })).toBe(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    )
  })

  it('rejects unqualified injected interpreter paths', () => {
    expect(() => assertWindowsPowerShellPath('powershell.exe')).toThrow(
      'local absolute Windows PowerShell path',
    )
  })
})

import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { describe, expect, it } from 'vitest'

const windows = process.platform === 'win32'
const powershell = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'

describe('Windows SendInput native ABI', () => {
  it.skipIf(!windows)('reports the Win32 INPUT union layout without injecting input', () => {
    const output = execFileSync(powershell, [
      '-NoLogo',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      'electron/windows-system-control.ps1',
      '-Action',
      'volume_up',
      '-DryRun',
    // Cold PowerShell/Add-Type compilation on hosted Windows can exceed 5s.
    // Bound the child independently so a hung compiler still fails closed.
    ], { encoding: 'utf8', windowsHide: true, timeout: 25_000 })
    const result = JSON.parse(output.trim())
    const abi = result.abi
    const expectedInputSize = abi.pointerSize === 8 ? 40 : 28
    const expectedUnionSize = abi.pointerSize === 8 ? 32 : 24
    const expectedUnionOffset = abi.pointerSize === 8 ? 8 : 4

    expect(result).toMatchObject({ ok: true, action: 'volume_up', dryRun: true })
    expect(abi).toMatchObject({
      inputSize: expectedInputSize,
      unionSize: expectedUnionSize,
      unionOffset: expectedUnionOffset,
      mouseOffset: 0,
      keyboardOffset: 0,
      hardwareOffset: 0,
    })
  }, 30_000)
})

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, copyFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

test('unsigned preview bundle is allowlisted, hash-verified and refuses overwrite', {
  skip: process.platform !== 'win32',
}, () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gesture-preview-test-'))
  try {
    mkdirSync(path.join(root, 'scripts'))
    mkdirSync(path.join(root, 'artifacts'))
    copyFileSync(new URL('../prepare-preview.ps1', import.meta.url), path.join(root, 'scripts/prepare-preview.ps1'))
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '1.2.3' }))
    const names = ['Codex-Gesture-Dock-1.2.3-setup.exe', 'Codex-Gesture-Dock-1.2.3-portable.exe', 'Codex-Gesture-Dock-1.2.3-setup.exe.blockmap', 'latest.yml', 'sbom.cdx.json']
    const bytes = Buffer.from('test fixture, never executed')
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    for (const name of [...names, 'unrelated.exe']) {
      writeFileSync(path.join(root, 'artifacts', name), bytes)
    }
    const sourceManifest = { version: '1.2.3', assets: names.map((name) => ({ name, sha256, size: bytes.length })) }
    writeFileSync(path.join(root, 'artifacts/release-assets.json'), JSON.stringify(sourceManifest))
    const run = () => execFileSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', [
      '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/prepare-preview.ps1'),
    ], { encoding: 'utf8', windowsHide: true, stdio: 'pipe', env: { ...process.env,
      PSModulePath: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules',
      GITHUB_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '123', GITHUB_REPOSITORY: 'test/repo',
    } })
    writeFileSync(path.join(root, 'artifacts', names[0]), 'tampered')
    assert.throws(run, /does not match verified build/)
    writeFileSync(path.join(root, 'artifacts', names[0]), bytes)
    run()
    const preview = path.join(root, 'artifacts/preview')
    assert.deepEqual(readdirSync(preview).sort(), [...names, 'preview-release.json', 'SHA256SUMS.txt'].sort())
    const manifest = JSON.parse(readFileSync(path.join(preview, 'preview-release.json'), 'utf8').replace(/^\uFEFF/, ''))
    assert.equal(manifest.tag, '1.2.3')
    assert.equal(manifest.commit, 'a'.repeat(40))
    assert.equal(manifest.unsigned, true)
    assert.equal(manifest.manualDownloadOnly, false)
    assert.equal(manifest.updateChannel, 'all-releases')
    assert.equal(manifest.assets.length, 5)
    const lines = readFileSync(path.join(preview, 'SHA256SUMS.txt'), 'ascii').trim().split(/\r?\n/)
    assert.equal(lines.length, 6)
    for (const line of lines) {
      const [hash, name] = line.split('  ')
      assert.equal(hash, createHash('sha256').update(readFileSync(path.join(preview, name))).digest('hex'))
    }
    assert.throws(run, /Refusing to overwrite/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

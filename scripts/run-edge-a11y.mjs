import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const viteCli = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')
const playwrightCli = path.join(
  projectRoot,
  'node_modules',
  '@playwright',
  'test',
  'cli.js',
)
const previewUrl = 'http://127.0.0.1:43997'

function runNode(args) {
  return spawn(process.execPath, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    windowsHide: true,
  })
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve({ code, signal }))
  })
}

async function waitForPreview(preview, timeoutMs = 30_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (preview.exitCode !== null) {
      throw new Error(`Vite preview exited before it was ready (${preview.exitCode}).`)
    }
    try {
      const response = await fetch(previewUrl)
      if (response.ok) return
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`Timed out waiting for ${previewUrl}.`)
}

async function stopPreview(preview) {
  if (preview.exitCode !== null) return
  preview.kill('SIGTERM')
  await Promise.race([
    waitForExit(preview),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ])
  if (preview.exitCode === null) preview.kill('SIGKILL')
}

const preview = runNode([
  viteCli,
  'preview',
  '--host',
  '127.0.0.1',
  '--port',
  '43997',
  '--strictPort',
])

let exitCode = 1
try {
  await waitForPreview(preview)
  const tests = runNode([
    playwrightCli,
    'test',
    'tests/e2e/accessibility.pw.ts',
    '--config',
    'playwright.edge.config.ts',
  ])
  const result = await waitForExit(tests)
  exitCode = result.code ?? 1
} finally {
  await stopPreview(preview)
}

process.exitCode = exitCode

import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  CodexAppServerClient,
  resolveCodexCommand,
} = require('../electron/codex-app-server.cjs')

const client = new CodexAppServerClient()

try {
  await client.ensureStarted()
  const runtime = client.getRuntimeInfo()
  const recentTasks = await client.listTasks('recent')

  if (!runtime.connected) {
    throw new Error('Codex App Server did not report a connected runtime.')
  }

  console.log(
    JSON.stringify(
      {
        passed: true,
        executable: path.basename(resolveCodexCommand()),
        userAgent: runtime.userAgent,
        platformFamily: runtime.platformFamily,
        platformOs: runtime.platformOs,
        recentTaskCount: recentTasks.length,
      },
      null,
      2,
    ),
  )
} finally {
  client.close()
}

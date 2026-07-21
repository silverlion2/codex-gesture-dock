import { createRequire } from 'node:module'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const {
  CodexAppServerClient,
  resolveCodexCommand,
} = require('./codex-app-server.cjs')

function thread(id, updatedAt) {
  return {
    id,
    cwd: `C:\\workspace\\${id}`,
    createdAt: updatedAt - 10,
    updatedAt,
    preview: `Task ${id}`,
    source: 'appServer',
    status: { type: 'notLoaded' },
  }
}

describe('Codex App Server client', () => {
  it('prefers the newest versioned Codex Desktop runtime', () => {
    const localAppData = mkdtempSync(path.join(tmpdir(), 'codex-runtime-'))
    const binRoot = path.join(localAppData, 'OpenAI', 'Codex', 'bin')
    const stable = path.join(binRoot, 'codex.exe')
    const older = path.join(binRoot, 'older', 'codex.exe')
    const newest = path.join(binRoot, 'newest', 'codex.exe')

    try {
      for (const candidate of [stable, older, newest]) {
        mkdirSync(path.dirname(candidate), { recursive: true })
        writeFileSync(candidate, '')
      }
      utimesSync(older, new Date(1000), new Date(1000))
      utimesSync(newest, new Date(2000), new Date(2000))

      expect(resolveCodexCommand({ localAppData })).toBe(newest)
    } finally {
      rmSync(localAppData, { recursive: true, force: true })
    }
  })

  it('scans repaired thread history and paginates completed tasks', async () => {
    const client = new CodexAppServerClient()
    const pages = [
      {
        data: [thread('active-task', 30), thread('idle-task', 20)],
        nextCursor: 'page-2',
      },
      {
        data: [thread('completed-task', 10)],
        nextCursor: null,
      },
    ]
    client.request = vi.fn(async (method, params) => {
      expect(method).toBe('thread/list')
      expect(params).not.toHaveProperty('useStateDbOnly')
      return params.cursor ? pages[1] : pages[0]
    })
    client.latestTurn = vi.fn(async (threadId) => ({
      status: threadId === 'completed-task' ? 'completed' : 'inProgress',
    }))

    const tasks = await client.listTasks('completed')

    expect(tasks.map((task) => task.id)).toEqual(['completed-task'])
    expect(client.request).toHaveBeenCalledTimes(2)
    expect(client.request.mock.calls[1][1].cursor).toBe('page-2')
  })

  it('surfaces server approval requests and sends the chosen response', () => {
    const onServerRequest = vi.fn()
    const client = new CodexAppServerClient({ onServerRequest })
    client.send = vi.fn()

    client.handleLine(
      JSON.stringify({
        id: 41,
        method: 'item/commandExecution/requestApproval',
        params: { command: 'npm test', threadId: 'thread-1', turnId: 'turn-1' },
      }),
    )

    expect(onServerRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '41',
        method: 'item/commandExecution/requestApproval',
      }),
    )

    client.respondToServerRequest('41', { decision: 'accept' })
    expect(client.send).toHaveBeenCalledWith({
      id: 41,
      result: { decision: 'accept' },
    })
  })

  it('delivers App Server notifications without treating them as responses', () => {
    const onNotification = vi.fn()
    const client = new CodexAppServerClient({ onNotification })

    client.handleLine(
      JSON.stringify({
        method: 'turn/completed',
        params: {
          threadId: 'thread-1',
          turn: { id: 'turn-1', status: 'completed' },
        },
      }),
    )

    expect(onNotification).toHaveBeenCalledWith({
      method: 'turn/completed',
      params: {
        threadId: 'thread-1',
        turn: { id: 'turn-1', status: 'completed' },
      },
    })
  })

  it('returns a defensive copy of runtime connection details', () => {
    const client = new CodexAppServerClient()
    client.runtimeInfo = {
      connected: true,
      command: 'codex.exe',
      userAgent: 'codex_cli_rs/0.145.0',
      codexHome: 'C:\\Users\\tester\\.codex',
      platformFamily: 'windows',
      platformOs: 'windows',
      lastError: '',
    }

    const first = client.getRuntimeInfo()
    first.connected = false

    expect(client.getRuntimeInfo()).toMatchObject({
      connected: true,
      userAgent: 'codex_cli_rs/0.145.0',
    })
  })

  it('steers an active turn instead of starting a conflicting turn', async () => {
    const client = new CodexAppServerClient()
    client.request = vi.fn(async (method) => {
      if (method === 'thread/resume') {
        return {
          thread: {
            id: 'active-thread',
            status: { type: 'active', activeFlags: [] },
          },
        }
      }
      return {}
    })
    client.latestTurn = vi.fn(async () => ({
      id: 'active-turn',
      status: 'inProgress',
    }))

    await client.startTaskAction('active-thread', 'summary')

    expect(client.request).toHaveBeenCalledWith(
      'turn/steer',
      expect.objectContaining({
        threadId: 'active-thread',
        expectedTurnId: 'active-turn',
      }),
    )
    expect(client.request).not.toHaveBeenCalledWith(
      'turn/start',
      expect.anything(),
    )
  })

  it('collects the newest changed files from completed turns', async () => {
    const client = new CodexAppServerClient()
    client.listTasks = vi.fn(async () => [
      {
        id: 'recent-thread',
        cwd: 'D:\\workspace\\recent-project',
        project: 'recent-project',
        title: 'Recent task',
        updatedAt: 200,
      },
    ])
    client.request = vi.fn(async () => ({
      data: [
        {
          id: 'new-turn',
          status: 'completed',
          completedAt: 200,
          items: [
            {
              type: 'fileChange',
              status: 'completed',
              changes: [
                {
                  path: 'src\\updated.ts',
                  kind: { type: 'update' },
                  diff: '+new',
                },
              ],
            },
          ],
        },
        {
          id: 'old-turn',
          status: 'completed',
          completedAt: 100,
          items: [
            {
              type: 'fileChange',
              status: 'completed',
              changes: [
                {
                  path: 'src\\updated.ts',
                  kind: { type: 'add' },
                  diff: '+old',
                },
              ],
            },
          ],
        },
      ],
    }))

    const files = await client.listRecentFiles()

    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({
      completedAt: 200,
      kind: 'update',
      name: 'updated.ts',
      project: 'recent-project',
      relativePath: 'src\\updated.ts',
      taskTitle: 'Recent task',
    })
    expect(files[0].id).toMatch(/^[a-f0-9]{32}$/)
  })
})

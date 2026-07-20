import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { CodexAppServerClient } = require('./codex-app-server.cjs')

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
})

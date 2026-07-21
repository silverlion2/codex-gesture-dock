import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  chooseBoundTask,
  normalizeCodexNotification,
} = require('./codex-integration.cjs')

const tasks = [
  { id: 'recent', cwd: 'D:\\workspace\\other', status: 'interrupted' },
  { id: 'workspace', cwd: 'D:\\workspace\\camera', status: 'completed' },
  { id: 'active', cwd: 'D:\\workspace\\active', status: 'active' },
]

describe('Codex integration state', () => {
  it('keeps an explicit task binding before applying automatic selection', () => {
    expect(chooseBoundTask(tasks, 'active', 'D:\\workspace\\camera')?.id).toBe(
      'active',
    )
  })

  it('binds the matching workspace even when its last turn is interrupted', () => {
    expect(chooseBoundTask(tasks, '', 'D:\\workspace\\camera\\')?.id).toBe(
      'workspace',
    )
  })

  it('falls back to an active task and then the newest task', () => {
    expect(chooseBoundTask(tasks, '', 'D:\\missing')?.id).toBe('active')
    expect(chooseBoundTask(tasks.slice(0, 2), '', 'D:\\missing')?.id).toBe(
      'recent',
    )
  })

  it('exposes notification metadata without message or diff content', () => {
    expect(
      normalizeCodexNotification(
        {
          method: 'item/completed',
          params: {
            threadId: 'thread-1',
            turnId: 'turn-1',
            item: {
              id: 'item-1',
              type: 'fileChange',
              status: 'completed',
              changes: [{ path: 'secret.txt', diff: '+secret' }],
            },
          },
        },
        123,
      ),
    ).toEqual({
      method: 'item/completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      itemType: 'fileChange',
      timestamp: 123,
    })
  })
})

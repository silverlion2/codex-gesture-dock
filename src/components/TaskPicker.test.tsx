// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CodexTaskFilter, CodexTaskListResult } from '../lib/codexTasks'
import { TaskPicker } from './TaskPicker'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

function result(filter: CodexTaskFilter, id: string): CodexTaskListResult {
  return {
    ok: true,
    filter,
    fallbackAvailable: true,
    message: '',
    tasks: [
      {
        id,
        title: `${filter} task`,
        preview: '',
        cwd: `C:\\${filter}`,
        project: filter,
        source: 'appServer',
        status: filter === 'completed' ? 'completed' : 'idle',
        archived: filter === 'archived',
        createdAt: 1_753_000_000,
        updatedAt: 1_753_000_000,
      },
    ],
  }
}

describe('TaskPicker', () => {
  afterEach(() => {
    delete window.widgetControls
  })

  it('keeps the newest filter result when an older request resolves late', async () => {
    const completed = deferred<CodexTaskListResult>()
    const recent = deferred<CodexTaskListResult>()
    window.widgetControls = {
      isElectron: true,
      getState: vi.fn(),
      setExpanded: vi.fn(),
      close: vi.fn(),
      openTaskPicker: vi.fn(),
      closeTaskPicker: vi.fn(),
      sendTaskPickerGesture: vi.fn(),
      showMessage: vi.fn(),
      runCodexAction: vi.fn(),
      getCodexIntegrationStatus: vi.fn(),
      bindCodexTask: vi.fn().mockResolvedValue({
        ok: true,
        taskId: 'recent-task',
        message: '',
      }),
      listCodexTasks: vi.fn((filter: CodexTaskFilter) =>
        filter === 'completed' ? completed.promise : recent.promise,
      ),
      listRecentCodexFiles: vi.fn().mockResolvedValue({
        ok: true,
        files: [],
        message: '',
      }),
      openRecentCodexFile: vi.fn(),
      runCodexTaskAction: vi.fn(),
      getPendingCodexApprovals: vi.fn(),
      respondCodexApproval: vi.fn(),
      onCodexApprovalRequest: vi.fn(),
      onCodexApprovalsCleared: vi.fn(),
      onCodexRuntimeEvent: vi.fn(),
      onCodexIntegrationChanged: vi.fn(),
      onStateChange: vi.fn(),
      onTaskPickerStateChange: vi.fn(),
      onTaskPickerGesture: vi.fn(),
      onMessage: vi.fn(),
    }

    render(<TaskPicker open onClose={vi.fn()} onMessage={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '最近' }))

    await act(async () => recent.resolve(result('recent', 'recent-task')))
    expect(await screen.findByText('recent task')).toBeTruthy()

    await act(async () => completed.resolve(result('completed', 'completed-task')))
    expect(screen.queryByText('completed task')).toBeNull()
    expect(screen.getByText('recent task')).toBeTruthy()
  })
})

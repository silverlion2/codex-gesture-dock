// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppErrorBoundary } from './AppErrorBoundary'

function BrokenView(): never {
  throw new Error('synthetic renderer failure')
}

afterEach(() => {
  delete window.widgetControls
  vi.restoreAllMocks()
})

describe('AppErrorBoundary', () => {
  it('shows a private, user-recoverable fallback after a React failure', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(
      <AppErrorBoundary>
        <BrokenView />
      </AppErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByRole('button', { name: '重新加载' })).toBeTruthy()
    expect(screen.getByText(/没有上传/)).toBeTruthy()
    expect(screen.queryByText('synthetic renderer failure')).toBeNull()
  })
})

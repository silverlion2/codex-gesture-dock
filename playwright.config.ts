import { existsSync } from 'node:fs'
import { chromium, defineConfig, devices } from '@playwright/test'

const useInstalledEdge =
  !process.env.CI &&
  process.platform === 'win32' &&
  !existsSync(chromium.executablePath())

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.pw.ts',
  outputDir: './work/playwright-results',
  timeout: 60_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI
    ? [
        ['line'],
        ['html', { outputFolder: 'work/playwright-report', open: 'never' }],
      ]
    : [['line']],
  use: {
    baseURL: 'http://127.0.0.1:43997',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --port 43997',
    url: 'http://127.0.0.1:43997',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: useInstalledEdge ? 'edge-fallback' : 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(useInstalledEdge
          ? { channel: 'msedge' as const, video: 'off' as const }
          : {}),
      },
    },
  ],
})

import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.pw.ts',
  outputDir: './work/playwright-results',
  timeout: 30_000,
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
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})

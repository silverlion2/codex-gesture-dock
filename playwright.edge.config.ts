import { defineConfig, devices } from '@playwright/test'
import baseConfig from './playwright.config'

export default defineConfig({
  ...baseConfig,
  webServer: undefined,
  timeout: 180_000,
  expect: {
    timeout: 10_000,
  },
  projects: [
    {
      name: 'edge',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'msedge',
        video: 'off',
      },
    },
  ],
})

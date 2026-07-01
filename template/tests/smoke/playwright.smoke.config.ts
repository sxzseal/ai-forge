import { defineConfig } from '@playwright/test'

/**
 * Smoke-only Playwright config. Selects tests/smoke/**, no traces or videos,
 * uses SMOKE_BASE_URL from env. Invoked by dev-deploy Step 4.5.
 */
export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  retries: 1,
  reporter: [['json', { outputFile: 'smoke-report.json' }], ['list']],
  use: {
    baseURL: process.env.SMOKE_BASE_URL || 'http://localhost:3000',
    trace: 'off',
    video: 'off',
  },
  workers: 2,
})

import { defineConfig } from '@playwright/test'

/**
 * Smoke-only Playwright config. Selects tests/smoke/**, no traces or videos,
 * uses SMOKE_BASE_URL from env. Invoked by dev-deploy Step 4.5.
 *
 * Reporter writes to `tests/smoke/smoke-report.json` (relative to CWD when
 * invoked from repo root). dev-deploy reads that file — DO NOT change the path
 * without updating the skill's parsing step.
 */
export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  retries: 1,
  reporter: [
    ['json', { outputFile: 'smoke-report.json' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.SMOKE_BASE_URL || 'http://localhost:3000',
    trace: 'off',
    video: 'off',
  },
  workers: 2,
})

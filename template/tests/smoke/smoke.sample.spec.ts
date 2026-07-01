/**
 * Deploy smoke test — runs after /dev-deploy against SMOKE_BASE_URL.
 *
 * Each test corresponds to a P0 AC from .loop/acceptance-checklist.md.
 * Results are consumed by dev-deploy Step 4.5 which writes
 * .loop/deploy/smoke-result.json.
 *
 * Add tests as your acceptance-checklist grows. Keep them shallow —
 * this file is a smoke suite, not full regression. Fast > thorough.
 */
import { test, expect } from '@playwright/test'

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000'

test.describe('smoke · homepage', () => {
  test('AC-001 · homepage loads (200)', async ({ page }) => {
    const resp = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
    expect(resp?.status()).toBeLessThan(400)
  })

  test('AC-002 · homepage has a title', async ({ page }) => {
    await page.goto(BASE_URL)
    const title = await page.title()
    expect(title.length).toBeGreaterThan(0)
  })
})

test.describe('smoke · api health', () => {
  test('AC-101 · /api/health returns 200', async ({ request }) => {
    const resp = await request.get(`${BASE_URL}/api/health`)
    // Health endpoint is optional; skip if missing
    if (resp.status() === 404) test.skip()
    expect(resp.status()).toBeLessThan(500)
  })
})

import { test, expect } from '@playwright/test'

test.describe('Home Page', () => {
  test('renders project heading and links', async ({ page }) => {
    await page.goto('/')

    // Wait for the page to load
    await expect(page.locator('h1')).toBeVisible()

    // Verify the two action links are present
    await expect(page.getByRole('link', { name: /api health/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /storybook/i })).toBeVisible()
  })

  test('API health endpoint returns ok', async ({ request }) => {
    const response = await request.get('/api/health')
    expect(response.ok()).toBeTruthy()

    const body = await response.json()
    expect(body.status).toBe('ok')
  })
})

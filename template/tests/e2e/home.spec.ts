import { test, expect } from '@playwright/test'

test.describe('Home Page', () => {
  test('renders project heading and links (default locale)', async ({
    page,
  }) => {
    await page.goto('/')

    await expect(page.locator('h1')).toBeVisible()
    await expect(page.getByRole('link').first()).toBeVisible()
  })

  test('switches locale via URL prefix', async ({ page }) => {
    await page.goto('/en')

    await expect(page.locator('h1')).toBeVisible()
    await expect(page.getByRole('link', { name: /api health/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /storybook/i })).toBeVisible()
  })

  test('theme toggle button is present', async ({ page }) => {
    await page.goto('/')
    const toggle = page.getByRole('button', { name: /切换主题|toggle theme/i })
    await expect(toggle).toBeVisible()
  })

  test('locale switcher is present', async ({ page }) => {
    await page.goto('/')
    const switcher = page.getByRole('combobox', {
      name: /切换语言|switch language/i,
    })
    await expect(switcher).toBeVisible()
  })

  test('API health endpoint returns ok', async ({ request }) => {
    const response = await request.get('/api/health')
    expect(response.ok()).toBeTruthy()

    const body = await response.json()
    expect(body.status).toBe('ok')
  })
})

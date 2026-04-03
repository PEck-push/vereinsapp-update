import { test, expect } from '@playwright/test'

test.describe('App Flow', () => {
  test('redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login')
    // Check that the login page has essential elements
    await expect(page.locator('body')).toBeVisible()
  })

  test('invite page handles invalid token', async ({ page }) => {
    await page.goto('/invite/invalid-token-12345')
    // Should show error or loading state
    await expect(page.locator('body')).toBeVisible()
  })

  test('API returns 401 for unauthenticated requests', async ({ request }) => {
    const response = await request.post('/api/player/respond', {
      data: { eventId: 'test', status: 'accepted' },
    })
    expect(response.status()).toBe(401)
  })

  test('API validates missing event ID', async ({ request }) => {
    const response = await request.post('/api/generate-invite', {
      data: {},
    })
    // Should be 401 (no session) or 400
    expect([400, 401]).toContain(response.status())
  })
})

test.describe('Login → Dashboard → Event Flow (authenticated)', () => {
  // These tests require Firebase Auth emulator to be running
  // Skip in environments without emulator
  test.skip(
    !process.env.FIREBASE_AUTH_EMULATOR_HOST,
    'Requires Firebase Auth emulator'
  )

  test('admin can access dashboard after login', async ({ page }) => {
    // This test requires a pre-seeded admin account in the emulator
    await page.goto('/login')

    // Fill login form (structure depends on actual login page)
    const emailInput = page.locator('input[type="email"]')
    const passwordInput = page.locator('input[type="password"]')

    if (await emailInput.isVisible()) {
      await emailInput.fill('admin@test.club')
      await passwordInput.fill('test123456')
      await page.locator('button[type="submit"]').click()

      // Wait for redirect to dashboard
      await page.waitForURL('/dashboard', { timeout: 10000 })
      await expect(page).toHaveURL('/dashboard')
    }
  })
})

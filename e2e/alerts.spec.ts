import { expect, test } from '@playwright/test'
import { connect, mockApi } from './support/fixtures'

/**
 * The alert is the one feature that has to work when things go wrong, so it gets a
 * check: a stale heartbeat must raise exactly one notification per outage.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const calls: { title: string; body?: string }[] = []
    class FakeNotification {
      static permission = 'granted'
      static requestPermission = async () => 'granted'
      constructor(title: string, options?: NotificationOptions) {
        calls.push({ title, body: options?.body })
      }
    }
    Object.defineProperty(window, '__notifications', { value: calls, writable: true })
    Object.defineProperty(window, 'Notification', { value: FakeNotification, writable: true })
    // Notifications must be enabled before the app boots.
    window.localStorage.setItem(
      'ftdash.settings.v1',
      JSON.stringify({
        locale: 'zh-CN',
        websocket: true,
        streamAuth: 'auto',
        wsToken: '',
        allowControls: false,
        notifications: true,
        remember: true,
        controlsAcknowledged: false,
      }),
    )
  })
})

test('stale heartbeat raises one alert per outage', async ({ page }) => {
  await mockApi(page, { staleHeartbeat: true })
  await page.goto('/')
  await connect(page)
  await expect(page.locator('.shell')).toBeVisible()

  const alerts = () =>
    page.evaluate(
      () =>
        (window as unknown as { __notifications: { title: string; body?: string }[] })
          .__notifications,
    )

  await expect.poll(async () => (await alerts()).length, { timeout: 15_000 }).toBeGreaterThan(0)
  const first = await alerts()
  expect(first[0].title).toContain('心跳超时')
  expect(first[0].body).toContain('5m')

  // Still stale a few ticks later: no repeat notification for the same outage.
  await page.waitForTimeout(5000)
  expect((await alerts()).length).toBe(first.length)
})

test('a healthy heartbeat stays silent', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await connect(page)
  await expect(page.locator('.shell')).toBeVisible()
  await page.waitForTimeout(5000)

  const count = await page.evaluate(
    () => (window as unknown as { __notifications: unknown[] }).__notifications.length,
  )
  expect(count).toBe(0)
})

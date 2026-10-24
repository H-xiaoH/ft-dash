import { expect, test } from '@playwright/test'
import { connect, livePage, mockApi } from './support/fixtures'

test.use({ serviceWorkers: 'allow' })

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 })
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window)
    window.matchMedia = (query: string) => {
      const result = nativeMatchMedia(query)
      if (query === '(display-mode: standalone)') {
        Object.defineProperty(result, 'matches', { configurable: true, value: true })
      }
      return result
    }
  })
  await mockApi(page)
  await page.goto('/#/')
  await connect(page)
  await expect(page.locator('.shell')).toBeVisible()
})

test('built PWA metadata and service worker keep the install contract', async ({ page }) => {
  const manifestResponse = await page.request.get('/manifest.webmanifest')
  expect(manifestResponse.ok()).toBe(true)
  expect(manifestResponse.headers()['content-type']).toContain('manifest+json')
  const manifest = (await manifestResponse.json()) as {
    start_url?: string
    scope?: string
    display?: string
    icons?: Array<{ src?: string; sizes?: string; type?: string }>
  }

  expect(manifest).toMatchObject({ start_url: '/', scope: '/', display: 'standalone' })
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ src: 'pwa-192.png', sizes: '192x192', type: 'image/png' }),
      expect.objectContaining({ src: 'pwa-512.png', sizes: '512x512', type: 'image/png' }),
    ]),
  )

  const serviceWorker = await page.request.get('/sw.js')
  expect(serviceWorker.ok()).toBe(true)
  expect(serviceWorker.headers()['content-type']).toContain('javascript')
  const serviceWorkerSource = await serviceWorker.text()
  // The generated denylist must cover both /api/v1 and a reverse-proxy prefix such as
  // /kevin/api/v1, otherwise navigation fallback can turn an API error into index.html.
  expect(serviceWorkerSource).toMatch(/denylist:\[\/\\\/api\\\//)
  expect('/kevin/api/v1/status').toContain('/api/')

  await expect
    .poll(() =>
      page.evaluate(async () => (await navigator.serviceWorker.getRegistrations())[0]?.scope),
    )
    .toBe(new URL('/', page.url()).href)
})

test('an API-shaped path preserves its upstream status instead of the app shell', async ({
  page,
}) => {
  await page.route('**/kevin/api/v1/status', (route) =>
    route.fulfill({
      status: 401,
      headers: { 'Content-Type': 'application/json' },
      json: { detail: 'Unauthorized' },
    }),
  )

  const response = await page.evaluate(async () => {
    const result = await fetch('/kevin/api/v1/status', { headers: { Accept: 'application/json' } })
    return {
      status: result.status,
      contentType: result.headers.get('content-type'),
      body: await result.text(),
    }
  })

  expect(response.status).toBe(401)
  expect(response.contentType).toContain('application/json')
  expect(response.body).toContain('Unauthorized')
})

test('standalone page navigation does not leave a page history entry', async ({ page }) => {
  const historyLength = await page.evaluate(() => history.length)

  await page.locator('.tabbar__item').nth(1).click()
  await expect(page).toHaveURL(/#\/trades(?:\?|$)/)
  expect(await page.evaluate(() => history.length)).toBe(historyLength)
})

test('standalone trade detail keeps one list entry for back', async ({ page }) => {
  await page.locator('.tabbar__item').nth(1).click()
  await expect(page).toHaveURL(/#\/trades(?:\?|$)/)

  const row = livePage(page).locator('.card--tappable').first()
  await expect(row).toBeVisible()
  await page.waitForTimeout(300)
  await row.click()
  await expect(page.locator('.overlay--drawer .drawer')).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(/#\/trades(?:\?|$)/)
  await expect(page.locator('.overlay--drawer')).toHaveCount(0)
})

test('standalone overview detail returns to the trades list', async ({ page }) => {
  const openTrades = livePage(page)
    .locator('.panel')
    .filter({ has: page.locator('.panel__title', { hasText: '当前持仓' }) })
    .locator('table tbody tr')
    .first()

  await openTrades.click()
  await expect(page.locator('.overlay--drawer .drawer')).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(/#\/trades\?filter=open$/)
  await expect(page.locator('.overlay--drawer')).toHaveCount(0)
})

test('standalone deep-linked detail seeds a list history entry', async ({ page }) => {
  await page.goto('/#/trades?filter=closed&trade=1')
  await expect(page.locator('.overlay--drawer .drawer')).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(/#\/trades\?filter=closed$/)
  await expect(page.locator('.overlay--drawer')).toHaveCount(0)
})

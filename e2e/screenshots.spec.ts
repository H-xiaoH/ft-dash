import { test, type Page } from '@playwright/test'
import { connect, mockApi } from './support/fixtures'

/**
 * Regenerates the README screenshots from the end-to-end fixtures — never from a real bot,
 * because a real one would publish somebody's balances. Skipped unless asked for:
 *
 *   SCREENS=1 npx playwright test e2e/screenshots.spec.ts --project=chromium
 */
test.skip(!process.env.SCREENS, 'set SCREENS=1 to regenerate docs/images')

/** The socket is stubbed by the fixtures, so show the honest "switched off" state, no warning. */
const quietStream = (page: Page) =>
  page.addInitScript(() => {
    localStorage.setItem('ftdash.settings.v1', JSON.stringify({ websocket: false }))
  })

/** Long enough for the "bot added" toast to fade out of the frame. */
const SETTLE_MS = 5200

async function open(page: Page, path: string, options = {}) {
  await quietStream(page)
  await page.goto(path)
  await mockApi(page, options)
  await connect(page)
  await page.waitForSelector('.shell')
  await page.waitForTimeout(SETTLE_MS)
}

for (const lang of ['en', 'zh-CN'] as const) {
  const dir = `docs/images/${lang === 'en' ? 'en' : 'zh'}`

  test.describe(`screens ${lang}`, () => {
    test.use({ locale: lang, timezoneId: 'Asia/Shanghai' })

    test('overview', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 })
      await open(page, '/', { tradeCount: 24 })
      await page.screenshot({ path: `${dir}/dashboard.png` })
    })

    test('market', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 })
      await open(page, '/#/market')
      await page.waitForTimeout(1500)
      await page.screenshot({ path: `${dir}/market.png` })
    })

    test('trades on a phone', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await open(page, '/#/trades', { tradeCount: 24 })
      await page.screenshot({ path: `${dir}/trades-phone.png` })
    })
  })
}

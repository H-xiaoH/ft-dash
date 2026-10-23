import { expect, test } from '@playwright/test'
import { connect, livePage, mockApi } from './support/fixtures'

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

import { expect, test } from '@playwright/test'
import { connect, mockApi } from './support/fixtures'

/**
 * A longer history than the default fixture, so paging is actually exercised.
 * Kept in its own file because the mock has to be in place before connecting.
 */
test.beforeEach(async ({ page }) => {
  await mockApi(page, { tradeCount: 45 })
  await page.goto('/#/trades')
  await connect(page)
  await expect(page.locator('.shell')).toBeVisible()
  // The history arrives a moment after the shell: wait for the real count.
  await expect(page.locator('.seg__item').nth(2)).toContainText('全部交易 46')
})

test('long histories are paged at 20 rows per page', async ({ page }) => {
  const rows = page.locator('table tbody tr')
  const pager = page.locator('.trades__more')

  await expect(rows).toHaveCount(20)
  await expect(pager).toContainText('第 1 / 3 页')

  await pager.locator('button', { hasText: '下一页' }).click()
  await expect(rows).toHaveCount(20)
  await expect(pager).toContainText('第 2 / 3 页')

  await pager.locator('button', { hasText: '下一页' }).click()
  // 45 closed trades plus the open position: 20 + 20 + 6.
  await expect(rows).toHaveCount(6)
  await expect(pager).toContainText('第 3 / 3 页')
  // The last page disables "next" instead of looping around.
  await expect(pager.locator('button', { hasText: '下一页' })).toBeDisabled()

  await pager.locator('button', { hasText: '上一页' }).click()
  await expect(pager).toContainText('第 2 / 3 页')
})

test('changing the filter returns to the first page', async ({ page }) => {
  const pager = page.locator('.trades__more')
  await pager.locator('button', { hasText: '下一页' }).click()
  await expect(pager).toContainText('第 2 / 3 页')

  await page.locator('.seg__item', { hasText: '已平仓' }).click()
  await expect(pager).toContainText('第 1 / 3 页')
})

test('opening a trade detail keeps your place in the list', async ({ page }) => {
  // Phones tap cards instead of rows, which is where the jump-to-top was reported.
  await page.setViewportSize({ width: 390, height: 700 })
  await page.evaluate(() => window.scrollTo(0, 1500))
  await page.locator('.card--tappable').nth(8).click()

  await expect(page.locator('.overlay--drawer')).toBeVisible()
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
})

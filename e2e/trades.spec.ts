import { expect, test } from '@playwright/test'
import { connect, mockApi } from './support/fixtures'

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.goto('/#/trades')
  await connect(page)
  await expect(page.locator('.shell')).toBeVisible()
})

test('“all trades” includes the open position, not just history', async ({ page }) => {
  const tabs = page.locator('.seg__item')
  await expect(tabs.nth(0)).toContainText('持仓中 1')
  await expect(tabs.nth(1)).toContainText('已平仓 4')
  await expect(tabs.nth(2)).toContainText('全部交易 5')

  await tabs.nth(2).click()
  const rows = page.locator('table tbody tr')
  await expect(rows).toHaveCount(5)
  await expect(rows.first()).toContainText('OPEN/USDT')

  await tabs.nth(1).click()
  await expect(rows).toHaveCount(4)
})

test('outcome filter narrows the list to profitable or losing trades', async ({ page }) => {
  const rows = page.locator('table tbody tr')
  // Defaults to "all", which merges the open position with the history.
  await expect(rows).toHaveCount(5)

  await page.locator('.filter-menu__button').first().click()
  await page.locator('.filter-menu__item', { hasText: '亏损' }).click()
  await expect(rows).toHaveCount(1)

  await page.locator('.filter-menu__button').first().click()
  await page.locator('.filter-menu__item', { hasText: '盈利' }).click()
  await expect(rows).toHaveCount(4)
})

test('search expands on demand and clears when collapsed', async ({ page }) => {
  const rows = page.locator('table tbody tr')
  await expect(page.locator('.search-toggle input')).toHaveCount(0)

  await page.locator('button[title="搜索"]').first().click()
  await page.locator('.search-toggle input').fill('BBB')
  await expect(rows).toHaveCount(1)

  await page.locator('.search-toggle__close').click()
  await expect(rows).toHaveCount(5)
})

test('the overview "view all" links open the matching trades tab', async ({ page }) => {
  const panel = (title: string) =>
    page.locator('.panel').filter({ has: page.locator('.panel__title', { hasText: title }) })
  const tabs = page.locator('.seg__item')

  await page.goto('/#/')
  await panel('当前持仓').locator('.link-btn').click()
  await expect(page).toHaveURL(/filter=open/)
  await expect(tabs.nth(0)).toHaveAttribute('aria-pressed', 'true')

  await page.goto('/#/')
  await panel('最近平仓').locator('.link-btn').click()
  await expect(page).toHaveURL(/filter=closed/)
  await expect(tabs.nth(1)).toHaveAttribute('aria-pressed', 'true')
})

test('the filter travels between the URL and the tabs', async ({ page }) => {
  const tabs = page.locator('.seg__item')

  await page.goto('/#/trades?filter=closed')
  await expect(tabs.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('table tbody tr')).toHaveCount(4)

  // "all" is the default, so it is dropped from the URL instead of written out.
  await tabs.nth(2).click()
  await expect(page).not.toHaveURL(/filter=/)
  await expect(page.locator('table tbody tr')).toHaveCount(5)
})

test('a trade drawer takes focus, parks the page, and gives both back on close', async ({
  page,
}) => {
  const shell = page.locator('.shell')
  expect(await shell.evaluate((el) => el.hasAttribute('inert'))).toBe(false)

  await page.locator('table tbody tr').first().click()
  const drawer = page.locator('.overlay--drawer .drawer')
  await expect(drawer).toBeVisible()
  // Tab must start inside the dialog, not behind it.
  await expect(drawer).toBeFocused()
  expect(await shell.evaluate((el) => el.hasAttribute('inert'))).toBe(true)

  await page.keyboard.press('Escape')
  await expect(page.locator('.overlay--drawer')).toHaveCount(0)
  expect(await shell.evaluate((el) => el.hasAttribute('inert'))).toBe(false)
})

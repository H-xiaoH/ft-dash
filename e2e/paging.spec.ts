import { expect, test } from '@playwright/test'
import { connect, livePage, mockApi } from './support/fixtures'

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
  await expect(livePage(page).locator('.v-btn-toggle .v-btn').nth(2)).toContainText('全部交易 46')
})

test('long histories are paged at 20 rows per page', async ({ page }) => {
  const rows = livePage(page).locator('table tbody tr')
  const pager = livePage(page).locator('.panel__pager')

  await expect(rows).toHaveCount(20)
  await expect(pager.locator('[aria-current="true"]')).toHaveText('1')
  await expect(pager.getByRole('button', { name: /加载更多/ })).toHaveCount(0)

  await pager.getByRole('button', { name: '下一页' }).click()
  await expect(rows).toHaveCount(20)
  await expect(pager.locator('[aria-current="true"]')).toHaveText('2')

  await pager.getByRole('button', { name: '下一页' }).click()
  // 45 closed trades plus the open position: 20 + 20 + 6.
  await expect(rows).toHaveCount(6)
  await expect(pager.locator('[aria-current="true"]')).toHaveText('3')
  // The last page disables "next" instead of looping around.
  await expect(pager.getByRole('button', { name: '下一页' })).toBeDisabled()

  await pager.getByRole('button', { name: '上一页' }).click()
  await expect(pager.locator('[aria-current="true"]')).toHaveText('2')
})

test('changing the filter returns to the first page', async ({ page }) => {
  const pager = livePage(page).locator('.panel__pager')
  await pager.getByRole('button', { name: '下一页' }).click()
  await expect(pager.locator('[aria-current="true"]')).toHaveText('2')

  const closed = livePage(page).locator('.v-btn-toggle .v-btn', { hasText: '已平仓' })
  await closed.click()
  await expect(closed).toHaveAttribute('aria-pressed', 'true')
  await expect(livePage(page).locator('[data-filter-content]')).toHaveCount(1)
  await expect(pager.locator('[aria-current="true"]')).toHaveText('1')
})

test('opening a trade detail keeps your place in the list', async ({ page }) => {
  // Phones tap cards instead of rows, which is where the jump-to-top was reported.
  await page.setViewportSize({ width: 390, height: 700 })
  await livePage(page).evaluate((el) => {
    el.scrollTop = 1500
  })
  await livePage(page).locator('tbody tr').nth(8).click()

  await expect(page.locator('.trade-dialog')).toBeVisible()
  expect(await livePage(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
})

test('zero shows all loaded trades and survives a reload', async ({ page }) => {
  await livePage(page).locator('.panel__pager').getByRole('button', { name: '下一页' }).click()
  await page.locator('.rail__item').nth(6).click()
  const input = livePage(page).getByRole('spinbutton', { name: '交易每页条数', exact: true })
  await expect(input).toHaveAttribute('placeholder', '0 显示全部')
  await expect(input).toHaveAttribute('min', '0')
  await input.fill('0')
  await input.blur()
  await expect(input).toHaveValue('0')
  await page.locator('.rail__item').nth(1).click()
  await expect(livePage(page).locator('table tbody tr')).toHaveCount(46)
  await expect(livePage(page).locator('.panel__pager').locator('[aria-current="true"]')).toHaveText(
    '1',
  )
  await page.reload()
  await expect(livePage(page).locator('table tbody tr')).toHaveCount(46)
  await page.locator('.rail__item').nth(6).click()
  const restored = livePage(page).getByRole('spinbutton', { name: '交易每页条数', exact: true })
  await expect(restored).toHaveValue('0')
  await restored.fill('5')
  await restored.blur()
  await page.locator('.rail__item').nth(1).click()
  await expect(livePage(page).locator('table tbody tr')).toHaveCount(5)
  await expect(livePage(page).locator('.panel__pager').locator('[aria-current="true"]')).toHaveText(
    '1',
  )
})

import { expect, test } from '@playwright/test'
import { connect, mockApi } from './support/fixtures'

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.goto('/#/stats')
  await connect(page)
  await expect(page.locator('.shell')).toBeVisible()
})

test('pair table derives win rate, fees, volume and last close from the trades', async ({
  page,
}) => {
  const table = page.locator('.panel', { has: page.locator('th', { hasText: '交易对' }) }).first()
  await expect(table.locator('thead th')).toHaveText([
    '交易对',
    '笔数',
    '胜率',
    '总盈亏',
    '平均持仓',
    '手续费',
    '成交额',
    '最近交易',
  ])

  const firstRow = table.locator('tbody tr').first()
  // Sorted by total P&L by default: AAA has two trades, one win and one loss.
  await expect(firstRow).toContainText('AAA/USDT')
  await expect(firstRow).toContainText('50.00%')
  await expect(firstRow).toContainText('0.0200 USDT')
})

test('period tables, durations panel and KPI tiles render', async ({ page }) => {
  await expect(page.locator('.panel__title')).toHaveText(['交易对', '周期', '持仓时长'])
  await expect(page.locator('.metric__label').nth(4)).toHaveText('盈利 / 亏损')
  await expect(page.locator('.chart__tick').first()).toBeVisible()
})

test('column headers sort in both directions', async ({ page }) => {
  const table = page.locator('.panel', { has: page.locator('th', { hasText: '交易对' }) }).first()
  const total = table.locator('thead th', { hasText: '总盈亏' }).locator('button')

  // Total P&L is the default sort (descending), so the first click flips to ascending.
  await total.click()
  await expect(table.locator('tbody tr').first()).toContainText('CCC/USDT')

  await total.click()
  await expect(table.locator('tbody tr').first()).toContainText('AAA/USDT')
})

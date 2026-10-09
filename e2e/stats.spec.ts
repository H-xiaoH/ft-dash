import { expect, test, type Page } from '@playwright/test'
import { RESPONSES, connect, livePage, mockApi, segBlockMatches } from './support/fixtures'

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.goto('/#/stats')
  await connect(page)
  await expect(page.locator('.shell')).toBeVisible()
})

test('the pair table shows ten pairs a page', async ({ page }) => {
  // A longer pair list than the default fixture, so there is a second page to turn to.
  await mockApi(page, { pairCount: 12 })
  await page.reload()

  const table = livePage(page).locator('.panel', {
    has: page.locator('.panel__title', { hasText: '交易对' }),
  })
  const rows = table.locator('tbody tr')
  const pager = table.locator('.panel__pager')

  await expect(rows).toHaveCount(10)
  await expect(pager).toContainText('显示 10 / 12')
  await expect(pager).toContainText('第 1 / 2 页')
  // The narrow-screen card list is the same page of pairs.
  await expect(table.locator('.card')).toHaveCount(10)

  await pager.locator('button', { hasText: '下一页' }).click()
  await expect(rows).toHaveCount(2)
  await expect(pager).toContainText('第 2 / 2 页')
  await expect(pager.locator('button', { hasText: '下一页' })).toBeDisabled()

  // Sorting is the operator's own move, so it starts the table over at page one.
  await table.locator('thead th', { hasText: '笔数' }).locator('button').click()
  await expect(pager).toContainText('第 1 / 2 页')
  await expect(rows).toHaveCount(10)
})

test('the period block slides to the period you pick', async ({ page }) => {
  const seg = livePage(page).locator('.seg')
  await expect.poll(() => segBlockMatches(seg)).toBe(true)

  await livePage(page).locator('.seg__item', { hasText: '每月' }).click()
  await expect(livePage(page).locator('.seg__item[aria-pressed="true"]')).toContainText('每月')
  await expect.poll(() => segBlockMatches(seg)).toBe(true)
})

test('pair table derives win rate, fees, volume and last close from the trades', async ({
  page,
}) => {
  const table = livePage(page)
    .locator('.panel', { has: page.locator('.panel__title', { hasText: '交易对' }) })
    .first()
  await expect(table.locator('thead th')).toHaveText([
    '交易对',
    '笔数',
    '胜率',
    '本对盈亏',
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
  const stats = livePage(page)
  await expect(stats.locator('.panel__title')).toHaveText(['交易对表现', '周期', '持仓时长'])
  // The tile band is framed on all four sides: the grid draws the top and left hairlines,
  // the tiles draw right and bottom.
  const grid = stats.locator('.metric-grid').first()
  await expect(grid).toHaveCSS('border-top-width', '1px')
  await expect(grid).toHaveCSS('border-left-width', '1px')
  await expect(stats.locator('.metric-grid > .metric').first()).toHaveCSS(
    'border-right-width',
    '1px',
  )
  await expect(stats.locator('.metric-grid > .metric').first()).toHaveCSS(
    'border-bottom-width',
    '1px',
  )
  // The removed tiles stay gone, and the remaining KPIs are still there.
  await expect(stats.locator('.metric__label', { hasText: '盈利 / 亏损' })).toHaveCount(1)
  await expect(stats.locator('.metric__label', { hasText: '已平仓盈亏' })).toHaveCount(1)
  await expect(stats.locator('.metric__label', { hasText: '最佳交易对' })).toHaveCount(0)
  // The account-level tiles stay removed; the pair column is a different thing.
  await expect(stats.locator('.metric__label', { hasText: '总盈亏' })).toHaveCount(0)
  await expect(livePage(page).locator('.chart__tick').first()).toBeVisible()
  // The period table's first column is "date", not a repeat of the panel title.
  const period = livePage(page).locator('.panel', {
    has: page.locator('.panel__title', { hasText: '周期' }),
  })
  await expect(period.locator('thead th').first()).toHaveText('日期')
  await expect(period.locator('tbody td').first()).toHaveCSS('text-align', 'left')
})

test('column headers sort in both directions', async ({ page }) => {
  const table = livePage(page)
    .locator('.panel', { has: page.locator('.panel__title', { hasText: '交易对' }) })
    .first()
  const total = table.locator('thead th', { hasText: '本对盈亏' }).locator('button')

  // Per-pair P&L is the default sort (descending), so the first click flips to ascending.
  await total.click()
  await expect(table.locator('tbody tr').first()).toContainText('CCC/USDT')

  await total.click()
  await expect(table.locator('tbody tr').first()).toContainText('AAA/USDT')
})

/** Scopes a colour assertion to the tile carrying a given label. */
const tile = (page: Page, label: string) =>
  livePage(page)
    .locator('.metric')
    .filter({ has: page.locator('.metric__label', { hasText: label }) })

test('win/loss counts and risk ratios are colour-coded', async ({ page }) => {
  await expect(tile(page, '盈利 / 亏损').locator('.u-pos')).toHaveText('3')
  await expect(tile(page, '盈利 / 亏损').locator('.u-neg')).toHaveText('1')
  // 3 wins out of 4 decided trades, Sharpe 1.5 and Sortino 2.2: all above their lines.
  await expect(tile(page, '胜率').locator('.metric__value')).toHaveClass(/u-pos/)
  await expect(tile(page, '夏普').locator('.metric__value')).toHaveClass(/u-pos/)
  await expect(tile(page, '索提诺').locator('.metric__value')).toHaveClass(/u-pos/)
  // The per-pair row follows the same rule: AAA is one win and one loss.
  const table = livePage(page)
    .locator('.panel', { has: page.locator('.panel__title', { hasText: '交易对' }) })
    .first()
  const winCell = table.locator('tbody tr').first().locator('td').nth(2)
  // Exactly 50% still counts as an edge.
  await expect(winCell).toHaveClass(/u-pos/)
  await expect(winCell.locator('span.u-pos')).toHaveText('1')
  await expect(winCell.locator('span.u-neg')).toHaveText('1')
})

test('a losing edge turns the win rate red and a weak ratio amber', async ({ page }) => {
  await page.route('**/api/v1/profit', (route) =>
    route.fulfill({
      json: {
        ...(RESPONSES.profit as Record<string, unknown>),
        winning_trades: 1,
        losing_trades: 3,
        sharpe: 0.4,
        sortino: -0.2,
      },
    }),
  )

  await expect(tile(page, '胜率').locator('.metric__value')).toHaveClass(/u-neg/)
  await expect(tile(page, '夏普').locator('.metric__value')).toHaveClass(/u-warn/)
  await expect(tile(page, '索提诺').locator('.metric__value')).toHaveClass(/u-neg/)
})

import { expect, test } from '@playwright/test'
import { connect, livePage, mockApi } from './support/fixtures'

const marksOfKind = (
  page: import('@playwright/test').Page,
  kind: 'signal' | 'fill',
  side?: 'buy' | 'sell',
) =>
  livePage(page).locator(
    `.candles__marks polygon[data-kind="${kind}"]${side ? `[data-side="${side}"]` : ''}`,
  )

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.goto('/#/market')
  await connect(page)
  await expect(page.locator('.shell')).toBeVisible()
})

test('candles come first, with the bot timeframe shown as text', async ({ page }) => {
  const market = livePage(page)
  await expect(market.locator('.panel').first().locator('.panel__title')).toHaveText('K 线')
  await expect(market.locator('.panel').first().locator('.chip')).toHaveText('5m')
  await expect(market.locator('select')).toHaveCount(0)
  await expect(market.locator('.candles svg rect')).not.toHaveCount(0)
})

test('signals and fills are marked on the chart, with a legend to read them', async ({ page }) => {
  // The fixture signals once each way, and the open position was filled an hour ago — inside
  // the five hours of candles — but has not been closed.
  await expect(marksOfKind(page, 'signal', 'buy')).toHaveCount(1)
  await expect(marksOfKind(page, 'signal', 'sell')).toHaveCount(1)
  await expect(marksOfKind(page, 'fill', 'buy')).toHaveCount(1)
  await expect(marksOfKind(page, 'fill', 'sell')).toHaveCount(0)
  await expect(livePage(page).locator('.candles-legend')).toHaveText([
    '▲ 买入信号',
    '▼ 卖出信号',
    '▶ 实际成交',
  ])
})

test('a strategy that refuses the signal columns still gets its candles', async ({ page }) => {
  let refused = 0
  let asked = 0
  await page.route('**/api/v1/pair_candles', (route) => {
    asked += 1
    if (route.request().postData()?.includes('enter_long')) {
      refused += 1
      return route.fulfill({ status: 400, json: { error: 'Column enter_long not found' } })
    }
    // The retry is the one the fixture answers, so it carries candles like any other.
    return route.fallback()
  })

  // Coming back to the page asks again, this time with the signal columns in the request.
  await page.goto('/#/trades')
  await page.goto('/#/market')
  await expect(livePage(page).locator('.candles svg rect').first()).toBeVisible()
  // Refused once, asked again, and the chart is on screen rather than an error state.
  await expect.poll(() => refused).toBeGreaterThan(0)
  await expect.poll(() => asked).toBeGreaterThan(refused)
  await expect(livePage(page).locator('.candles__marks polygon').first()).toBeVisible()
})

test('candles follow the page on screen, not the mount', async ({ page }) => {
  /*
   * Every other page is held on the track, so this one is mounted while it is not the one
   * on screen. Mounting it is not a reason to fetch: the chart is asked for when the page
   * is walked to, and not when it is merely parked.
   */
  const candles: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('pair_candles')) candles.push(request.url())
  })

  await page.goto('/#/')
  await page.waitForTimeout(1500)
  expect(candles).toEqual([])

  await page.goto('/#/market')
  await expect.poll(() => candles.length).toBeGreaterThan(0)
  const shown = candles.length

  // And leaving the page must not fetch behind the operator's back either.
  await page.goto('/#/trades')
  await page.waitForTimeout(800)
  expect(candles.length).toBe(shown)
})

test('dragging across the chart scrubs the candle readout', async ({ page }) => {
  const readout = livePage(page).locator('.candles__readout')
  await expect(readout).toBeVisible()
  const before = await readout.innerText()

  const plot = livePage(page).locator('.candles svg')
  const box = (await plot.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2, { steps: 12 })
  await page.mouse.up()

  const after = await readout.innerText()
  expect(after).not.toBe(before)
  await expect(readout).toContainText('开')
  await expect(readout).toContainText('收')
})

test('pair list switches the chart to another pair', async ({ page }) => {
  const selector = livePage(page).locator('.panel').first().locator('.filter-menu__button')
  await expect(selector).toContainText('OPEN/USDT')

  await selector.click()
  await page.locator('.filter-menu__item', { hasText: 'BBB/USDT' }).click()
  await expect(selector).toContainText('BBB/USDT')
})

test('an open position puts its cost basis on the chart, tagged with its P&L', async ({ page }) => {
  // The fixture's open position is OPEN/USDT: filled at 1.0, +0.2 in profit so far.
  const entry = livePage(page).locator('.candles__entry')
  await expect(entry).toHaveCount(1)
  await expect(livePage(page).locator('.candles__entry-label')).toHaveText('+0.2000')
  // Profit tints the line as well as the tag.
  await expect(entry.locator('line')).toHaveAttribute('stroke', 'var(--long)')

  /*
   * Painted colour, not just a class: the tag used to render in the axis grey because a
   * CSS `fill` on the shared axis rule beat the per-tone fill attribute.
   */
  const tag = livePage(page).locator('.candles__entry-label')
  expect(await tag.evaluate((node) => getComputedStyle(node).fill)).toBe('rgb(36, 201, 138)')
  // Hairline outline, not the filled block it used to be.
  expect(await tag.evaluate((node) => getComputedStyle(node).strokeWidth)).toBe('1px')

  // Tucked into the right gutter: the tag ends at the chart's right edge, past the plot.
  const [chart, tagBox] = await Promise.all([
    livePage(page).locator('.candles svg').boundingBox(),
    tag.boundingBox(),
  ])
  expect(tagBox!.x + tagBox!.width).toBeGreaterThan(chart!.x + chart!.width * 0.85)

  // The line is horizontal and lives inside the plot.
  const line = entry.locator('line')
  const [x1, x2, y1, y2] = await line.evaluate((node) => [
    Number(node.getAttribute('x1')),
    Number(node.getAttribute('x2')),
    Number(node.getAttribute('y1')),
    Number(node.getAttribute('y2')),
  ])
  expect(x2).toBeGreaterThan(x1)
  expect(y1).toBe(y2)

  // A pair without a position gets no line at all.
  await livePage(page).locator('.panel').first().locator('.filter-menu__button').click()
  await page.locator('.filter-menu__item', { hasText: 'BBB/USDT' }).click()
  await expect(livePage(page).locator('.candles__entry')).toHaveCount(0)
})

test('the pair popup stays inside a phone-width viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await livePage(page).locator('.panel').first().locator('.filter-menu__button').click()

  const [list, viewport] = await Promise.all([
    page.locator('.filter-menu__list').boundingBox(),
    page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
  ])
  expect(list).not.toBeNull()
  expect(list!.x).toBeGreaterThanOrEqual(0)
  expect(list!.x + list!.width).toBeLessThanOrEqual(viewport.width)
  expect(list!.y).toBeGreaterThanOrEqual(0)
  expect(list!.y + list!.height).toBeLessThanOrEqual(viewport.height)
})

import { expect, test } from '@playwright/test'
import { connect, mockApi } from './support/fixtures'

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.goto('/#/market')
  await connect(page)
  await expect(page.locator('.shell')).toBeVisible()
})

test('candles come first, with the bot timeframe shown as text', async ({ page }) => {
  await expect(page.locator('.panel').first().locator('.panel__title')).toHaveText('K 线')
  await expect(page.locator('.panel').first().locator('.chip')).toHaveText('5m')
  await expect(page.locator('select')).toHaveCount(0)
  await expect(page.locator('.candles svg rect')).not.toHaveCount(0)
})

test('dragging across the chart scrubs the candle readout', async ({ page }) => {
  const readout = page.locator('.candles__readout')
  await expect(readout).toBeVisible()
  const before = await readout.innerText()

  const plot = page.locator('.candles svg')
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
  const selector = page.locator('.panel').first().locator('.filter-menu__button')
  await expect(selector).toContainText('OPEN/USDT')

  await selector.click()
  await page.locator('.filter-menu__item', { hasText: 'BBB/USDT' }).click()
  await expect(selector).toContainText('BBB/USDT')
})

test('an open position puts its cost basis on the chart, tagged with its P&L', async ({ page }) => {
  // The fixture's open position is OPEN/USDT: filled at 1.0, +0.2 in profit so far.
  const entry = page.locator('.candles__entry')
  await expect(entry).toHaveCount(1)
  await expect(page.locator('.candles__entry-label')).toHaveText('+0.2000')
  // Profit tints the line as well as the tag.
  await expect(entry.locator('line')).toHaveAttribute('stroke', 'var(--long)')

  /*
   * Painted colour, not just a class: the tag used to render in the axis grey because a
   * CSS `fill` on the shared axis rule beat the per-tone fill attribute.
   */
  const tag = page.locator('.candles__entry-label')
  expect(await tag.evaluate((node) => getComputedStyle(node).stroke)).toBe('rgb(36, 201, 138)')
  expect(await tag.evaluate((node) => getComputedStyle(node).fill)).toBe('rgb(0, 0, 0)')

  // Tucked into the right gutter: the tag ends at the chart's right edge, past the plot.
  const [chart, tagBox] = await Promise.all([
    page.locator('.candles svg').boundingBox(),
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
  await page.locator('.panel').first().locator('.filter-menu__button').click()
  await page.locator('.filter-menu__item', { hasText: 'BBB/USDT' }).click()
  await expect(page.locator('.candles__entry')).toHaveCount(0)
})

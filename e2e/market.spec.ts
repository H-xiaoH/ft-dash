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

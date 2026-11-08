import { expect, test } from '@playwright/test'
import { connect, livePage, mockApi } from './support/fixtures'
import { dragPage, settlePages } from './support/gestures'

test('five mobile destinations expose secondary pages and return to More', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.goto('/')
  await connect(page)
  await expect(page.locator('.shell')).toBeVisible()
  await expect(page.locator('.tabbar a')).toHaveText(['总览', '交易', '统计', '市场', '更多'])
  await page.locator('.tabbar a').last().click()
  await settlePages(page)
  for (const [name, path] of [
    ['日志', 'logs'],
    ['系统', 'system'],
    ['设置', 'settings'],
  ]) {
    await livePage(page).getByRole('link', { name, exact: true }).click()
    await expect(page).toHaveURL(new RegExp('#/' + path + '$'))
    expect(errors).toEqual([])
    await expect(livePage(page)).toHaveAttribute('data-page', path!)
    await expect(page.locator('.tabbar [aria-current="page"]')).toHaveAttribute('href', '#/more')
    await livePage(page).getByRole('button', { name: '返回更多', exact: true }).click()
    await expect(livePage(page)).toHaveAttribute('data-page', 'more')
  }
  await dragPage(page, 300)
  await expect(page).toHaveURL(/#\/market$/)
  await settlePages(page)
  const frame = (await page.locator('.page-swiper').boundingBox())!
  await page.mouse.move(frame.x + frame.width * 0.85, frame.y + 5)
  await page.mouse.down()
  await page.mouse.move(frame.x + frame.width * 0.85 - 300, frame.y + 5, { steps: 12 })
  await page.mouse.up()
  await expect(page).toHaveURL(/#\/more$/)
})

test('secondary routes retain their page and scroll when changing layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 })
  await mockApi(page)
  await page.goto('/#/settings')
  await connect(page)
  await settlePages(page)
  await livePage(page).evaluate((element) => (element.scrollTop = 180))
  const before = await livePage(page).evaluate((element) => element.scrollTop)
  await page.setViewportSize({ width: 1100, height: 740 })
  await settlePages(page)
  await expect(livePage(page)).toHaveAttribute('data-page', 'settings')
  await expect(page.locator('.rail a')).toHaveCount(7)
  await page.setViewportSize({ width: 390, height: 740 })
  await settlePages(page)
  await expect(livePage(page)).toHaveAttribute('data-page', 'settings')
  await expect.poll(() => livePage(page).evaluate((element) => element.scrollTop)).toBe(before)
})

test('keyboard selects historical candles and Escape restores the latest readout', async ({
  page,
}) => {
  await mockApi(page)
  await page.goto('/#/market')
  await connect(page)
  const plot = livePage(page).locator('.candles__plot')
  const summary = livePage(page).locator('.candles__summary')
  await expect(plot.locator('canvas').first()).toBeVisible()
  const latest = await summary.textContent()
  await plot.focus()
  await plot.press('ArrowLeft')
  await expect.poll(() => summary.textContent()).not.toBe(latest)
  await plot.press('ArrowRight')
  await expect(summary).toHaveText(latest!)
  await plot.press('Escape')
  await expect(summary).toHaveText(latest!)
})

test('logs keep their filter and search across layout changes', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 844 })
  await mockApi(page)
  await page.goto('/#/logs')
  await connect(page)
  await settlePages(page)
  await livePage(page).locator('.filter-menu__button').click()
  await page.getByRole('option', { name: 'ERROR', exact: true }).click()
  await livePage(page).getByRole('button', { name: '搜索', exact: true }).click()
  const search = livePage(page).locator('input[type="search"]')
  await search.fill('timeout')
  for (const width of [390, 1100, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await settlePages(page)
    await expect(livePage(page)).toHaveAttribute('data-page', 'logs')
    await expect(livePage(page).locator('.filter-menu__button')).toContainText('ERROR')
    await expect(livePage(page).locator('input[type="search"]')).toHaveValue('timeout')
  }
})

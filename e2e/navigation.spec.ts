import { expect, test } from '@playwright/test'
import { connect, livePage, mockApi } from './support/fixtures'
import { dragPage, settlePages, trackOffset } from './support/gestures'

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await connect(page)
  await expect(page.locator('.shell')).toBeVisible()
})

test('the wheel inside page content scrolls without changing routes', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 320 })
  await page.goto('/#/system')
  await settlePages(page)
  await livePage(page).hover({ position: { x: 400, y: 150 } })
  await page.mouse.wheel(0, 400)
  await expect.poll(() => livePage(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  await expect(page).toHaveURL(/#\/system$/)
  await livePage(page).evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  await page.mouse.wheel(0, 400)
  await expect(page).toHaveURL(/#\/system$/)
})

test('a page follows the finger and commits a long swipe', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await settlePages(page)
  const before = await trackOffset(page)
  await dragPage(page, -220, false)
  expect((await trackOffset(page)).x).toBeLessThan(before.x - 100)
  const current = await page.locator('.swiper-slide').nth(0).boundingBox()
  const next = await page.locator('.swiper-slide').nth(1).boundingBox()
  expect(Math.abs(current!.x + current!.width - next!.x)).toBeLessThanOrEqual(1)
  await page.mouse.up()
  await expect(page).toHaveURL(/#\/trades$/)
  await settlePages(page)
  await expect(page.locator('.tabbar [aria-current="page"]')).toHaveAttribute('href', '#/trades')
})

test('a short slow drag returns to the current page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await settlePages(page)
  await dragPage(page, -30, false)
  await page.waitForTimeout(350)
  await page.mouse.up()
  await settlePages(page)
  await expect(page).toHaveURL(/#\/$/)
  expect(Math.abs((await trackOffset(page)).x)).toBeLessThanOrEqual(1)
})

test('dragging beyond the first page resists without switching', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await dragPage(page, 120, false)
  expect((await trackOffset(page)).x).toBeLessThan(120)
  await page.mouse.up()
  await settlePages(page)
  await expect(page).toHaveURL(/#\/$/)
})

test('tab controls navigate without starting a page drag', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.tabbar a').nth(4).click()
  await expect(page).toHaveURL(/#\/more$/)
  await settlePages(page)
  await livePage(page).getByRole('link', { name: '设置', exact: true }).click()
  await expect(page).toHaveURL(/#\/settings$/)
  await settlePages(page)
  await expect(livePage(page)).toHaveAttribute('data-page', 'settings')
  await expect(page.locator('.tabbar [aria-current="page"]')).toHaveCount(1)
})

test('chart dragging belongs to the chart rather than page navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/market')
  const plot = livePage(page).locator('.candles__plot')
  await expect(plot.locator('canvas').first()).toBeVisible()
  const box = (await plot.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.8, box.y + 80)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.2, box.y + 80, { steps: 12 })
  await page.mouse.up()
  await expect(page).toHaveURL(/#\/market$/)
})

for (const target of [1, 4]) {
  test(`click navigation uses the same adjacent Swiper frames (${target})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator('.tabbar a').nth(target).click()
    await expect(page).toHaveURL(target === 1 ? /#\/trades$/ : /#\/more$/)
    await settlePages(page)
    const slide = (await page.locator('.swiper-slide-active').boundingBox())!
    const frame = (await page.locator('.page-swiper').boundingBox())!
    expect(Math.abs(slide.x - frame.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(slide.width - frame.width)).toBeLessThanOrEqual(1)
    await expect(page.locator('.page-scroll[inert]:visible')).toHaveCount(4)
    await expect(livePage(page)).toHaveCount(1)
  })
}

test('inactive pages remain inert and navigation preserves their scroll positions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 400 })
  await page.goto('/#/system')
  await livePage(page).evaluate((el) => {
    el.scrollTop = 120
  })
  const before = await livePage(page).evaluate((el) => el.scrollTop)
  await page.locator('.rail a').nth(6).click()
  await page.locator('.rail a').nth(5).click()
  await settlePages(page)
  expect(await livePage(page).evaluate((el) => el.scrollTop)).toBe(before)
  await expect(page.locator('.page-scroll[inert]')).toHaveCount(6)
})

test('the wheel over the rail walks one page per accepted notch', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.locator('.rail').hover()
  await page.mouse.wheel(0, 100)
  await expect(page).toHaveURL(/#\/trades$/)
  await page.waitForTimeout(360)
  await page.mouse.wheel(0, 100)
  await expect(page).toHaveURL(/#\/stats$/)
})

test('rapid desktop selections finish on the latest page', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.locator('.rail a').nth(6).click()
  await page.locator('.rail a').nth(1).click()
  await page.locator('.rail a').nth(3).click()
  await expect(page).toHaveURL(/#\/market$/)
  await settlePages(page)
  await expect(livePage(page)).toHaveAttribute('data-page', 'market')
  const slide = (await page.locator('.swiper-slide-active').boundingBox())!
  const frame = (await page.locator('.page-swiper').boundingBox())!
  expect(Math.abs(slide.y - frame.y)).toBeLessThanOrEqual(1)
})

test('a blocked intermediate page chunk does not block the loaded destination', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 900 })
  await settlePages(page)
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/assets/MarketView-*.js', async (route) => {
    await gate
    await route.continue()
  })
  try {
    await page.locator('.rail a').nth(6).click()
    await expect(page).toHaveURL(/#\/settings$/)
    await expect(page.locator('.swiper-slide-active [data-page="settings"]')).toBeVisible()
    await expect(livePage(page).locator('.settings__columns')).toBeVisible()
    await livePage(page)
      .locator('.v-input')
      .filter({ has: page.getByRole('combobox', { name: '语言', exact: true }) })
      .locator('.v-field')
      .click()
    await expect(page.getByRole('option', { name: 'English', exact: true })).toBeVisible()
  } finally {
    release()
  }
})

import { expect, test, type Page } from '@playwright/test'
import { connect, mockApi } from './support/fixtures'

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await connect(page)
  await expect(page.locator('.shell')).toBeVisible()
})

const hash = (page: Page) => new URL(page.url()).hash

test('the wheel steps pages at the ends of the scroll and scrolls in between', async ({ page }) => {
  /*
   * A short viewport makes the page scrollable, and navigating in-app (rather than
   * reloading) leaves the lazy chunks settled — a mid-test chunk swap resizes the
   * document and clamps the scroll, which looks like the wheel failing.
   */
  await page.setViewportSize({ width: 1200, height: 320 })
  await page.locator('.rail__item').nth(5).click()
  await expect(page.locator('.panel__title').first()).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight))
    .toBeGreaterThan(200)
  await page.mouse.move(600, 300)

  // Mid-page: the wheel belongs to the page.
  await page.evaluate(() => window.scrollTo(0, 150))
  await page.mouse.wheel(0, 240)
  await page.waitForTimeout(300)
  // There was room to scroll, so the wheel must not have been spent on navigation.
  // (Whether the smooth scroll has finished rendering is up to the browser.)
  expect(hash(page)).toBe('#/system')

  // Pinned to the bottom: the next flick steps forward.
  await page.evaluate(() => window.scrollTo(0, 99_999))
  await page.waitForTimeout(700)
  await page.mouse.wheel(0, 240)
  await expect.poll(() => hash(page)).toBe('#/settings')

  // A fresh page starts at the top, so flicking up steps back.
  await page.waitForTimeout(700)
  await page.mouse.wheel(0, -240)
  await expect.poll(() => hash(page)).toBe('#/system')
})

test('a sideways flick switches pages, except on a scrubbable chart', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 })
  await page.goto('/#/market')
  await expect(page.locator('[data-scrub]').first()).toBeVisible()

  const flick = (from: string, dx: number) =>
    page.evaluate(
      ({ selector, delta }) => {
        const target = document.querySelector(selector) as Element
        const touch = (x: number, y: number) =>
          new Touch({ identifier: 1, target, clientX: x, clientY: y })
        target.dispatchEvent(
          new TouchEvent('touchstart', {
            touches: [touch(300, 500)],
            changedTouches: [touch(300, 500)],
            bubbles: true,
          }),
        )
        target.dispatchEvent(
          new TouchEvent('touchend', {
            touches: [],
            changedTouches: [touch(300 + delta, 505)],
            bubbles: true,
          }),
        )
      },
      { selector: from, delta: dx },
    )

  // A drag on the chart is the chart's business: the page must not move.
  await flick('[data-scrub]', -160)
  await page.waitForTimeout(300)
  expect(hash(page)).toBe('#/market')

  // Anywhere else, flicking left goes forward and right goes back.
  await flick('.shell__body', -160)
  await expect.poll(() => hash(page)).toBe('#/logs')
  await flick('.shell__body', 160)
  await expect.poll(() => hash(page)).toBe('#/market')
})

test('the rail keeps no hover plate behind the sliding indicator', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/#/trades')
  const item = page.locator('.rail__item').nth(2)
  await item.hover()
  await expect(item).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
})

import { expect, test, type Page } from '@playwright/test'
import { connect, mockApi } from './support/fixtures'

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await connect(page)
  await expect(page.locator('.shell')).toBeVisible()
})

const hash = (page: Page) => new URL(page.url()).hash

test('the wheel scrolls the page and never switches pages', async ({ page }) => {
  // The wheel is the page's, not the router's: it must never switch pages, whether the
  // page still has room to scroll or is already pinned to an end.
  await page.setViewportSize({ width: 1200, height: 320 })
  await page.locator('.rail__item').nth(5).click()
  await expect(page.locator('.panel__title').first()).toBeVisible()
  await page.mouse.move(600, 300)

  await page.evaluate(() => window.scrollTo(0, 150))
  await page.mouse.wheel(0, 240)
  await page.waitForTimeout(300)
  expect(hash(page)).toBe('#/system')

  await page.evaluate(() => window.scrollTo(0, 99_999))
  await page.mouse.wheel(0, 240)
  await page.waitForTimeout(300)
  expect(hash(page)).toBe('#/system')

  await page.evaluate(() => window.scrollTo(0, 0))
  await page.mouse.wheel(0, -240)
  await page.waitForTimeout(300)
  expect(hash(page)).toBe('#/system')
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

test('a page travels the way you navigated', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 })
  const host = page.locator('.page-host')
  const travel = () =>
    host.evaluate((el) => ({
      enter: el.style.getPropertyValue('--page-enter'),
      leave: el.style.getPropertyValue('--page-leave'),
    }))

  // Forward: the new page arrives from the right, the old one leaves to the left.
  await page.locator('.tabbar__item').nth(3).click()
  await expect.poll(travel).toEqual({ enter: '28px', leave: '-16px' })

  // Backward: both flip, so the outgoing page never slides against your finger.
  await page.locator('.tabbar__item').nth(1).click()
  await expect.poll(travel).toEqual({ enter: '-28px', leave: '16px' })

  /*
   * The direction has to live on the stable host. An inline custom property is baked in
   * when an element renders, so a value carried by the page itself is read from the
   * render that created it — which is how the leaving page ended up animating with the
   * direction of the previous navigation.
   */
  const onPage = await page
    .locator('.page-host > *')
    .evaluate((el) => el.style.getPropertyValue('--page-enter'))
  expect(onPage).toBe('')
})

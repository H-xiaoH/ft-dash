import { expect, test, type Page } from '@playwright/test'
import { connect, livePage, mockApi } from './support/fixtures'

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await connect(page)
})

async function touch(page: Page, type: string, x: number) {
  await expect(page.locator('.shell__body')).toBeVisible()
  await page.evaluate(
    ({ type, x }) => {
      const target = document.querySelector('.shell__body')!
      const point = new Touch({ identifier: 1, target, clientX: x, clientY: 350 })
      target.dispatchEvent(
        new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches: type === 'touchend' || type === 'touchcancel' ? [] : [point],
          changedTouches: [point],
        }),
      )
    },
    { type, x },
  )
}
const trackX = (page: Page) =>
  page.locator('.page-track').evaluate((el) => {
    const value = getComputedStyle(el).transform
    return value === 'none' ? 0 : new DOMMatrixReadOnly(value).m41
  })

test('folded and expanded windows switch navigation at 720px, independently of tables', async ({
  page,
}) => {
  for (const width of [360, 540, 719, 720, 721, 768, 820, 900, 901, 1024]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/#/trades')
    await expect(page.locator('.page-enter-active, .page-leave-active')).toHaveCount(0)
    if (width < 720) {
      await expect(page.locator('.tabbar')).toBeVisible()
      await expect(page.locator('.rail')).toBeHidden()
    } else {
      await expect(page.locator('.rail')).toBeVisible()
      await expect(page.locator('.tabbar')).toBeHidden()
    }
    if (width <= 900) await expect(livePage(page).locator('.cards')).toBeVisible()
    else await expect(livePage(page).locator('.cards')).toBeHidden()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1)
  }
})

test('touch cancellation and unfolding restore the track and do not switch pages', async ({
  page,
}) => {
  await page.setViewportSize({ width: 540, height: 900 })
  await page.goto('/#/trades')
  await expect(page.locator('.page-enter-active, .page-leave-active')).toHaveCount(0)
  for (const interrupt of ['cancel', 'resize', 'commit-resize']) {
    await page.setViewportSize({ width: 540, height: 900 })
    // Let the resize handler reset the track before starting the synthetic gesture.
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    )
    await touch(page, 'touchstart', 440)
    await touch(page, 'touchmove', 240)
    await expect.poll(() => trackX(page)).toBe(-200)
    if (interrupt === 'cancel') await touch(page, 'touchcancel', 240)
    else {
      if (interrupt === 'commit-resize') await touch(page, 'touchend', 240)
      await page.setViewportSize({ width: 820, height: 900 })
    }
    await expect.poll(() => trackX(page)).toBe(0)
    await page.waitForTimeout(650)
    await expect(page).toHaveURL(/#\/trades$/)
    await expect(page.locator('.page-host')).not.toHaveAttribute('style', /min-height/)
  }
})

test('expanded touch windows keep horizontal gestures out of page navigation', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 900 })
  await page.goto('/#/trades')
  await expect(page.locator('.page-enter-active, .page-leave-active')).toHaveCount(0)
  await touch(page, 'touchstart', 650)
  await touch(page, 'touchmove', 200)
  expect(await trackX(page)).toBe(0)
  await touch(page, 'touchend', 200)
  await page.waitForTimeout(650)
  await expect(page).toHaveURL(/#\/trades$/)
  await page.locator('.rail__item').nth(2).click()
  await expect(page).toHaveURL(/#\/stats$/)
})

test('folding during a vertical page animation releases temporary state', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 900 })
  await page.goto('/#/trades')
  await expect(page.locator('.page-enter-active, .page-leave-active')).toHaveCount(0)
  await page.locator('.rail__item').nth(2).click()
  await expect(page.locator('.page-enter-active')).toHaveCount(1)
  const axis = await page.locator('.page-enter-active').evaluate((el) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform)
    return { x: matrix.m41, y: matrix.m42 }
  })
  expect(Math.abs(axis.x)).toBeLessThan(1)
  expect(axis.y).toBeGreaterThan(0)
  await page.setViewportSize({ width: 540, height: 900 })
  await expect(page.locator('.tabbar')).toBeVisible()
  await expect(page.locator('.page-enter-active, .page-leave-active')).toHaveCount(0)
  expect(await trackX(page)).toBe(0)
  await expect(page.locator('.page-host')).not.toHaveAttribute('style', /min-height/)
  await page.locator('.tabbar__item').nth(1).click()
  await expect(page).toHaveURL(/#\/trades$/)
  await expect(page.locator('.page-enter-active, .page-leave-active')).toHaveCount(0)
  await touch(page, 'touchstart', 440)
  await touch(page, 'touchmove', 180)
  await touch(page, 'touchend', 180)
  await expect(page).toHaveURL(/#\/stats$/)
  await expect.poll(() => trackX(page)).toBe(0)
})

test('folding cancels a wheel navigation queued behind the current animation', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 900 })
  await page.goto('/#/trades')
  await expect(page.locator('.page-enter-active, .page-leave-active')).toHaveCount(0)
  await page.locator('.rail__item').nth(2).click()
  await expect(page.locator('.page-enter-active')).toHaveCount(1)
  await page
    .locator('.rail')
    .dispatchEvent('wheel', { deltaY: 90, bubbles: true, cancelable: true })
  await page.setViewportSize({ width: 540, height: 900 })
  await page.waitForTimeout(650)
  await expect(page).toHaveURL(/#\/stats$/)
  await page.locator('.tabbar__item').nth(3).click()
  await expect(page).toHaveURL(/#\/market$/)
})

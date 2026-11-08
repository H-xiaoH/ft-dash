import { expect, test, type Page } from '@playwright/test'
import { connect, livePage, mockApi } from './support/fixtures'
import { dragPage, settlePages, trackOffset } from './support/gestures'

test.beforeEach(async ({ page }) => {
  await mockApi(page, { tradeCount: 80 })
  await page.goto('/')
  await connect(page)
})

test('folded and expanded windows switch navigation at 720px independently of tables', async ({
  page,
}) => {
  for (const width of [390, 719, 720, 820, 1280, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(page.locator('.rail')).toHaveCount(width >= 720 ? 1 : 0)
    await expect(page.locator('.tabbar')).toHaveCount(width < 720 ? 1 : 0)
    await expect
      .poll(() => page.locator('.page-swiper').getAttribute('class'))
      .toMatch(width >= 720 ? /swiper-vertical/ : /swiper-horizontal/)
    await expect(livePage(page)).toHaveCount(1)
  }
})

test('unfolding during a drag restores the selected page frame', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await dragPage(page, -100, false)
  await page.setViewportSize({ width: 820, height: 900 })
  await expect(page.locator('.rail')).toBeVisible()
  await page.mouse.up()
  await settlePages(page)
  await expect(page).toHaveURL(/#\/$/)
  expect(Math.abs((await trackOffset(page)).y)).toBeLessThanOrEqual(1)
})

test('expanded windows keep horizontal gestures in page content', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 900 })
  await dragPage(page, -300)
  await expect(page).toHaveURL(/#\/$/)
})

test('folding during a page animation releases the transition', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 900 })
  await page.locator('.rail a').nth(6).click()
  await page.setViewportSize({ width: 390, height: 900 })
  await settlePages(page)
  await expect(page).toHaveURL(/#\/settings$/)
  await expect(page.locator('.tabbar [aria-current="page"]')).toHaveAttribute('href', '#/more')
  const slide = (await page.locator('.swiper-slide-active').boundingBox())!
  const frame = (await page.locator('.page-swiper').boundingBox())!
  expect(Math.abs(slide.x - frame.x)).toBeLessThanOrEqual(1)
})

async function sampleFrames(page: Page, from: number, to: number) {
  await page.evaluate(
    ({ from, to }) => {
      const errors: string[] = []
      ;(window as unknown as { frameErrors: string[] }).frameErrors = errors
      const started = performance.now()
      const tick = () => {
        const frame = document.querySelector('.page-swiper')!.getBoundingClientRect()
        const slides = document.querySelectorAll('.swiper-slide')
        const a = slides[from].getBoundingClientRect()
        const b = slides[to].getBoundingClientRect()
        if (Math.abs(a.height - frame.height) > 1 || Math.abs(b.height - frame.height) > 1)
          errors.push('slide height differs from frame')
        const stride = (to - from) * frame.height
        if (Math.abs(b.top - a.top - stride) > 1) errors.push('pages do not share the same stride')
        if (performance.now() - started < 500) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    },
    { from, to },
  )
}

test.describe('expanded touch page frames', () => {
  test('expanded pages keep a shared edge when content changes during the transition', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 820, height: 900 })
    await page.goto('/#/trades?filter=open')
    await settlePages(page)
    await sampleFrames(page, 1, 3)
    await page.locator('.rail a').nth(3).click()
    await expect(livePage(page).locator('.candles__plot canvas').first()).toBeVisible()
    await page.waitForTimeout(550)
    expect(
      await page.evaluate(() => (window as unknown as { frameErrors: string[] }).frameErrors),
    ).toEqual([])
  })

  test('expanded short and long trade pages slide within the visible page frame', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 820, height: 900 })
    await page.goto('/#/stats')
    await settlePages(page)
    await sampleFrames(page, 1, 2)
    await page.locator('.rail a').nth(1).click()
    await livePage(page)
      .getByRole('button', { name: /全部交易/ })
      .click()
    await page.waitForTimeout(550)
    expect(
      await page.evaluate(() => (window as unknown as { frameErrors: string[] }).frameErrors),
    ).toEqual([])
    const frame = (await page.locator('.page-swiper').boundingBox())!
    expect((await page.locator('.swiper-slide-active').boundingBox())!.height).toBeCloseTo(
      frame.height,
      0,
    )
  })

  for (const width of [820, 1280]) {
    test(`scrolled overview leaves from its visible content at ${width}px without flashing the top`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 500 })
      await livePage(page).evaluate((el) => {
        el.scrollTop = el.scrollHeight
      })
      const scroll = await livePage(page).evaluate((el) => el.scrollTop)
      expect(scroll).toBeGreaterThan(0)
      await sampleFrames(page, 0, 3)
      await page.locator('.rail a').nth(3).click()
      await page.waitForTimeout(550)
      expect(await page.locator('[data-page="dashboard"]').evaluate((el) => el.scrollTop)).toBe(
        scroll,
      )
      expect(
        await page.evaluate(() => (window as unknown as { frameErrors: string[] }).frameErrors),
      ).toEqual([])
    })
  }

  test('expanded pages respect reduced motion without starting page animations', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 820, height: 900 })
    await page.locator('.rail a').nth(6).click()
    await expect(page).toHaveURL(/#\/settings$/)
    await settlePages(page)
    expect(await page.locator('.swiper-wrapper').evaluate((el) => el.getAnimations().length)).toBe(
      0,
    )
    await expect(livePage(page)).toHaveAttribute('data-page', 'settings')
  })
})

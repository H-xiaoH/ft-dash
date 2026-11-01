import { expect, test } from '@playwright/test'
import { connect, livePage, mockApi } from './support/fixtures'

test('dropdowns scale from the centre with synchronized backdrop blur and inert leave', async ({
  page,
}) => {
  await mockApi(page)
  await page.goto('/')
  await connect(page)
  await page.goto('/#/trades')
  await expect(page.locator('.page-enter-active, .page-leave-active')).toHaveCount(0)
  await page.evaluate(() => {
    const frames: { scale: number; blur: string }[] = []
    ;(window as unknown as { __menuFrames: unknown }).__menuFrames = frames
    const started = performance.now()
    const tick = () => {
      const list = document.querySelector('.filter-menu__list')
      const backdrop = document.querySelector('.filter-menu__backdrop')
      if (list && backdrop) {
        const style = getComputedStyle(list)
        frames.push({
          scale: new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform)
            .m11,
          blur: getComputedStyle(backdrop).backdropFilter,
        })
      }
      if (performance.now() - started < 500) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await livePage(page).locator('.filter-menu__button').first().click()
  await expect(page.locator('.filter-menu__list')).toBeVisible()
  await page.waitForTimeout(220)
  await page.screenshot({ path: '.scratch/dropdown-motion/open.png' })
  const frames = await page.evaluate(
    () => (window as unknown as { __menuFrames: { scale: number; blur: string }[] }).__menuFrames,
  )
  expect(frames.some((frame) => frame.scale > 0.9 && frame.scale < 0.999)).toBe(true)
  expect(frames.at(-1)?.scale).toBe(1)
  expect(
    frames.some((frame) => {
      const blur = parseFloat(frame.blur.replace('blur(', ''))
      return blur > 0 && blur < 2
    }),
  ).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.locator('.filter-menu__list[inert]')).toHaveCount(1)
  await expect(page.locator('.filter-menu__list')).toHaveCount(0)
})

test('dropdowns respect reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await page.goto('/')
  await connect(page)
  await page.goto('/#/settings')
  await expect(page.locator('.page-enter-active, .page-leave-active')).toHaveCount(0)
  await livePage(page).locator('.filter-menu__button').first().click()
  const list = page.locator('.filter-menu__list')
  await expect(list).toBeVisible()
  expect(await list.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s')
  await page.keyboard.press('Escape')
  await expect(list).toHaveCount(0)
})

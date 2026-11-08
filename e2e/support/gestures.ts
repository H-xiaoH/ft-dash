import { expect, type Page } from '@playwright/test'

export async function settlePages(page: Page) {
  await expect(page.locator('.swiper-slide-active .page-scroll:not([inert])')).toHaveCount(1)
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
  })
  await expect
    .poll(() =>
      page.locator('.page-swiper').evaluate((el) => {
        const frame = el.getBoundingClientRect()
        const slide = el.querySelector('.swiper-slide-active')!.getBoundingClientRect()
        const moving = [
          el,
          el.querySelector('.swiper-wrapper'),
          document.querySelector('.main'),
        ].some((node) =>
          node?.getAnimations().some((animation) => animation.playState === 'running'),
        )
        return !moving && Math.abs(frame.x - slide.x) <= 1 && Math.abs(frame.y - slide.y) <= 1
      }),
    )
    .toBe(true)
}
export async function dragPage(page: Page, dx: number, release = true) {
  await expect
    .poll(() => page.locator('.page-swiper').getAttribute('class'))
    .toMatch((await page.viewportSize())!.width >= 720 ? /swiper-vertical/ : /swiper-horizontal/)
  await settlePages(page)
  const box = (await page.locator('.page-swiper').boundingBox())!
  const x = box.x + (dx < 0 ? box.width * 0.85 : box.width * 0.15)
  const y = box.y + Math.min(35, box.height / 4)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx * 0.1, y, { steps: 2 })
  await page.mouse.move(x + dx, y, { steps: 12 })
  if (release) await page.mouse.up()
}
export async function trackOffset(page: Page) {
  return page.locator('.swiper-wrapper').evaluate((el) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform)
    return { x: matrix.m41, y: matrix.m42 }
  })
}

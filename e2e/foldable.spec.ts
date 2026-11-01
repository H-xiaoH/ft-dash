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

test.describe('expanded touch page frames', () => {
  test.use({ hasTouch: true, isMobile: true })
  test.beforeEach(async ({ page, browserName }) => {
    // Leave enough frames for Chromium geometry sampling when workers share a CPU.
    await page.addStyleTag({ content: '.page-host { --dur-slide: 400ms; }' })
    if (browserName !== 'webkit') return
    const installClock = () => {
      // Linux WebKit can render too few frames in a short native animation. Seek the
      // same effect synchronously; Chromium below still checks real-time playback.
      const markClock = () => {
        document.documentElement.dataset.motionClock = 'seek'
      }
      if (document.documentElement) markClock()
      else document.addEventListener('DOMContentLoaded', markClock, { once: true })
      const animate = Element.prototype.animate
      Element.prototype.animate = function (...args) {
        const animation = animate.apply(this, args)
        if (this.classList.contains('page-track')) {
          const duration = Number(animation.effect!.getTiming().duration)
          animation.pause()
          for (const fraction of [0, 0.25, 0.5, 0.75, 0.99]) {
            animation.currentTime = duration * fraction
            window.dispatchEvent(new Event('page-motion-sample'))
          }
          animation.currentTime = 0
          animation.play()
        }
        return animation
      }
    }
    await page.addInitScript(installClock)
    await page.evaluate(installClock)
  })

  test('expanded pages keep a shared edge when content changes during the transition', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 820, height: 900 })
    await page.goto('/#/trades')
    await expect(livePage(page).locator('.card')).toHaveCount(5)
    await expect(page.locator('.page-enter-active,.page-leave-active')).toHaveCount(0)

    for (const [index, name, direction] of [
      [2, 'stats', 1],
      [1, 'trades', -1],
    ] as const) {
      await page.evaluate((direction) => {
        const result = { count: 0, maxGap: 0, changed: false }
        ;(window as unknown as { __changingEdge: typeof result }).__changingEdge = result
        const started = performance.now()
        const tick = () => {
          const leaving = document.querySelector('.page-leave-active')
          const entering = document.querySelector('.page-enter-active')
          if (leaving && entering) {
            if (!result.changed) {
              // Model rows or a chart arriving while the page above the shared edge moves.
              const content = document.createElement('div')
              content.style.cssText = 'min-height:240px;flex-shrink:0'
              ;(direction === 1 ? leaving : entering).append(content)
              result.changed = true
            }
            // WebKit can advance its compositor between separate geometry reads.
            const animation =
              document.documentElement.dataset.motionClock === 'seek'
                ? undefined
                : leaving.parentElement!.getAnimations()[0]
            const startTime = animation?.startTime ?? null
            if (animation && (startTime === null || animation.currentTime === null)) {
              requestAnimationFrame(tick)
              return
            }
            if (animation) {
              const time = animation.currentTime
              animation.pause()
              animation.currentTime = time
            }
            const oldRect = leaving.getBoundingClientRect()
            const newRect = entering.getBoundingClientRect()
            if (animation) {
              animation.play()
              animation.startTime = startTime
            }
            const gap =
              direction === 1 ? newRect.top - oldRect.bottom : oldRect.top - newRect.bottom
            result.maxGap = Math.max(result.maxGap, Math.abs(gap))
            result.count++
          }
          if (
            document.documentElement.dataset.motionClock !== 'seek' &&
            performance.now() - started < 700
          )
            requestAnimationFrame(tick)
        }
        if (document.documentElement.dataset.motionClock === 'seek')
          window.addEventListener('page-motion-sample', tick)
        else requestAnimationFrame(tick)
      }, direction)
      await page.locator('.rail__item').nth(index).tap()
      await expect(page).toHaveURL(new RegExp(`#/${name}$`))
      await page.waitForTimeout(750)
      const result = await page.evaluate(
        () =>
          (
            window as unknown as {
              __changingEdge: { count: number; maxGap: number; changed: boolean }
            }
          ).__changingEdge,
      )
      expect(result.changed).toBe(true)
      expect(result.count).toBeGreaterThan(2)
      expect(result.maxGap).toBeLessThan(2)
      await expect(page.locator('.page-motion-frame')).toHaveCount(0)
      expect(await livePage(page).evaluate((element) => element.getAnimations().length)).toBe(0)
      expect(
        await page.locator('.page-track').evaluate((element) => element.getAnimations().length),
      ).toBe(0)
    }
  })

  test('expanded short and long trade pages slide within the visible page frame', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 820, height: 900 })
    await mockApi(page, { tradeCount: 40 })
    await page.goto('/#/trades?filter=open')
    await page.reload()
    await expect(livePage(page).locator('.card')).toHaveCount(1)
    await page.evaluate(() => {
      const state = window as unknown as { __frameStart: number | null }
      state.__frameStart = null
      const animate = Element.prototype.animate
      Element.prototype.animate = function (...args) {
        if (this.classList.contains('page-track')) {
          const entering = this.querySelector('.page-enter-active')!
          const host = this.closest('.page-host')!
          state.__frameStart =
            entering.getBoundingClientRect().top - host.getBoundingClientRect().top
        }
        return animate.apply(this, args)
      }
    })

    for (const [index, name, direction] of [
      [3, 'market', 1],
      [1, 'trades', -1],
    ] as const) {
      if (direction === -1) {
        await page.locator('.rail__item').nth(2).tap()
        await expect(page).toHaveURL(/#\/stats$/)
        await expect(page.locator('.page-enter-active,.page-leave-active')).toHaveCount(0)
      }
      await page.evaluate((direction) => {
        ;(window as unknown as { __frameStart: number | null }).__frameStart = null
        const frames: { gap: number; y: number; oldHeight: number; newHeight: number }[] = []
        ;(window as unknown as { __frameTravel: typeof frames }).__frameTravel = frames
        const started = performance.now()
        const tick = () => {
          const leaving = document.querySelector('.page-leave-active')
          const entering = document.querySelector('.page-enter-active')
          if (leaving && entering) {
            // WebKit can advance its compositor between separate geometry reads.
            const animation =
              document.documentElement.dataset.motionClock === 'seek'
                ? undefined
                : leaving.parentElement!.getAnimations()[0]
            const startTime = animation?.startTime ?? null
            if (animation && (startTime === null || animation.currentTime === null)) {
              requestAnimationFrame(tick)
              return
            }
            if (animation) {
              const time = animation.currentTime
              animation.pause()
              animation.currentTime = time
            }
            const oldRect = leaving.getBoundingClientRect()
            const newRect = entering.getBoundingClientRect()
            if (animation) {
              animation.play()
              animation.startTime = startTime
            }
            const hostRect = document.querySelector('.page-host')!.getBoundingClientRect()
            frames.push({
              gap: direction === 1 ? newRect.top - oldRect.bottom : oldRect.top - newRect.bottom,
              y: newRect.top - hostRect.top,
              oldHeight: oldRect.height,
              newHeight: newRect.height,
            })
          }
          if (
            document.documentElement.dataset.motionClock !== 'seek' &&
            performance.now() - started < 700
          )
            requestAnimationFrame(tick)
        }
        if (document.documentElement.dataset.motionClock === 'seek')
          window.addEventListener('page-motion-sample', tick)
        else requestAnimationFrame(tick)
      }, direction)
      await page.locator('.rail__item').nth(index).tap()
      await expect(page).toHaveURL(new RegExp(`#/${name}$`))
      await page.waitForTimeout(750)
      const frames = await page.evaluate(
        () =>
          (
            window as unknown as {
              __frameTravel: { gap: number; y: number; oldHeight: number; newHeight: number }[]
            }
          ).__frameTravel,
      )
      expect(frames.length).toBeGreaterThan(2)
      expect(
        Math.max(...frames.map((frame) => Math.abs(frame.gap))),
        JSON.stringify({ index, frames }),
      ).toBeLessThan(2)
      expect(Math.max(...frames.map((frame) => Math.abs(frame.y)))).toBeLessThanOrEqual(900)
      expect(Math.abs(frames[0]!.y - frames[frames.length - 1]!.y)).toBeGreaterThan(100)
      const start = await page.evaluate(
        () => (window as unknown as { __frameStart: number | null }).__frameStart,
      )
      expect(start).not.toBeNull()
      expect(Math.abs(start!)).toBeGreaterThan(600)
      expect(Math.abs(start!)).toBeLessThanOrEqual(900)
      expect(frames.every((frame) => Math.abs(frame.oldHeight - frame.newHeight) < 2)).toBe(true)
      await expect(page.locator('.page-motion-frame')).toHaveCount(0)
      expect(await livePage(page).evaluate((element) => element.getAnimations().length)).toBe(0)
      expect(
        await page.locator('.page-track').evaluate((element) => element.getAnimations().length),
      ).toBe(0)
    }
    await expect(livePage(page).locator('.card')).toHaveCount(20)
    expect(
      await livePage(page).evaluate((el) => el.getBoundingClientRect().height),
    ).toBeGreaterThan(900)
  })

  for (const width of [820, 1280]) {
    test(`scrolled overview leaves from its visible content at ${width}px without flashing the top`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 600 })
      await page.goto('/#/')
      await expect(livePage(page).locator('.metric-grid')).toBeVisible()
      await expect(livePage(page).locator('table tbody tr')).toHaveCount(5)
      await expect(page.locator('.page-enter-active,.page-leave-active')).toHaveCount(0)
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100)
      await page.evaluate(() => {
        const marker = document.querySelector<HTMLElement>(
          '.page-track > :not(.page-neighbor) .panel__title',
        )!
        const track = document.querySelector('.page-track')!
        const layoutTop = () => {
          let top = 0
          for (
            let node: HTMLElement | null = marker;
            node && node !== track;
            node = node.offsetParent as HTMLElement | null
          )
            top += node.offsetTop
          return top
        }
        const start = marker.getBoundingClientRect().top
        const localStart = layoutTop() - window.scrollY
        const result = { frames: 0, maxJump: 0, initialJump: 0, started: false }
        ;(window as unknown as { __scrollMotion: typeof result }).__scrollMotion = result
        const animate = Element.prototype.animate
        Element.prototype.animate = function (...args) {
          if (this === track) {
            Element.prototype.animate = animate
            result.initialJump = Math.abs(marker.getBoundingClientRect().top - start)
            result.started = true
          }
          return animate.apply(this, args)
        }
        let started = 0
        const tick = () => {
          const leaving = document.querySelector('.page-leave-active')
          if (leaving && marker.isConnected) {
            started ||= performance.now()
            result.maxJump = Math.max(
              result.maxJump,
              Math.abs(layoutTop() - (leaving as HTMLElement).scrollTop - localStart),
            )
            result.frames++
          }
          if (
            document.documentElement.dataset.motionClock !== 'seek' &&
            (!started || performance.now() - started < 700)
          )
            requestAnimationFrame(tick)
        }
        if (document.documentElement.dataset.motionClock === 'seek')
          window.addEventListener('page-motion-sample', tick)
        else requestAnimationFrame(tick)
      })
      await page.locator('.rail__item').nth(3).tap()
      await expect(page).toHaveURL(/#\/market$/)
      await expect(page.locator('.page-enter-active,.page-leave-active')).toHaveCount(0)
      const result = await page.evaluate(
        () =>
          (
            window as unknown as {
              __scrollMotion: {
                frames: number
                maxJump: number
                initialJump: number
                started: boolean
              }
            }
          ).__scrollMotion,
      )
      expect(result.started).toBe(true)
      expect(result.initialJump).toBeLessThan(2)
      expect(result.frames).toBeGreaterThan(2)
      expect(result.maxJump).toBeLessThan(2)
      expect(await page.evaluate(() => window.scrollY)).toBe(0)
    })
  }

  test('expanded pages respect reduced motion without starting page animations', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 820, height: 900 })
    await page.goto('/#/trades')
    await expect(page.locator('.page-enter-active,.page-leave-active')).toHaveCount(0)
    await page.evaluate(() => {
      const state = { calls: 0 }
      ;(window as unknown as { __pageAnimations: typeof state }).__pageAnimations = state
      const animate = Element.prototype.animate
      Element.prototype.animate = function (...args) {
        if (this.classList.contains('page-motion-frame') || this.classList.contains('page-track'))
          state.calls++
        return animate.apply(this, args)
      }
    })
    await page.locator('.rail__item').nth(3).tap()
    await expect(page).toHaveURL(/#\/market$/)
    await expect(
      page.locator('.page-motion-frame,.page-enter-active,.page-leave-active'),
    ).toHaveCount(0)
    expect(
      await page.evaluate(
        () => (window as unknown as { __pageAnimations: { calls: number } }).__pageAnimations.calls,
      ),
    ).toBe(0)
    await expect(page.locator('.page-host')).not.toHaveAttribute('style', /min-height/)
  })
})

import { expect, test, type Page } from '@playwright/test'
import { connect, heldSlot, livePage, mockApi } from './support/fixtures'

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
  await expect(livePage(page).locator('.panel__title').first()).toBeVisible()
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

/** Drives one touch of a drag; the tests always start, move, then end. */
const touchAt = (
  page: Page,
  type: 'touchstart' | 'touchmove' | 'touchend',
  x: number,
  y = 500,
  selector = '.shell__body',
) =>
  page.evaluate(
    ({ type, x, y, selector }) => {
      const target = document.querySelector(selector) as Element
      const point = new Touch({ identifier: 1, target, clientX: x, clientY: y })
      target.dispatchEvent(
        new TouchEvent(type, {
          touches: type === 'touchend' ? [] : [point],
          changedTouches: [point],
          bubbles: true,
          cancelable: true,
        }),
      )
    },
    { type, x, y, selector },
  )

test('the page follows the finger and commits past a third of the screen', async ({ page }) => {
  // A drag touches the transition machinery directly, so watch the console while it runs.
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (message) => {
    const text = message.text()
    if (
      message.type() === 'error' ||
      text.includes('[Vue warn]') ||
      text.includes('[Vue Router warn]')
    )
      errors.push(text)
  })

  await page.setViewportSize({ width: 390, height: 780 })
  const neighbor = heldSlot(page, 1)
  await expect(neighbor).toHaveCount(1)

  await touchAt(page, 'touchstart', 330)
  await touchAt(page, 'touchmove', 270)
  await expect.poll(() => trackX(page)).toBe(-60)
  // The next page peeks in from the right, one page beyond the one you are dragging.
  await expect(neighbor).toBeVisible()
  const peek = (await neighbor.boundingBox())!.x
  expect(peek).toBeGreaterThan(0)
  expect(peek).toBeLessThan(390)

  await touchAt(page, 'touchmove', 150)
  await expect.poll(() => trackX(page)).toBe(-180)
  // Both pages travel with the finger, one for one.
  expect(Math.round(peek - (await neighbor.boundingBox())!.x)).toBe(120)

  /*
   * Record the biggest offset the page's own root shows for the next few frames. The
   * neighbour is already showing this page, so the swap must not displace it — clearing
   * the handoff too early re-arms the slide and the page arrives a second time.
   */
  await page.evaluate(() => {
    ;(window as unknown as { __worst?: number }).__worst = 0
    const started = performance.now()
    const tick = () => {
      const root = document.querySelector('.page-track > *')
      const transform = root ? getComputedStyle(root).transform : 'none'
      if (transform !== 'none') {
        const offset = Math.abs(new DOMMatrixReadOnly(transform).m41)
        const worst = (window as unknown as { __worst?: number }).__worst ?? 0
        ;(window as unknown as { __worst?: number }).__worst = Math.max(worst, offset)
      }
      if (performance.now() - started < 400) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await touchAt(page, 'touchend', 150)

  await expect.poll(() => hash(page)).toBe('#/trades')
  // The neighbour was already showing this page, so the track lands back at rest.
  await expect.poll(() => trackX(page)).toBe(0)
  await expect(heldSlot(page, 0)).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { __worst?: number }).__worst)).toBe(0)
  expect(errors).toEqual([])
})

test('a short slow drag springs back without switching', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 })
  await page.locator('.tabbar__item').nth(1).click()
  await expect.poll(() => hash(page)).toBe('#/trades')

  await touchAt(page, 'touchstart', 330)
  for (const x of [320, 312, 306, 302, 299]) {
    await touchAt(page, 'touchmove', x)
    await page.waitForTimeout(90)
  }
  expect(await trackX(page)).toBe(-31)
  await touchAt(page, 'touchend', 299)

  await page.waitForTimeout(400)
  expect(hash(page)).toBe('#/trades')
  expect(await trackX(page)).toBe(0)
  await expect(heldSlot(page, 0)).toHaveCount(0)
})

test('the tab block lands on the tab you swiped to and never past it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 })
  await page.locator('.tabbar__item').nth(2).click()
  await expect.poll(() => hash(page)).toBe('#/stats')
  const slots = await page
    .locator('.tabbar__item')
    .evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().x)))

  // Watch the block for the whole gesture: 统计 -> 市场.
  await page.evaluate(() => {
    const seen: number[] = []
    ;(window as unknown as { __block?: number[] }).__block = seen
    const started = performance.now()
    const tick = () => {
      seen.push(Math.round(document.querySelector('.tabbar__indicator')!.getBoundingClientRect().x))
      if (performance.now() - started < 1200) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  await touchAt(page, 'touchstart', 330)
  for (const x of [300, 260, 220, 180]) {
    await touchAt(page, 'touchmove', x)
    await page.waitForTimeout(45)
  }
  await touchAt(page, 'touchend', 150)

  await expect.poll(() => hash(page)).toBe('#/market')
  await page.waitForTimeout(500)

  const seen = await page.evaluate(
    () => (window as unknown as { __block?: number[] }).__block ?? [],
  )
  // The index moves and the drag travel drops in the same render, so the block stops on
  // 市场 — counting both would send it a slot further, to 日志.
  expect(Math.max(...seen)).toBeLessThanOrEqual(slots[3] + 2)
  expect(seen.at(-1)).toBe(slots[3])
  expect(slots[4]).toBeGreaterThan(slots[3])
})

test('a drag with nowhere to go resists and never switches', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 })
  // The first page has nothing before it, so dragging right only rubber-bands.
  await touchAt(page, 'touchstart', 60)
  await touchAt(page, 'touchmove', 180)
  await expect.poll(() => trackX(page)).toBe(30)
  await expect(heldSlot(page, 0)).toHaveCount(0)

  await touchAt(page, 'touchend', 260)
  await page.waitForTimeout(400)
  expect(hash(page)).toBe('#/')
  expect(await trackX(page)).toBe(0)
})

/** How lit a bottom-bar tab is, read off its painted colour: brighter means higher. */
const tabLit = (page: Page, index: number) =>
  page
    .locator('.tabbar__item')
    .nth(index)
    .evaluate((el) => {
      const channels = getComputedStyle(el)
        .color.match(/[\d.]+/g)!
        .slice(0, 3)
      return channels.reduce((total, channel) => total + Number(channel), 0)
    })

const trackX = (page: Page) =>
  page.locator('.page-track').evaluate((el) => {
    const transform = getComputedStyle(el).transform
    return transform === 'none' ? 0 : Math.round(new DOMMatrixReadOnly(transform).m41)
  })

test('a touch on the bar belongs to its tab, not to the pages', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 })

  /*
   * The bar is a control strip, not a drag surface: a sideways shove that starts on it must
   * leave the pages and the block where they were. Otherwise a tap on a tab could lose the
   * gesture to a finger that wobbled, and the tab would do nothing at all.
   */
  const bar = (await page.locator('.tabbar').boundingBox())!
  const y = Math.round(bar.y + bar.height / 2)
  await touchAt(page, 'touchstart', 330, y, '.tabbar')
  await touchAt(page, 'touchmove', 120, y, '.tabbar')

  expect(await trackX(page)).toBe(0)
  expect(await hash(page)).toBe('#/')

  await touchAt(page, 'touchend', 120, y, '.tabbar')
  await page.waitForTimeout(200)
  expect(await hash(page)).toBe('#/')
})

test('a horizontal drag on a scrubbable chart stays with the chart', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 })
  await page.goto('/#/market')
  /*
   * Scoped to the candle chart on purpose: two `[data-scrub]` regions exist (this one and
   * the overview's bar chart), and during the page transition the overview is still mounted.
   * A bare `.first()` could latch onto that one and measure a node that is about to leave.
   */
  const chart = page.locator('.candles[data-scrub]')
  await expect(chart).toBeVisible()

  const box = (await chart.boundingBox())!
  const selector = '.candles[data-scrub]'
  await touchAt(
    page,
    'touchstart',
    Math.round(box.x + box.width * 0.7),
    Math.round(box.y + 40),
    selector,
  )
  await touchAt(
    page,
    'touchmove',
    Math.round(box.x + box.width * 0.3),
    Math.round(box.y + 42),
    selector,
  )

  expect(await trackX(page)).toBe(0)
  await expect(heldSlot(page, 0)).toHaveCount(0)
  await touchAt(
    page,
    'touchend',
    Math.round(box.x + box.width * 0.3),
    Math.round(box.y + 42),
    selector,
  )
  await page.waitForTimeout(300)
  expect(hash(page)).toBe('#/market')
})

test('the rail keeps no hover plate behind the sliding indicator', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/#/trades')
  const item = page.locator('.rail__item').nth(2)
  await item.hover()
  await expect(item).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
})

test('the tab bar fades its icons and labels instead of snapping', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 })
  const item = page.locator('.tabbar__item').first()
  // The icon is stroked with currentColor, so this one transition covers both.
  await expect(item).toHaveCSS('transition-property', 'color')
  await expect(item).toHaveCSS('transition-duration', '0.22s')
})

test('a page travels the way you navigated', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 })
  const host = page.locator('.page-host')
  const travel = () =>
    host.evaluate((el) => ({
      enter: el.style.getPropertyValue('--page-enter'),
      leave: el.style.getPropertyValue('--page-leave'),
    }))

  // Forward: the new page arrives from the right, the old one leaves to the left, and
  // both travel a full page — the same motion the finger produces.
  await page.locator('.tabbar__item').nth(3).click()
  // Wait for the navigation to land first: the variables only say which way the *last*
  // navigation went, so a second click while the first is still loading reads the old one.
  await expect.poll(() => hash(page)).toBe('#/market')
  // Unitless: the axis picks the distance — a page width on phones, a viewport on wide
  // screens, where pages differ in height.
  await expect.poll(travel).toEqual({ enter: '1', leave: '-1' })

  // Backward: both flip, so the outgoing page never slides against your finger.
  await page.locator('.tabbar__item').nth(1).click()
  await expect.poll(() => hash(page)).toBe('#/trades')
  await expect.poll(travel).toEqual({ enter: '-1', leave: '1' })

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

  // Wide screens travel the way the rail reads — up and down, a whole viewport — rather than
  // sideways, and the distance is the viewport even though these pages differ in height.
  // The phone transition has to be over first, or its sideways frames land in the sample.
  await page.waitForTimeout(400)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.evaluate(() => {
    const frames: { x: number; y: number }[] = []
    ;(window as unknown as { __vertical?: unknown }).__vertical = frames
    const tick = () => {
      const page = document.querySelector('.page-track > :not(.page-neighbor)')
      if (page) {
        const moved = getComputedStyle(page).transform
        const matrix = moved === 'none' ? null : new DOMMatrixReadOnly(moved)
        frames.push({ x: Math.round(matrix?.m41 ?? 0), y: Math.round(matrix?.m42 ?? 0) })
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await page.locator('.rail__item').nth(4).click()
  await expect.poll(() => hash(page)).toBe('#/logs')
  await page.waitForTimeout(600)

  const vertical = await page.evaluate(
    () => (window as unknown as { __vertical?: { x: number; y: number }[] }).__vertical ?? [],
  )
  // Sideways: never. Up or down: a whole viewport's worth, not the page's own height.
  expect(vertical.every((frame) => frame.x === 0)).toBe(true)
  expect(Math.max(...vertical.map((frame) => Math.abs(frame.y)))).toBeGreaterThan(600)
})

test('tapping a tab slides the pages the way a swipe does', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 })

  // Watch the two pages while the tap is handled: they must be in flight together, each
  // travelling a full page. The old step animation moved one at a time and only 28px.
  await page.evaluate(() => {
    const frames: { leaving: number; entering: number }[] = []
    ;(window as unknown as { __frames?: unknown }).__frames = frames
    const offset = (el: Element) => {
      const transform = getComputedStyle(el).transform
      return transform === 'none' ? 0 : Math.round(new DOMMatrixReadOnly(transform).m41)
    }
    /*
     * The budget starts when the two pages first share the track, not when this recorder
     * is installed: the tap is dispatched by the test runner, and how long that takes is
     * not what this test is about. Recording stops once the outgoing page is gone.
     */
    let deadline = 0
    const tick = () => {
      const pages = [...document.querySelectorAll('.page-track > :not(.page-neighbor)')]
      if (pages.length === 2) {
        if (!deadline) deadline = performance.now() + 700
        frames.push({ leaving: offset(pages[0]), entering: offset(pages[1]) })
      }
      if (deadline && performance.now() > deadline) return
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  await page.locator('.tabbar__item').nth(1).click()
  await expect.poll(() => hash(page)).toBe('#/trades')
  await page.waitForTimeout(900)

  const frames = await page.evaluate(
    () =>
      (window as unknown as { __frames?: { leaving: number; entering: number }[] }).__frames ?? [],
  )
  // Both pages on screen at once: the old one heading left, the new one arriving from the right.
  expect(frames.length).toBeGreaterThan(2)
  expect(frames.some((frame) => frame.leaving < -20 && frame.entering > 20)).toBe(true)
})

/** Points the mouse at the middle of a rail item, where the wheel walks pages. */
const railAt = async (page: Page, index: number) => {
  const box = (await page.locator('.rail__item').nth(index).boundingBox())!
  await page.mouse.move(Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2))
}

test('every other page is already on the track, and inert', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 })

  // Held from the start, so a drag or a wheel step never uncovers a page that is still
  // loading: the six pages the router is not showing are all mounted.
  await expect(page.locator('.page-neighbor')).toHaveCount(6)
  await expect(page.locator('.page-neighbor[inert]')).toHaveCount(6)
  await expect(page.locator('.page-track > :not(.page-neighbor)')).toHaveCount(1)

  // Held, but out of reach: tabbing around the shell must not walk into a page that is
  // off screen.
  for (let press = 0; press < 25; press += 1) await page.keyboard.press('Tab')
  const reached = await page.evaluate(
    () => document.activeElement?.closest('.page-neighbor') !== null,
  )
  expect(reached).toBe(false)
})

test('a page swipe lights the bar as the block travels', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 })
  const lit = (at: number) => tabLit(page, at)
  const before = await Promise.all([0, 1, 2].map(lit))

  // 总览 -> 交易: the block walks one tab, and the light walks with it while the finger
  // is still down — it is the block's position that lights a tab, not the route.
  await touchAt(page, 'touchstart', 330)
  await touchAt(page, 'touchmove', 200)
  await page.waitForTimeout(80)
  const midway = await Promise.all([0, 1, 2].map(lit))
  // Nothing has committed yet: this is the drag, not a route change.
  expect(hash(page)).toBe('#/')
  expect(midway[1]).toBeGreaterThan(before[1])

  await touchAt(page, 'touchend', 60)
  await expect.poll(() => hash(page)).toBe('#/trades')
  const after = await Promise.all([0, 1, 2].map(lit))
  // Landed: the light has moved one tab along.
  expect(after[1]).toBeGreaterThan(after[0])
  expect(after[0]).toBeCloseTo(before[1], 3)
})

test('the wheel over the rail walks a page per notch', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await railAt(page, 0)

  // One notch is one page, and the page behind the rail stays where it is.
  await page.mouse.wheel(0, 100)
  await expect.poll(() => hash(page)).toBe('#/trades')
  await page.mouse.wheel(0, 100)
  await expect.poll(() => hash(page)).toBe('#/stats')
  await page.mouse.wheel(0, -100)
  await expect.poll(() => hash(page)).toBe('#/trades')
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
})

test('a trackpad stream over the rail walks pages as it goes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await railAt(page, 0)

  /*
   * A trackpad does not send notches: it sends a stream of small deltas, which add up
   * between events. Dispatched in the page so the stream is one continuous burst — what
   * is under test is the arithmetic, not the input device.
   */
  const swipe = (events: number) =>
    page.evaluate((count) => {
      const rail = document.querySelector('.rail__item')!
      for (let i = 0; i < count; i += 1) {
        rail.dispatchEvent(
          new WheelEvent('wheel', { deltaY: 18, deltaMode: 0, bubbles: true, cancelable: true }),
        )
      }
    }, events)

  await swipe(5)
  await expect.poll(() => hash(page)).toBe('#/trades')
  await swipe(5)
  await expect.poll(() => hash(page)).toBe('#/stats')
})

test("the wheel off the rail stays the page's own scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 })
  await page.mouse.move(640, 300)
  await page.mouse.wheel(0, 400)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  expect(hash(page)).toBe('#/')
})

test('landing on a page refreshes once, after the pages stop changing', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  /*
   * `/monthly` belongs to the analytics slice, which the slow poll only asks for every
   * twelfth tick — so in the first seconds of a session it is the walk's own refresh
   * talking, not the cadence underneath it.
   */
  const monthly: number[] = []
  page.on('request', (request) => {
    if (request.url().includes('/monthly')) monthly.push(Date.now())
  })
  await railAt(page, 0)
  const before = monthly.length

  await page.mouse.wheel(0, 100)
  await page.mouse.wheel(0, 100)
  await page.mouse.wheel(0, 100)
  await expect.poll(() => hash(page)).toBe('#/market')
  // Three pages in one walk, and nothing fetched while it was still moving.
  expect(monthly.length - before).toBe(0)
  await expect.poll(() => monthly.length - before).toBe(1)
})

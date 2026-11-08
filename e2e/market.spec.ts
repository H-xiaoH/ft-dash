import { expect, test } from '@playwright/test'
import { connect, enableWriteAccess, livePage, mockApi, selectionMatches } from './support/fixtures'
import { settlePages } from './support/gestures'

const LISTS_SCROLL_TEST = 'every pair list scrolls inside the available viewport'
const LOCK_SEARCH_TEST = 'filters pair locks on desktop and mobile'
const PAIR_CONFIRM_TEST = 'requires the exact pair before removing a market safeguard'
const CANDLE_VISIBILITY_TEST = 'candles follow the page on screen, not the mount'

test.beforeEach(async ({ page }, testInfo) => {
  const checksListScroll = testInfo.title === LISTS_SCROLL_TEST
  if (checksListScroll) await page.setViewportSize({ width: 390, height: 740 })

  const mockOptions = {
    [LISTS_SCROLL_TEST]: { whitelistCount: 40, blacklistCount: 40, lockCount: 20 },
    [LOCK_SEARCH_TEST]: { lockCount: 2 },
    [PAIR_CONFIRM_TEST]: { blacklistCount: 1, lockCount: 1 },
  }[testInfo.title]
  await mockApi(page, mockOptions)
  await page.goto(testInfo.title === CANDLE_VISIBILITY_TEST ? '/#/' : '/#/market')
  await connect(page)
  await expect(page.locator('.shell')).toBeVisible()
})

/**
 * The list that overflows inside a page locked to the viewport. Getting this wrong leaves the
 * bottom rows clipped and unreachable on a phone — and unreachable by keyboard even on a wide
 * screen, which is why the scroll box has to be a focus stop of its own.
 */
async function expectListScrolls(
  page: import('@playwright/test').Page,
  rows: number,
  row: string,
  label: string,
) {
  const market = livePage(page)
  const list = market.locator('.market__scroll')

  await expect(list.locator(row)).toHaveCount(rows)
  await expect.poll(() => list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)

  await expect(list).toHaveAttribute('tabindex', '0')
  await list.focus()
  await expect(list).toBeFocused()

  await list.evaluate((element) => element.scrollTo({ top: element.scrollHeight }))
  expect(await list.evaluate((element) => element.scrollTop), `${label} scrolled`).toBeGreaterThan(
    0,
  )
  expect(await page.evaluate(() => document.scrollingElement?.scrollTop), label).toBe(0)

  // The last row has to end up on screen, not clipped below the fold.
  const last = list.locator(row).last()
  const box = await last.boundingBox()
  const viewport = page.viewportSize()
  expect(box!.y + box!.height, `${label}: last row reachable`).toBeLessThanOrEqual(viewport!.height)
}

test(LISTS_SCROLL_TEST, async ({ page }) => {
  const market = livePage(page)
  await expectListScrolls(page, 40, 'tbody tr', 'whitelist')
  const list = market.getByRole('region', { name: '白名单' })
  const [header, scrollBox] = await Promise.all([
    list.locator('th').first().boundingBox(),
    list.boundingBox(),
  ])
  expect(Math.abs(header!.y - scrollBox!.y)).toBeLessThanOrEqual(2)
  expect(
    await list
      .locator('th')
      .first()
      .evaluate((el) => getComputedStyle(el).position),
  ).toBe('sticky')

  await market.locator('.v-btn-toggle .v-btn', { hasText: '黑名单' }).click()
  await expectListScrolls(page, 40, '.blist__item', 'blacklist')

  await market.locator('.v-btn-toggle .v-btn', { hasText: '交易锁' }).click()
  await expectListScrolls(page, 20, '.v-list-item', 'locks')
})

test('the pair-list block slides to the tab you pick', async ({ page }) => {
  const seg = livePage(page).locator('.v-btn-toggle')
  await expect.poll(() => selectionMatches(seg)).toBe(true)

  await seg.locator('.v-btn', { hasText: '交易锁' }).click()
  await expect(seg.locator('.v-btn[aria-pressed="true"]')).toContainText('交易锁')
  await expect.poll(() => selectionMatches(seg)).toBe(true)
})

test(PAIR_CONFIRM_TEST, async ({ page }) => {
  await enableWriteAccess(page)
  await page.goto('/#/market')
  const market = livePage(page)
  for (const [tab, label, pair] of [
    ['黑名单', '移出黑名单', 'B01/USDT'],
    ['交易锁', '解除锁定', 'L01/USDT'],
  ]) {
    await market.locator('.v-btn-toggle .v-btn', { hasText: tab }).click()
    await market.getByRole('button', { name: label, exact: true }).click()
    const dialog = page.getByRole('dialog')
    const confirm = dialog.getByRole('button', { name: label, exact: true })
    await expect(confirm).toBeDisabled()
    await dialog.getByRole('textbox').fill('OTHER/USDT')
    await expect(confirm).toBeDisabled()
    await dialog.getByRole('textbox').fill(pair)
    await expect(confirm).toBeEnabled()
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(dialog).toHaveCount(0)
  }
})

test(LOCK_SEARCH_TEST, async ({ page }) => {
  const market = livePage(page)
  await market.getByRole('button', { name: /^交易锁/ }).click()
  const locks = market.getByRole('region', { name: '交易锁' })
  await market.getByRole('button', { name: '搜索', exact: true }).click()
  const search = market.locator('input[type="search"]')
  await search.fill('l02')

  await page.setViewportSize({ width: 1200, height: 900 })
  await expect(locks.locator('tbody tr')).toHaveText([/L02\/USDT/])
  await expect(locks.locator('tbody tr')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 780 })
  await expect(locks.locator('.v-list-item')).toHaveText([/L02\/USDT/])
  await expect(locks.locator('.v-list-item')).toBeVisible()

  await search.fill('absent')
  await expect(locks).toContainText('没有符合条件的记录')
  await expect(locks.locator('.v-list-item')).toHaveCount(0)
})

test('candles come first, with the bot timeframe shown as text', async ({ page }) => {
  const market = livePage(page)
  await expect(market.locator('.panel').first().locator('.panel__title')).toHaveText('K 线')
  await expect(market.locator('.panel').first().locator('.v-chip')).toHaveText('5m')
  await expect(market.locator('select')).toHaveCount(0)
  await expect(market.locator('.candles__plot canvas')).not.toHaveCount(0)
})

test('candles render without signals or a marker legend', async ({ page }) => {
  await expect(livePage(page).locator('.candles__plot canvas').first()).toBeVisible()
  await expect(livePage(page).locator('.market__meta')).toHaveCount(0)
  await expect(livePage(page).locator('.market__legend')).toHaveCount(0)
  const painted = await livePage(page)
    .locator('.candles__plot canvas')
    .first()
    .evaluate((el) => {
      const canvas = el as HTMLCanvasElement
      return (
        canvas.width > 0 &&
        canvas.height > 0 &&
        canvas
          .getContext('2d')!
          .getImageData(0, 0, canvas.width, canvas.height)
          .data.some((value, index) => index % 4 === 3 && value > 0)
      )
    })
  expect(painted).toBe(true)
})

test(CANDLE_VISIBILITY_TEST, async ({ page }) => {
  /*
   * Every other page is held on the track, so this one is mounted while it is not the one
   * on screen. Mounting it is not a reason to fetch: the chart is asked for when the page
   * is walked to, and not when it is merely parked.
   */
  await page.goto('/#/')
  await expect(livePage(page)).toHaveAttribute('data-page', 'dashboard')
  await settlePages(page)
  const candles: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('pair_candles')) candles.push(request.url())
  })

  await page.goto('/#/')
  await page.waitForTimeout(1500)
  expect(candles).toEqual([])

  await page.goto('/#/market')
  await expect.poll(() => candles.length).toBeGreaterThan(0)
  const shown = candles.length

  // And leaving the page must not fetch behind the operator's back either.
  await page.goto('/#/trades')
  await page.waitForTimeout(800)
  expect(candles.length).toBe(shown)
})

test('dragging across the chart scrubs the candle readout', async ({ page }) => {
  const readout = livePage(page).locator('.candles__summary')
  await expect(readout).toBeVisible()
  const before = await readout.innerText()

  const plot = livePage(page).locator('.candles__plot')
  const box = (await plot.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2, { steps: 12 })
  await page.mouse.up()

  const after = await readout.innerText()
  expect(after).not.toBe(before)
  await expect(readout).toContainText('开')
  await expect(readout).toContainText('收')
})

test('pair list switches the chart to another pair', async ({ page }) => {
  const selector = livePage(page).locator('.panel').first().locator('.filter-menu__button')
  await expect(selector).toContainText('OPEN/USDT')

  await selector.click()
  await page.locator('.v-overlay--active [role=option]', { hasText: 'BBB/USDT' }).click()
  await expect(selector).toContainText('BBB/USDT')
})

test('switching pairs requests candles for the pair now shown', async ({ page }) => {
  const requestedPairs: string[] = []
  page.on('request', (request) => {
    if (!request.url().includes('pair_candles')) return
    const body = request.postData()
    if (!body) return
    try {
      const payload = JSON.parse(body) as { pair?: string }
      if (payload.pair) requestedPairs.push(payload.pair)
    } catch {
      // The URL form is used by older dev proxies; this assertion only needs POST requests.
    }
  })

  const selector = livePage(page).locator('.panel').first().locator('.filter-menu__button')
  await selector.click()
  await page.locator('.v-overlay--active [role=option]', { hasText: 'BBB/USDT' }).click()
  await expect(selector).toContainText('BBB/USDT')
  await expect.poll(() => requestedPairs.at(-1)).toBe('BBB/USDT')
})

test('a position cost line updates without replacing the chart or changing its size', async ({
  page,
}) => {
  const plot = livePage(page).locator('.candles__plot')
  await expect(plot.locator('canvas').first()).toBeVisible()
  const before = await plot.boundingBox()
  await livePage(page).locator('.panel').first().locator('.filter-menu__button').click()
  await page.locator('.v-overlay--active [role=option]', { hasText: 'BBB/USDT' }).click()
  await expect(livePage(page).locator('.candles__summary')).toBeVisible()
  const after = await plot.boundingBox()
  expect(after?.width).toBe(before?.width)
  expect(after?.height).toBe(before?.height)
})

test('the pair popup stays inside a phone-width viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await livePage(page).locator('.panel').first().locator('.filter-menu__button').click()

  const [list, viewport] = await Promise.all([
    page.locator('.filter-menu__list').boundingBox(),
    page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
  ])
  expect(list).not.toBeNull()
  expect(list!.x).toBeGreaterThanOrEqual(0)
  expect(list!.x + list!.width).toBeLessThanOrEqual(viewport.width)
  expect(list!.y).toBeGreaterThanOrEqual(0)
  expect(list!.y + list!.height).toBeLessThanOrEqual(viewport.height)
})

test('whitelist has one three-column list on phone and desktop', async ({ page }) => {
  for (const width of [360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    await settlePages(page)
    const market = livePage(page)
    const list = market.getByRole('region', { name: '白名单' })
    await expect(list.locator('table')).toHaveCount(1)
    await expect(list.locator('ul')).toHaveCount(0)
    await expect(list.getByRole('columnheader')).toHaveText(['交易对', '持仓中', '累计已平仓盈亏'])
    for (const header of await list.getByRole('columnheader').all())
      await expect(header).toBeVisible()
    await expect(list.getByRole('cell', { name: 'OPEN/USDT', exact: true })).toHaveCount(1)
    await expect(market).not.toContainText('不含当前持仓')
    await expect(market).not.toContainText('最后分析')
    expect(await list.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
  }
})

for (const width of [360, 768, 1280]) {
  test(`switching pairs keeps the plot fixed at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await settlePages(page)
    const market = livePage(page)
    await expect(market.locator('.candles__plot canvas').first()).toBeVisible()
    const geometry = () =>
      market.evaluate((el) => {
        const plot = el.querySelector('.market__plot')!.getBoundingClientRect()
        return { x: plot.x, y: plot.y, width: plot.width, height: plot.height }
      })
    const before = await geometry()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/api/v1/pair_candles**', async (route) => {
      await gate
      await route.fallback()
    })
    try {
      await market.locator('.filter-menu__button').click()
      await page.locator('.v-overlay--active [role=option]', { hasText: 'BBB/USDT' }).click()
      await expect(market.locator('.v-skeleton-loader')).toBeVisible()
      await expect(market.locator('.market__legend')).toHaveCount(0)
      const pending = await geometry()
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        expect(Math.abs(pending[key] - before[key]), key).toBeLessThanOrEqual(1)
      }
      release()
      await expect(market.locator('.v-skeleton-loader')).toHaveCount(0)
      await expect(market.locator('.candles__plot canvas').first()).toBeVisible()
      const after = await geometry()
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        expect(Math.abs(after[key] - before[key]), key).toBeLessThanOrEqual(1)
      }
      await page.unroute('**/api/v1/pair_candles**')
      await page.clock.install()
      let failed = false
      await page.route('**/api/v1/pair_candles**', async (route) => {
        if (!failed) {
          failed = true
          await route.fulfill({
            status: 503,
            headers: { 'Access-Control-Allow-Origin': '*' },
            json: {},
          })
        } else {
          await route.fulfill({
            headers: { 'Access-Control-Allow-Origin': '*' },
            json: {
              strategy: 'TestStrategy',
              pair: 'AAA/USDT',
              timeframe: '5m',
              timeframe_ms: 300_000,
              columns: ['date', 'open', 'high', 'low', 'close', 'volume'],
              data: [],
              length: 0,
            },
          })
        }
      })
      await market.locator('.filter-menu__button').click()
      await page.locator('.v-overlay--active [role=option]', { hasText: 'AAA/USDT' }).click()
      const plot = market.locator('.market__plot')
      await expect(plot).toHaveAttribute('aria-busy', 'false')
      await expect(plot.locator('.v-skeleton-loader')).toBeVisible()
      const placeholder = plot.locator('.v-skeleton-loader__image')
      await expect
        .poll(async () => {
          const area = await plot.boundingBox()
          const bone = await placeholder.boundingBox()
          return (
            !!area &&
            !!bone &&
            Math.abs(area.width - bone.width) <= 1 &&
            Math.abs(area.height - bone.height) <= 1
          )
        })
        .toBe(true)
      await expect(plot).toHaveText('')
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        expect(Math.abs((await geometry())[key] - before[key]), key).toBeLessThanOrEqual(1)
      }
      await page.clock.fastForward(1_001)
      await expect(plot.locator('.v-skeleton-loader')).toBeVisible()
      await expect(plot).toHaveText('')
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        expect(Math.abs((await geometry())[key] - before[key]), key).toBeLessThanOrEqual(1)
      }
    } finally {
      release()
    }
  })
}

test('the chart zooms with the wheel and resets through its native scale controls', async ({
  page,
}) => {
  const plot = livePage(page).locator('.candles__plot')
  await expect(plot.locator('canvas').first()).toBeVisible()
  const slider = livePage(page).getByRole('slider')
  await expect(slider).toHaveAttribute('aria-valuemax', '0')
  await plot.hover({ position: { x: 100, y: 100 } })
  await page.mouse.wheel(0, -300)
  await expect
    .poll(async () => Number(await slider.getAttribute('aria-valuemax')))
    .toBeGreaterThan(0)
  await livePage(page).getByRole('button', { name: '复位' }).click()
  await expect(slider).toHaveAttribute('aria-valuemax', '0')
})

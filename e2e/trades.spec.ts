import { expect, test, type Page } from '@playwright/test'
import { connect, livePage, mockApi, segBlockMatches } from './support/fixtures'

const touchAt = (page: Page, type: 'touchstart' | 'touchmove' | 'touchend', x: number, y: number) =>
  page.evaluate(
    ({ type, x, y }) => {
      const target = document.querySelector('[data-swipe-tabs]') as Element
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
    { type, x, y },
  )

const trackX = (page: Page) =>
  page.locator('.page-track').evaluate((element) => {
    const transform = getComputedStyle(element).transform
    return transform === 'none' ? 0 : Math.round(new DOMMatrixReadOnly(transform).m41)
  })

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.goto('/#/trades')
  await connect(page)
  await expect(page.locator('.shell')).toBeVisible()
})

test('the filter block slides to the tab you pick', async ({ page }) => {
  const seg = livePage(page).locator('.seg')
  await expect.poll(() => segBlockMatches(seg)).toBe(true)
  // It travels rather than jumping.
  await expect(seg.locator('.seg__block')).toHaveCSS('transition-property', 'transform, width')

  await livePage(page).locator('.seg__item', { hasText: '全部交易' }).click()
  await expect(livePage(page).locator('.seg__item[aria-pressed="true"]')).toContainText('全部交易')
  await expect.poll(() => segBlockMatches(seg)).toBe(true)
})

test('“all trades” includes the open position, not just history', async ({ page }) => {
  const tabs = livePage(page).locator('.seg__item')
  await expect(tabs.nth(0)).toContainText('持仓中 1')
  await expect(tabs.nth(1)).toContainText('已平仓 4')
  await expect(tabs.nth(2)).toContainText('全部交易 5')

  await tabs.nth(2).click()
  const rows = livePage(page).locator('table tbody tr')
  await expect(rows).toHaveCount(5)
  await expect(rows.first()).toContainText('OPEN/USDT')

  await tabs.nth(1).click()
  await expect(rows).toHaveCount(4)
})

test('outcome filter narrows the list to profitable or losing trades', async ({ page }) => {
  const rows = livePage(page).locator('table tbody tr')
  // Defaults to "all", which merges the open position with the history.
  await expect(rows).toHaveCount(5)

  await livePage(page).locator('.filter-menu__button').first().click()
  await page.locator('.filter-menu__item', { hasText: '亏损' }).click()
  await expect(rows).toHaveCount(1)

  await livePage(page).locator('.filter-menu__button').first().click()
  await page.locator('.filter-menu__item', { hasText: '盈利' }).click()
  await expect(rows).toHaveCount(4)
})

test('search expands on demand and clears when collapsed', async ({ page }) => {
  const rows = livePage(page).locator('table tbody tr')
  await expect(livePage(page).locator('.search-toggle input')).toHaveCount(0)

  await livePage(page).locator('button[title="搜索"]').first().click()
  await livePage(page).locator('.search-toggle input').fill('BBB')
  await expect(rows).toHaveCount(1)

  await livePage(page).locator('.search-toggle__close').click()
  await expect(rows).toHaveCount(5)
})

test('the overview "view all" links open the matching trades tab', async ({ page }) => {
  const panel = (title: string) =>
    livePage(page)
      .locator('.panel')
      .filter({ has: page.locator('.panel__title', { hasText: title }) })
  const tabs = livePage(page).locator('.seg__item')

  await page.goto('/#/')
  await panel('当前持仓').locator('.link-btn').click()
  await expect(page).toHaveURL(/filter=open/)
  await expect(tabs.nth(0)).toHaveAttribute('aria-pressed', 'true')

  await page.goto('/#/')
  await panel('最近平仓').locator('.link-btn').click()
  await expect(page).toHaveURL(/filter=closed/)
  await expect(tabs.nth(1)).toHaveAttribute('aria-pressed', 'true')
})

test('the overview rows open the matching trades tab', async ({ page }) => {
  await page.goto('/#/')
  const row = livePage(page)
    .locator('.panel')
    .filter({ has: page.locator('.panel__title', { hasText: '当前持仓' }) })
    .locator('table tbody tr')
    .first()

  await row.click()
  await expect(page).toHaveURL(/filter=open/)
  await expect(page).toHaveURL(/trade=99/)
  await expect(livePage(page).locator('.seg__item').nth(0)).toHaveAttribute('aria-pressed', 'true')
})

test('the overview recently closed rows open the matching trades tab', async ({ page }) => {
  await page.goto('/#/')
  const row = livePage(page)
    .locator('.panel')
    .filter({ has: page.locator('.panel__title', { hasText: '最近平仓' }) })
    .locator('table tbody tr')
    .first()
  const pair = await row.locator('.table__pair .num').innerText()

  await row.click()
  await expect(page).toHaveURL(/filter=closed/)
  await expect(page).toHaveURL(/trade=\d+/)
  await expect(livePage(page).locator('.seg__item').nth(1)).toHaveAttribute('aria-pressed', 'true')
  // The drawer names the same pair the overview row shows.
  await expect(page.locator('.overlay--drawer .drawer')).toContainText(pair)
})

test('browser back closes the drawer on the same trades list', async ({ page }) => {
  await livePage(page).locator('table tbody tr').first().click()
  await expect(page.locator('.overlay--drawer .drawer')).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(/#\/trades(?:\?|$)/)
  await expect(page.locator('.overlay--drawer')).toHaveCount(0)
})

test('closing a deep-linked trade preserves its filter without adding history', async ({
  page,
}) => {
  await page.goto('/#/trades?filter=closed&trade=1')
  const drawer = page.locator('.overlay--drawer .drawer')
  await expect(drawer).toBeVisible()

  await drawer.locator('.drawer__head button').click()
  await expect(page).toHaveURL(/#\/trades\?filter=closed$/)
  await expect(page.locator('.overlay--drawer')).toHaveCount(0)

  await page.goBack()
  await expect(page).toHaveURL(/#\/trades(?:\?|$)/)
  await expect(page).not.toHaveURL(/trade=/)
})

test('an unresolved trade query clears the stale trade drawer', async ({ page }) => {
  await livePage(page).locator('table tbody tr').first().click()
  await expect(page.locator('.overlay--drawer .drawer')).toBeVisible()

  await page.evaluate(() => {
    window.location.hash = '/trades?trade=404'
  })
  await expect(page).toHaveURL(/trade=404/)
  await expect(page.locator('.overlay--drawer')).toHaveCount(0)
})

test('swipe changes adjacent filters and hands off at their edges', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 })
  const tabs = livePage(page).locator('.seg__item')

  const swipe = async (fromX: number, toX: number, fromY = 120, toY = 122) => {
    await touchAt(page, 'touchstart', fromX, fromY)
    await touchAt(page, 'touchmove', toX, toY)
    await touchAt(page, 'touchend', toX, toY)
  }

  await expect(tabs.nth(2)).toHaveAttribute('aria-pressed', 'true')
  await swipe(300, 296)
  await expect(tabs.nth(2)).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => trackX(page)).toBe(0)
  await swipe(300, 295, 120, 240)
  await expect(tabs.nth(2)).toHaveAttribute('aria-pressed', 'true')
  expect(await trackX(page)).toBe(0)
  await swipe(300, 120)
  await expect.poll(() => page.url()).toMatch(/#\/stats$/)

  await page.locator('.tabbar__item').nth(1).click()
  await expect.poll(() => page.url()).toMatch(/#\/trades(?:\?|$)/)
  await expect(tabs.nth(2)).toHaveAttribute('aria-pressed', 'true')

  await swipe(120, 300)
  await expect(tabs.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await swipe(300, 120)
  await expect(tabs.nth(2)).toHaveAttribute('aria-pressed', 'true')
  await swipe(120, 300)
  await expect(tabs.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await swipe(120, 300)
  await expect(tabs.nth(0)).toHaveAttribute('aria-pressed', 'true')
  await swipe(120, 300)
  await expect.poll(() => page.url()).toMatch(/#\/$/)
})

test('the last filter still hands off when the filter strip overflows', async ({ page }) => {
  await page.setViewportSize({ width: 240, height: 780 })
  const segment = livePage(page).locator('.seg[data-swipe-tabs]')
  await expect(segment).toHaveCSS('touch-action', 'pan-y')
  await expect
    .poll(() => segment.evaluate((element) => element.scrollWidth > element.clientWidth))
    .toBe(true)

  await touchAt(page, 'touchstart', 200, 120)
  await touchAt(page, 'touchmove', 80, 122)
  await touchAt(page, 'touchend', 80, 122)

  await expect.poll(() => page.url()).toMatch(/#\/stats$/)
})

test('a deep link opens its trade even when the page boots empty', async ({ page }) => {
  /*
   * Reloading is the case that used to break: the URL asks for a trade, the lists are still
   * empty, and the resolved trade never arrived afterwards. Closed trades are the interesting
   * ones — they come from `/trades`, not from the faster `/status` burst.
   */
  await page.goto('/#/trades?trade=1')
  await page.reload()
  await expect(page.locator('.overlay--drawer .drawer')).toBeVisible()
  await expect(page.locator('.overlay--drawer .drawer')).toContainText('AAA/USDT')
})

test('the filter travels between the URL and the tabs', async ({ page }) => {
  const tabs = livePage(page).locator('.seg__item')

  await page.goto('/#/trades?filter=closed')
  await expect(tabs.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(livePage(page).locator('table tbody tr')).toHaveCount(4)

  // "all" is the default, so it is dropped from the URL instead of written out.
  await tabs.nth(2).click()
  await expect(page).not.toHaveURL(/filter=/)
  await expect(livePage(page).locator('table tbody tr')).toHaveCount(5)
})

test('a trade drawer takes focus, parks the page, and gives both back on close', async ({
  page,
}) => {
  const shell = page.locator('.shell')
  expect(await shell.evaluate((el) => el.hasAttribute('inert'))).toBe(false)

  await livePage(page).locator('table tbody tr').first().click()
  const drawer = page.locator('.overlay--drawer .drawer')
  await expect(drawer).toBeVisible()
  // Tab must start inside the dialog, not behind it.
  await expect(drawer).toBeFocused()
  expect(await shell.evaluate((el) => el.hasAttribute('inert'))).toBe(true)

  await page.keyboard.press('Escape')
  await expect(page.locator('.overlay--drawer')).toHaveCount(0)
  expect(await shell.evaluate((el) => el.hasAttribute('inert'))).toBe(false)
})

test('force exit requires the exact pair and Escape only closes its confirmation', async ({
  page,
}) => {
  await page.goto('/#/settings')
  await livePage(page).getByRole('button', { name: '我了解风险，开启控制功能' }).click()

  await page.goto('/#/trades?filter=open&trade=99')
  const drawer = page.locator('.overlay--drawer .drawer')
  await expect(drawer).toBeVisible()

  const titleId = await drawer.getAttribute('aria-labelledby')
  expect(titleId).toMatch(/^trade-detail-title-/)
  await expect(page.locator(`#${titleId}`)).toHaveText('OPEN/USDT')

  const forceExit = drawer.getByRole('button', { name: '平仓' })
  const confirmation = page.locator('.overlay[role="dialog"]:not(.overlay--drawer)')
  await forceExit.click()
  await expect(confirmation).toBeVisible()
  await expect(confirmation.locator('.dialog')).toBeFocused()

  const firstFocusable = confirmation.getByRole('button').first()
  const lastFocusable = confirmation.getByRole('button', { name: '取消' })
  await page.keyboard.press('Shift+Tab')
  await expect(lastFocusable).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(firstFocusable).toBeFocused()

  const input = confirmation.locator('input')
  const confirm = confirmation.getByRole('button', { name: '平仓' })
  await input.fill('WRONG/USDT')
  await expect(confirm).toBeDisabled()

  await page.keyboard.press('Escape')
  await expect(confirmation).toHaveCount(0)
  await expect(drawer).toBeVisible()

  await forceExit.click()
  await confirmation.locator('input').fill('OPEN/USDT')
  await expect(confirmation.getByRole('button', { name: '平仓' })).toBeEnabled()
  await confirmation.getByRole('button', { name: '平仓' }).click()
  await expect(confirmation).toHaveCount(0)
  await expect(drawer).toBeVisible()
  await expect(page.locator('.toast', { hasText: '指令已发送' })).toBeVisible()
})

test('back and forward around an open force-exit confirmation restores focus safely', async ({
  page,
}) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (error) => pageErrors.push(error))

  await page.goto('/#/settings')
  await livePage(page).getByRole('button', { name: '我了解风险，开启控制功能' }).click()
  await page.goto('/#/trades')
  await livePage(page).locator('table tbody tr', { hasText: 'OPEN/USDT' }).click()

  const drawer = page.locator('.overlay--drawer .drawer')
  const confirmation = page.locator('.overlay[role="dialog"]:not(.overlay--drawer)')
  await drawer.getByRole('button', { name: '平仓' }).click()
  await expect(confirmation).toBeVisible()

  await page.goBack()
  await expect(drawer).toHaveCount(0)
  await expect(confirmation).toBeVisible()
  await page.goForward()
  await expect(drawer).toBeVisible()
  await page.goBack()
  await expect(drawer).toHaveCount(0)

  await confirmation.getByRole('button', { name: '取消' }).click()
  await expect(confirmation).toHaveCount(0)
  await expect(page.locator('.shell')).not.toHaveAttribute('inert', '')
  expect(pageErrors).toEqual([])
})

test('trade details scroll inside the drawer without moving the page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 480 })
  await page.goto('/#/trades?trade=1')

  const body = page.locator('.overlay--drawer .drawer__body')
  await expect
    .poll(() => body.evaluate((element) => element.scrollHeight > element.clientHeight))
    .toBe(true)
  expect(await body.evaluate((element) => getComputedStyle(element).overscrollBehaviorY)).toBe(
    'contain',
  )

  await body.evaluate((element) => {
    element.scrollTop = 0
  })
  await body.hover()
  await page.mouse.wheel(0, 320)
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)

  const bodyBottom = await body.evaluate((element) => element.scrollHeight - element.clientHeight)
  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await body.hover()
  await page.mouse.wheel(0, 320)
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBe(bodyBottom)
  expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(0)
})

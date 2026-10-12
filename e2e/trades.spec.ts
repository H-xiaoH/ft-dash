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

test('an unresolved trade query clears the stale trade drawer', async ({ page }) => {
  await livePage(page).locator('table tbody tr').first().click()
  await expect(page.locator('.overlay--drawer .drawer')).toBeVisible()

  await page.evaluate(() => {
    window.location.hash = '/trades?trade=404'
  })
  await expect(page).toHaveURL(/trade=404/)
  await expect(page.locator('.overlay--drawer')).toHaveCount(0)
})

test('swipe changes adjacent trade filters without dragging the page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 })
  const tabs = livePage(page).locator('.seg__item')

  const swipe = async (fromX: number, toX: number, fromY = 120, toY = 122) => {
    await touchAt(page, 'touchstart', fromX, fromY)
    await touchAt(page, 'touchmove', toX, toY)
    expect(await trackX(page)).toBe(0)
    await touchAt(page, 'touchend', toX, toY)
  }

  await expect(tabs.nth(2)).toHaveAttribute('aria-pressed', 'true')
  await swipe(300, 270)
  await expect(tabs.nth(2)).toHaveAttribute('aria-pressed', 'true')
  await swipe(300, 260, 120, 240)
  await expect(tabs.nth(2)).toHaveAttribute('aria-pressed', 'true')
  await swipe(300, 120)
  await expect(tabs.nth(2)).toHaveAttribute('aria-pressed', 'true')
  await swipe(120, 300)
  await expect(tabs.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await swipe(120, 300)
  await expect(tabs.nth(0)).toHaveAttribute('aria-pressed', 'true')
  await swipe(120, 300)
  await expect(tabs.nth(0)).toHaveAttribute('aria-pressed', 'true')
  await swipe(300, 120)
  await expect(tabs.nth(1)).toHaveAttribute('aria-pressed', 'true')
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

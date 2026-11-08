import { expect, test, type Page } from '@playwright/test'
import { settlePages } from './support/gestures'
import { connect, enableWriteAccess, livePage, mockApi, selectionMatches } from './support/fixtures'

const TRADE_COUNTS_TEST = 'trade tab counts describe the same loaded trades as the list'

const touchAt = async (
  page: Page,
  type: 'touchstart' | 'touchmove' | 'touchend',
  x: number,
  y: number,
  selector: string,
) => {
  await page.locator(selector).first().waitFor()
  if (type === 'touchstart') {
    await page.mouse.move(x, y)
    await page.mouse.down()
  } else if (type === 'touchmove') await page.mouse.move(x, y, { steps: 12 })
  else await page.mouse.up()
}

test.beforeEach(async ({ page }, testInfo) => {
  await mockApi(page, testInfo.title === TRADE_COUNTS_TEST ? { tradeCount: 6 } : undefined)
  await page.goto('/#/trades')
  await connect(page)
  await expect(page.locator('.shell')).toBeVisible()
  await settlePages(page)
})

test(TRADE_COUNTS_TEST, async ({ page }) => {
  const tabs = livePage(page).locator('.v-btn-toggle .v-btn')
  await expect(tabs.nth(0)).toContainText('持仓中 1')
  await expect(tabs.nth(1)).toContainText('已平仓 6')
  await expect(tabs.nth(2)).toContainText('全部交易 7')
  await tabs.nth(1).click()
  await expect(livePage(page).locator('table tbody tr')).toHaveCount(6)
})

test('the trade pair button opens its details from the keyboard', async ({ page }) => {
  const pair = livePage(page).getByRole('button', { name: 'OPEN/USDT', exact: true })
  await expect(pair).toBeVisible()
  await pair.focus()
  await expect(pair).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('.trade-dialog .trade-detail')).toContainText('OPEN/USDT')
})

test('switching trade filters transitions the result and announces its scope', async ({ page }) => {
  const tabs = livePage(page).locator('.v-btn-toggle .v-btn')
  const status = livePage(page).locator('[data-filter-status]')

  await expect(status).toContainText('全部交易')
  await expect(livePage(page).locator('.v-btn-toggle .v-btn--active')).toHaveCount(1)
  await expect
    .poll(() => selectionMatches(livePage(page).locator('.v-btn-toggle').first()))
    .toBe(true)
  await expect(livePage(page).locator('[data-swipe-tabs]')).toHaveCount(0)
  await page.evaluate(() => {
    const frames: { opacity: number; translateY: number }[] = []
    ;(
      window as unknown as {
        __tradeFilterFrames?: { opacity: number; translateY: number }[]
      }
    ).__tradeFilterFrames = frames
    const started = performance.now()
    const tick = () => {
      const content = document.querySelector('[data-filter-content]')
      if (content) {
        const style = getComputedStyle(content)
        const transform = style.transform
        frames.push({
          opacity: content.getBoundingClientRect().height,
          translateY: transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42,
        })
      }
      if (performance.now() - started < 700) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  await tabs.nth(1).click()
  await expect(tabs.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect
    .poll(() => selectionMatches(livePage(page).locator('.v-btn-toggle').first()))
    .toBe(true)
  await expect(livePage(page).locator('table tbody tr')).toHaveCount(4)
  await expect(status).toHaveText('已平仓，显示 4 笔交易。')
  await page.waitForTimeout(400)

  const frames = await page.evaluate(
    () =>
      (window as unknown as { __tradeFilterFrames?: { opacity: number; translateY: number }[] })
        .__tradeFilterFrames ?? [],
  )
  expect(new Set(frames.map(({ opacity }) => Math.round(opacity))).size > 1).toBe(true)
})

test('a horizontal swipe on trade results stays a page navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 })
  await page.goto('/#/trades?filter=closed')

  const tabs = livePage(page).locator('.v-btn-toggle .v-btn')
  const cardSelector = '.page-scroll:not([inert]) tbody tr'
  await expect(tabs.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator(cardSelector).first()).toBeVisible()

  await touchAt(page, 'touchstart', 300, 420, cardSelector)
  await touchAt(page, 'touchmove', 120, 422, cardSelector)
  await touchAt(page, 'touchend', 120, 422, cardSelector)

  await expect.poll(() => page.url()).toMatch(/#\/stats$/)
})

test('“all trades” includes the open position, not just history', async ({ page }) => {
  const tabs = livePage(page).locator('.v-btn-toggle .v-btn')
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
  await page.locator('.v-overlay--active [role=option]', { hasText: '亏损' }).click()
  await expect(rows).toHaveCount(1)
  await expect(page.locator('.filter-menu__list')).toBeHidden()

  await livePage(page).locator('.filter-menu__button').first().click()
  await page.locator('.v-overlay--active [role=option]', { hasText: '盈利' }).click()
  await expect(rows).toHaveCount(4)
})

test('trade sorting uses the same toolbar on phone and desktop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const rows = livePage(page).locator('tbody tr')
  const firstPair = () => rows.first().locator('.table__pair > .num').textContent()

  // Default order is newest first, so the still-open position leads.
  await expect(rows).toHaveCount(5)
  expect(await firstPair()).toBe('OPEN/USDT')

  const sortMenu = livePage(page).locator('.filter-menu__button', { hasText: '排序' })
  // The button names the action, not the state it is already in.
  const direction = livePage(page).getByRole('button', { name: '改为升序' })
  await expect(direction).toBeVisible()
  expect(await direction.evaluate((el) => getComputedStyle(el, '::before').content)).toBe('none')
  await expect(sortMenu).toHaveCSS('border-right-width', '0px')
  await expect(livePage(page).locator('.sort-group .v-divider')).toHaveCSS(
    'border-right-width',
    '1px',
  )

  // The toolbar carries five controls; it has to fit even a 360px phone.
  const head = livePage(page).locator('.panel__head').first()
  const overflow = () => head.evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(await overflow()).toBeLessThanOrEqual(1)
  await page.setViewportSize({ width: 360, height: 844 })
  expect(await overflow()).toBeLessThanOrEqual(1)
  await page.setViewportSize({ width: 390, height: 844 })

  // A new field starts at its own natural direction.
  await sortMenu.click()
  await page.locator('.v-overlay--active [role=option]', { hasText: '盈亏' }).click()
  expect(await firstPair()).toBe('AAA/USDT')
  await expect(rows.first()).toContainText('0.8000')
  await expect(rows.last()).toContainText('-0.2000')

  // The arrow flips the order without reopening the menu.
  await livePage(page).getByRole('button', { name: '改为升序' }).click()
  await expect(livePage(page).getByRole('button', { name: '改为降序' })).toBeVisible()
  await expect(rows.first()).toContainText('-0.2000')
  expect(await firstPair()).toBe('AAA/USDT')

  // The foldable-width layout shows the compact table and keeps the same ordering.
  await page.setViewportSize({ width: 800, height: 844 })
  await expect(sortMenu).toBeVisible()
  await expect(livePage(page).locator('tbody tr').first()).toBeVisible()

  // The desktop table uses the same toolbar and plain headers.
  await page.setViewportSize({ width: 1280, height: 900 })
  const firstRow = livePage(page).locator('table tbody tr').first()
  await expect(firstRow).toBeVisible()
  await expect(firstRow).toContainText('-0.2000')
  await expect(sortMenu).toBeVisible()
  await expect(livePage(page).getByRole('button', { name: '改为降序' })).toBeVisible()
  await expect(livePage(page).locator('thead button')).toHaveCount(0)
})

test('search expands on demand and clears when collapsed', async ({ page }) => {
  const rows = livePage(page).locator('table tbody tr')
  await expect(livePage(page).locator('.search-toggle input')).toHaveCount(0)

  await livePage(page).locator('button[title="搜索"]').first().click()
  await livePage(page).locator('.search-toggle input').fill('BBB')
  await expect(rows).toHaveCount(1)

  await livePage(page).locator('.v-field__clearable [role=button]').click()
  await expect(rows).toHaveCount(5)
})

test('the overview "view all" links open the matching trades tab', async ({ page }) => {
  const panel = (title: string) =>
    livePage(page)
      .locator('.panel')
      .filter({ has: page.locator('.panel__title', { hasText: title }) })
  const tabs = livePage(page).locator('.v-btn-toggle .v-btn')

  await page.goto('/#/')
  await panel('当前持仓').locator('.v-btn', { hasText: '查看全部' }).click()
  await expect(page).toHaveURL(/filter=open/)
  await expect(tabs.nth(0)).toHaveAttribute('aria-pressed', 'true')

  await page.goto('/#/')
  await panel('最近平仓').locator('.v-btn', { hasText: '查看全部' }).click()
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
  await expect(livePage(page).locator('.v-btn-toggle .v-btn').nth(0)).toHaveAttribute(
    'aria-pressed',
    'true',
  )
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
  await expect(livePage(page).locator('.v-btn-toggle .v-btn').nth(1)).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  // The drawer names the same pair the overview row shows.
  await expect(page.locator('.trade-dialog .trade-detail')).toContainText(pair)
})

test('opening an overview trade animates the detail drawer', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.goto('/#/')
  await expect(livePage(page).locator('table tbody tr').first()).toBeVisible()

  await page.evaluate(() => {
    const frames: number[] = []
    ;(window as unknown as { __drawerTravel?: number[] }).__drawerTravel = frames
    let started = 0
    const tick = () => {
      const drawer = document.querySelector('.trade-dialog .v-overlay__content')
      if (drawer) {
        started ||= performance.now()
        const transform = getComputedStyle(drawer).transform
        const offset =
          transform === 'none'
            ? 0
            : (() => {
                const matrix = new DOMMatrixReadOnly(transform)
                return Math.round(Math.abs(matrix.m41) + Math.abs(matrix.m42))
              })()
        frames.push(offset)
      }
      if (!started || performance.now() - started < 500) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  await livePage(page)
    .locator('.panel')
    .filter({ has: page.locator('.panel__title', { hasText: '当前持仓' }) })
    .locator('table tbody tr')
    .first()
    .click()
  await expect(page.locator('.trade-dialog .trade-detail')).toBeVisible()
  await page.waitForTimeout(350)

  const travel = await page.evaluate(
    () => (window as unknown as { __drawerTravel?: number[] }).__drawerTravel ?? [],
  )
  expect(travel.some((offset) => offset > 10)).toBe(true)
})

test('browser back closes the drawer on the same trades list', async ({ page }) => {
  await livePage(page).locator('table tbody tr').first().click()
  await expect(page.locator('.trade-dialog .trade-detail')).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(/#\/trades(?:\?|$)/)
  await expect(page.locator('.trade-dialog')).toHaveCount(0)
})

test('closing a deep-linked trade preserves its filter without adding history', async ({
  page,
}) => {
  await page.goto('/#/trades?filter=closed&trade=1')
  const drawer = page.locator('.trade-dialog .trade-detail')
  await expect(drawer).toBeVisible()

  await drawer.locator('.v-card-item button').click()
  await expect(page).toHaveURL(/#\/trades\?filter=closed$/)
  await expect(page.locator('.trade-dialog')).toHaveCount(0)

  await page.goBack()
  await expect(page).toHaveURL(/#\/trades(?:\?|$)/)
  await expect(page).not.toHaveURL(/trade=/)
})

test('an unresolved trade query clears the stale trade drawer', async ({ page }) => {
  await livePage(page).locator('table tbody tr').first().click()
  await expect(page.locator('.trade-dialog .trade-detail')).toBeVisible()

  await page.evaluate(() => {
    window.location.hash = '/trades?trade=404'
  })
  await expect(page).toHaveURL(/trade=404/)
  await expect(page.locator('.trade-dialog')).toHaveCount(0)
})

test('a deep link opens its trade even when the page boots empty', async ({ page }) => {
  /*
   * Reloading is the case that used to break: the URL asks for a trade, the lists are still
   * empty, and the resolved trade never arrived afterwards. Closed trades are the interesting
   * ones — they come from `/trades`, not from the faster `/status` burst.
   */
  await page.goto('/#/trades?trade=1')
  await page.reload()
  await expect(page.locator('.trade-dialog .trade-detail')).toBeVisible()
  await expect(page.locator('.trade-dialog .trade-detail')).toContainText('AAA/USDT')
})

test('the filter travels between the URL and the tabs', async ({ page }) => {
  const tabs = livePage(page).locator('.v-btn-toggle .v-btn')

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
  const drawer = page.locator('.trade-dialog .trade-detail')
  await expect(drawer).toBeVisible()
  // Tab must start inside the dialog, not behind it.
  await expect
    .poll(() => page.getByRole('dialog').evaluate((el) => el.contains(document.activeElement)))
    .toBe(true)
  await page.keyboard.press('Tab')
  expect(await page.getByRole('dialog').evaluate((el) => el.contains(document.activeElement))).toBe(
    true,
  )

  await page.keyboard.press('Escape')
  await expect(page.locator('.trade-dialog')).toHaveCount(0)
  expect(await shell.evaluate((el) => el.hasAttribute('inert'))).toBe(false)
})

for (const width of [390, 1280]) {
  test(`trade detail retains its content during departure at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 924 })
    await livePage(page).locator('table tbody tr').first().click()
    const detail = page.locator('.trade-dialog .trade-detail')
    await expect(detail).toBeVisible()
    await expect(page.locator('.trade-dialog [class*="-enter-active"]')).toHaveCount(0)
    const pair = await detail.locator('.text-h6').textContent()
    await detail.getByRole('button', { name: '关闭', exact: true }).click()
    const leaving = page.locator('.trade-dialog .v-overlay__content[class*="-leave-active"]')
    await expect(leaving.locator('.trade-detail')).toContainText(pair!)
    await expect(page.locator('.trade-dialog')).toHaveCount(0)
  })
}

test('force exit requires the exact pair and Escape only closes its confirmation', async ({
  page,
}) => {
  await enableWriteAccess(page)

  await page.goto('/#/trades?filter=open&trade=99')
  const drawer = page.locator('.trade-dialog .trade-detail')
  await expect(drawer).toBeVisible()

  const titleId = await page.getByRole('dialog').getAttribute('aria-labelledby')
  expect(titleId).toBeTruthy()
  await expect(page.locator(`#${titleId}`)).toHaveText('OPEN/USDT')

  const forceExit = drawer.getByRole('button', { name: '平仓' })
  const confirmation = page.locator('.v-dialog[role="dialog"]:not(.trade-dialog)')
  await forceExit.click()
  await expect(confirmation).toBeVisible()
  await expect
    .poll(() => confirmation.evaluate((el) => el.contains(document.activeElement)))
    .toBe(true)
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab')
    expect(await confirmation.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  }

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
  await expect(
    page.locator('.v-snackbar--active .v-snackbar__wrapper', { hasText: '指令已发送' }),
  ).toBeVisible()
})

test('back and forward around an open force-exit confirmation restores focus safely', async ({
  page,
}) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (error) => pageErrors.push(error))

  await enableWriteAccess(page)
  await page.goto('/#/trades')
  await livePage(page).locator('table tbody tr', { hasText: 'OPEN/USDT' }).click()

  const drawer = page.locator('.trade-dialog .trade-detail')
  const confirmation = page.locator('.v-dialog[role="dialog"]:not(.trade-dialog)')
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

  const body = page.locator('.trade-dialog .trade-detail > .v-card-text')
  await expect
    .poll(() => body.evaluate((element) => element.scrollHeight > element.clientHeight))
    .toBe(true)
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

test('CSV export follows the table sort in both directions', async ({ page }, testInfo) => {
  const menu = livePage(page).locator('.sort-group .filter-menu__button')
  await menu.click()
  await page.getByRole('option', { name: '盈亏', exact: true }).click()
  await expect(livePage(page).locator('tbody tr').first()).toContainText('0.8000')
  const exportIds = async (name: string) => {
    const pending = page.waitForEvent('download')
    await livePage(page).getByRole('button', { name: '导出 CSV', exact: true }).click()
    const path = testInfo.outputPath(name)
    await (await pending).saveAs(path)
    const { readFile } = await import('node:fs/promises')
    const csv = await readFile(path, 'utf8')
    return csv
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .map((row) => Number(row.split(',')[0]))
  }
  expect(await exportIds('descending.csv')).toEqual([1, 3, 4, 99, 2])
  await livePage(page).getByRole('button', { name: '改为升序', exact: true }).click()
  await expect(livePage(page).locator('tbody tr').first()).toContainText('-0.2000')
  expect(await exportIds('ascending.csv')).toEqual([2, 99, 4, 3, 1])
})

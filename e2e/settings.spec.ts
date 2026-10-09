import { expect, test, type Page } from '@playwright/test'
import {
  API_BASE,
  SECOND_BASE,
  connect,
  livePage,
  mockApi,
  segBlockMatches,
} from './support/fixtures'

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await connect(page)
  await expect(page.locator('.shell')).toBeVisible()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.locator('.rail__item').nth(6).click()
  await expect(livePage(page).locator('.settings__columns')).toBeVisible()
})

const panel = (page: Page, title: string) =>
  livePage(page)
    .locator('.panel')
    .filter({ has: page.locator('.panel__title', { hasText: title }) })

/** Distance between two boxes, measured from the bottom of one to the top of the next. */
const gapBetween = async (above: Awaited<ReturnType<typeof panel>>, below: typeof above) => {
  const [a, b] = await Promise.all([above.boundingBox(), below.boundingBox()])
  return Math.round(b!.y - (a!.y + a!.height))
}

test('the stream-auth block slides to the choice you pick', async ({ page }) => {
  const seg = livePage(page).locator('.seg')
  await expect.poll(() => segBlockMatches(seg)).toBe(true)

  // The labels here differ in width — `JWT` next to `ws_token` — which is why the block is
  // measured rather than computed from the item count.
  await seg.locator('.seg__item', { hasText: 'ws_token' }).click()
  await expect(seg.locator('.seg__item[aria-pressed="true"]')).toContainText('ws_token')
  await expect.poll(() => segBlockMatches(seg)).toBe(true)
})

test('toasts take the corner on wide screens and the middle on phones', async ({ page }) => {
  await livePage(page).locator('button', { hasText: '重试实时推送' }).click()
  const toast = page.locator('.toast').first()
  await expect(toast).toBeVisible()

  // 1440 wide in this spec: the stack hugs the right edge instead of the centre.
  const wide = (await toast.boundingBox())!
  expect(Math.round(wide.x + wide.width)).toBeGreaterThan(1440 - 40)

  await page.setViewportSize({ width: 390, height: 780 })
  const narrow = (await toast.boundingBox())!
  expect(Math.round(narrow.x)).toBeLessThan(390 / 2)
  expect(Math.round(narrow.x + narrow.width)).toBeGreaterThan(390 / 2)
})

test('the cards form two even columns with an even gap before the full-width card', async ({
  page,
}) => {
  const columns = livePage(page).locator('.settings__col')
  await expect(columns).toHaveCount(2)
  /*
   * Measured through Playwright, which reads null for a box it cannot see — a held page's
   * copy of these columns is one such box. Both waits are on the live page, so a measure
   * can neither catch the swap mid-flight nor an unlaid-out column.
   */
  await expect(columns.nth(0)).toBeVisible()
  await expect(columns.nth(1)).toBeVisible()

  // Both stacks start on the same line; neither is pushed down by balancing.
  const [left, right] = await Promise.all([
    columns.nth(0).boundingBox(),
    columns.nth(1).boundingBox(),
  ])
  expect(Math.round(left!.y)).toBe(Math.round(right!.y))

  // The gap inside a column and the gap before the full-width card are the same.
  const insideColumn = await gapBetween(panel(page, '语言'), panel(page, '推送'))
  const beforeData = await gapBetween(
    livePage(page).locator('.settings__columns'),
    panel(page, '本机数据'),
  )
  expect(insideColumn).toBe(16)
  expect(beforeData).toBe(16)

  // The local-data card spans the whole width, outside the two stacks.
  expect(Math.round((await panel(page, '本机数据').boundingBox())!.width)).toBe(
    Math.round((await livePage(page).locator('.settings__columns').boundingBox())!.width),
  )
})

test('enabling bot controls removes the acknowledgement button', async ({ page }) => {
  const danger = panel(page, '机器人控制')
  const enable = danger.locator('button', { hasText: '开启控制功能' })
  const disable = danger.locator('button', { hasText: '关闭控制功能' })

  await expect(danger.locator('.chip')).toHaveText('已关闭')
  await expect(disable).toHaveCount(0)

  await enable.click()
  await expect(danger.locator('.chip')).toHaveText('已开启')
  await expect(enable).toHaveCount(0)
  await expect(disable).toBeVisible()

  // Saving confirmation: the toast counts its own life down, so the bar must shrink.
  const timer = page.locator('.toast__timer').first()
  await expect(timer).toBeVisible()
  const start = (await timer.boundingBox())!.width
  await page.waitForTimeout(1200)
  expect((await timer.boundingBox())!.width).toBeLessThan(start)

  // Turning them back off returns the acknowledgement flow.
  await disable.click()
  await expect(enable).toBeVisible()
  await expect(disable).toHaveCount(0)

  // Dismissing animates out: the toast stays on screen for its leave, then goes.
  await page.locator('.toast').first().click()
  await expect(page.locator('.toast')).toHaveCount(1)
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 3000 })
})

test('the password stays out of localStorage unless you ask for it', async ({ page }) => {
  // The connect helper never touches the "remember" toggle, so this is the default path.
  const stored = await page.evaluate(() => ({
    local: localStorage.getItem('ftdash.bots.v1'),
    session: sessionStorage.getItem('ftdash.bots.session.v1'),
  }))

  // The bot list itself is persisted; only the password is held back.
  expect(stored.local).toContain('api.example.test')
  expect(stored.local).not.toContain('secret')
  expect(stored.session).toContain('tester')
  expect(stored.session).toContain('secret')
})

test('carries the default bot name over from the connect form', async ({ page }) => {
  const bots = livePage(page).locator('.bots__row')
  await expect(bots).toHaveCount(1)
  // The connect form never asked for a name, so the bot is named after its username.
  await expect(bots.first()).toContainText('tester')
  await expect(bots.first()).toContainText('当前')
})

test('adding a second bot and switching moves the dashboard to it', async ({ page }) => {
  // The second origin only exists for this test.
  await mockApi(page, { secondBot: true })
  const bots = livePage(page).locator('.bots__row')
  await livePage(page).locator('button', { hasText: '添加机器人' }).click()
  const editor = livePage(page).locator('.bots__editor')
  await expect(editor.getByLabel('机器人名称')).toHaveAttribute('placeholder', '可选')
  await editor.locator('input[inputmode="url"]').fill(SECOND_BASE)
  await editor.locator('input[autocomplete="username"]').fill('second')
  await editor
    .locator('input[type="password"][autocomplete="current-password"]')
    .fill('second-secret')
  await editor.locator('button[type="submit"]').click()

  await expect(bots).toHaveCount(2)
  // Adding does not steal the selection: the first bot is still the one in use.
  await expect(bots.first()).toContainText('当前')

  await bots.nth(1).locator('button', { hasText: '切换' }).click()
  await expect(bots.nth(1)).toContainText('当前')
  await expect(page.locator('.toast', { hasText: '已切换' })).toHaveCount(1)

  // The system page reports the endpoint the dashboard is now polling.
  await page.locator('.rail__item').nth(5).click()
  await expect(livePage(page).locator('.panel', { hasText: '连接状态' })).toContainText(SECOND_BASE)

  // Switching back restores the original bot and its address.
  await page.locator('.rail__item').nth(6).click()
  await bots.first().locator('button', { hasText: '切换' }).click()
  await page.locator('.rail__item').nth(5).click()
  await expect(livePage(page).locator('.panel', { hasText: '连接状态' })).toContainText(API_BASE)
})

test('switching bots never bounces through the connect screen', async ({ page }) => {
  await mockApi(page, { secondBot: true })
  await livePage(page).locator('button', { hasText: '添加机器人' }).click()
  const editor = livePage(page).locator('.bots__editor')
  await editor.getByLabel('名称').fill('second')
  await editor.getByLabel('API 地址').fill(SECOND_BASE)
  await editor.getByLabel('用户名').fill('second')
  await editor.getByLabel('密码', { exact: true }).fill('second-secret')
  await editor.locator('button[type="submit"]').click()
  await expect(livePage(page).locator('.bots__row')).toHaveCount(2)

  /*
   * The defect was a flash, so sample the DOM instead of asserting at one instant: while
   * the new bot connected, the shell was replaced by the connect form — whose red banner
   * is titled "connection failed" — and stayed there if the attempt failed.
   */
  await page.evaluate(() => {
    const states: { shell: boolean; connect: boolean; failed: boolean }[] = []
    ;(window as unknown as { __states?: unknown }).__states = states
    const timer = setInterval(() => {
      states.push({
        shell: Boolean(document.querySelector('.shell')),
        connect: Boolean(document.querySelector('.connect__card')),
        failed: [...document.querySelectorAll('.banner')].some((node) =>
          (node.textContent ?? '').includes('连接失败'),
        ),
      })
    }, 10)
    ;(window as unknown as { __stop?: () => void }).__stop = () => clearInterval(timer)
  })

  await livePage(page).locator('.bots__row').nth(1).locator('button', { hasText: '切换' }).click()
  await expect(page.locator('.toast', { hasText: '已切换' })).toHaveCount(1)
  await page.waitForTimeout(600)

  const states = await page.evaluate(() => {
    ;(window as unknown as { __stop?: () => void }).__stop?.()
    const seen =
      (window as unknown as { __states?: { shell: boolean; connect: boolean; failed: boolean }[] })
        .__states ?? []
    return {
      samples: seen.length,
      shells: seen.filter((state) => state.shell).length,
      connects: seen.filter((state) => state.connect).length,
      failures: seen.filter((state) => state.failed).length,
    }
  })
  // Enough samples that a multi-frame flash could not hide between them.
  expect(states.samples).toBeGreaterThan(20)
  // The switch keeps the shell up the whole time; it never falls back to the connect form
  // (that only happens when the picked bot genuinely cannot be reached).
  expect(states.shells, 'shell was replaced during the switch').toBe(states.samples)
  expect(states.connects, 'connect screen flashed during the switch').toBe(0)
  expect(states.failures, 'connection failed banner flashed during the switch').toBe(0)
})

test('retrying the live stream acknowledges the click', async ({ page }) => {
  await livePage(page).locator('button', { hasText: '重试实时推送' }).click()
  // Filtered: the "bot added" toast from the connect step may still be on screen.
  await expect(page.locator('.toast', { hasText: '正在重连实时推送' })).toHaveCount(1)
})

test('the settings language picker offers following the system', async ({ page }) => {
  await expect(livePage(page).locator('.panel__title', { hasText: '语言' })).toHaveCount(1)
  // Located by structure, not by the panel title: switching the language renames the title.
  const trigger = livePage(page).locator('.settings__columns .filter-menu__button')
  // Same control as the connect screen, but the panel is already titled — no emoji here.
  await expect(trigger).not.toContainText('🌐')
  await expect(trigger).toContainText('跟随系统')

  await trigger.click()
  await expect(page.locator('.filter-menu__item')).toHaveText(['跟随系统', '简体中文', 'English'])
  await expect(page.locator('.filter-menu__item.is-active')).toHaveText('跟随系统')
  await page.locator('.filter-menu__item', { hasText: 'English' }).click()
  await expect(trigger).toContainText('English')
})

test('the language popup stays inside a phone-width viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  const trigger = livePage(page).locator('.settings__columns .filter-menu__button')
  await trigger.click()

  const [list, viewport] = await Promise.all([
    page.locator('.filter-menu__list').boundingBox(),
    page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
  ])
  expect(list).not.toBeNull()
  // The whole panel has to be reachable: it used to hang off the left edge of a phone.
  expect(list!.x).toBeGreaterThanOrEqual(0)
  expect(list!.x + list!.width).toBeLessThanOrEqual(viewport.width)
  expect(list!.y).toBeGreaterThanOrEqual(0)
  expect(list!.y + list!.height).toBeLessThanOrEqual(viewport.height)
})

test('the language popup travels with its trigger while the page scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 640 })
  const trigger = livePage(page).locator('.settings__columns .filter-menu__button')
  const list = page.locator('.filter-menu__list')
  await trigger.click()
  await list.waitFor()

  /** Distance from the trigger's box to the popup's — constant while it stays attached. */
  const offset = async () => {
    const [t, l] = await Promise.all([trigger.boundingBox(), list.boundingBox()])
    return Math.round(l!.y - t!.y)
  }
  const before = await offset()

  await page.evaluate(() => window.scrollBy(0, 160))
  // The popup used to be placed once: it stayed put and the trigger slid away from it.
  await expect.poll(async () => Math.abs((await offset()) - before)).toBeLessThanOrEqual(2)
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100)
})

import { expect, test, type Page } from '@playwright/test'
import { API_BASE, SECOND_BASE, connect, mockApi } from './support/fixtures'

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await connect(page)
  await expect(page.locator('.shell')).toBeVisible()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.locator('.rail__item').nth(6).click()
  await expect(page.locator('.settings__columns')).toBeVisible()
})

const panel = (page: Page, title: string) =>
  page.locator('.panel').filter({ has: page.locator('.panel__title', { hasText: title }) })

/** Distance between two boxes, measured from the bottom of one to the top of the next. */
const gapBetween = async (above: Awaited<ReturnType<typeof panel>>, below: typeof above) => {
  const [a, b] = await Promise.all([above.boundingBox(), below.boundingBox()])
  return Math.round(b!.y - (a!.y + a!.height))
}

test('the cards form two even columns with an even gap before the full-width card', async ({
  page,
}) => {
  const columns = page.locator('.settings__col')
  await expect(columns).toHaveCount(2)

  // Both stacks start on the same line; neither is pushed down by balancing.
  const [left, right] = await Promise.all([
    columns.nth(0).boundingBox(),
    columns.nth(1).boundingBox(),
  ])
  expect(Math.round(left!.y)).toBe(Math.round(right!.y))

  // The gap inside a column and the gap before the full-width card are the same.
  const insideColumn = await gapBetween(panel(page, '语言'), panel(page, '推送'))
  const beforeData = await gapBetween(page.locator('.settings__columns'), panel(page, '本机数据'))
  expect(insideColumn).toBe(16)
  expect(beforeData).toBe(16)

  // The local-data card spans the whole width, outside the two stacks.
  expect(Math.round((await panel(page, '本机数据').boundingBox())!.width)).toBe(
    Math.round((await page.locator('.settings__columns').boundingBox())!.width),
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
  const bots = page.locator('.bots__row')
  await expect(bots).toHaveCount(1)
  await expect(bots.first()).toContainText('api.example.test')
  await expect(bots.first()).toContainText('当前')
})

test('adding a second bot and switching moves the dashboard to it', async ({ page }) => {
  // The second origin only exists for this test.
  await mockApi(page, { secondBot: true })
  const bots = page.locator('.bots__row')
  await page.locator('button', { hasText: '添加机器人' }).click()
  const editor = page.locator('.bots__editor')
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
  await expect(page.locator('.panel', { hasText: '连接状态' })).toContainText(SECOND_BASE)

  // Switching back restores the original bot and its address.
  await page.locator('.rail__item').nth(6).click()
  await bots.first().locator('button', { hasText: '切换' }).click()
  await page.locator('.rail__item').nth(5).click()
  await expect(page.locator('.panel', { hasText: '连接状态' })).toContainText(API_BASE)
})

test('retrying the live stream acknowledges the click', async ({ page }) => {
  await page.locator('button', { hasText: '重试实时推送' }).click()
  // Filtered: the "bot added" toast from the connect step may still be on screen.
  await expect(page.locator('.toast', { hasText: '正在重连实时推送' })).toHaveCount(1)
})

import { expect, test, type Page } from '@playwright/test'
import { connect, mockApi } from './support/fixtures'

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
})

test('the password stays out of localStorage unless you ask for it', async ({ page }) => {
  // The connect helper never touches the "remember" toggle, so this is the default path.
  const stored = await page.evaluate(() => ({
    local: localStorage.getItem('ftdash.credentials.v1'),
    session: sessionStorage.getItem('ftdash.credentials.v1'),
  }))

  expect(stored.local).toBeNull()
  expect(stored.session).toContain('tester')
})

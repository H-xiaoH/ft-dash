import { expect, test } from '@playwright/test'
import { ACTIVE_BOT_KEY, BOTS_KEY } from '../src/lib/bots'
import { API_BASE, PASSWORD, SECOND_BASE, connect, mockApi } from './support/fixtures'

test('an unauthenticated tab keeps its initial backend across another tab switching', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await page.evaluate(
    ({ activeKey, botsKey, firstBase, secondBase }) => {
      const bots = [
        { id: 'bot-first', name: 'First', baseUrl: firstBase, username: 'first' },
        { id: 'bot-second', name: 'Second', baseUrl: secondBase, username: 'second' },
      ]
      localStorage.setItem(botsKey, JSON.stringify({ generation: null, bots }))
      localStorage.setItem(activeKey, JSON.stringify('bot-first'))
    },
    { activeKey: ACTIVE_BOT_KEY, botsKey: BOTS_KEY, firstBase: API_BASE, secondBase: SECOND_BASE },
  )
  const reader = await context.newPage()
  await mockApi(reader, { secondBot: true })
  await reader.goto('/')
  const username = reader.locator('input[autocomplete="username"]')
  await expect(username).toHaveValue('first')

  await page.evaluate(
    (key) => localStorage.setItem(key, JSON.stringify('bot-second')),
    ACTIVE_BOT_KEY,
  )
  await reader.reload()
  await expect(username).toHaveValue('first')
})

test('revoking remembered credentials preserves an offline tab and cleans legacy writes', async ({
  page,
  context,
}) => {
  const remember = (tab: typeof page) =>
    tab.locator('.v-switch', { hasText: '在此设备上记住凭据' }).locator('input')
  await mockApi(page)
  await page.goto('/')
  await remember(page).check()
  await connect(page)
  await expect(page.locator('.shell')).toBeVisible()
  await page.goto('/#/settings')
  await expect(remember(page)).toBeChecked()

  const offline = await context.newPage()
  await offline.route(`${API_BASE}/**`, (route) => route.abort())
  await offline.goto('/')
  const password = offline.locator('input[type="password"]')
  await expect(password).toHaveValue(PASSWORD)
  await remember(page).uncheck()
  await expect(remember(offline)).not.toBeChecked()
  await offline.reload()
  await expect(password).toHaveValue(PASSWORD)

  await offline.evaluate(() => {
    localStorage.setItem('ftdash.bots.v1', JSON.stringify([{ password: 'stale-legacy-write' }]))
  })
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ftdash.bots.v1'))).toBeNull()
  const fresh = await context.newPage()
  await fresh.goto('/')
  await expect(fresh.locator('input[type="password"]')).toHaveValue('')
})

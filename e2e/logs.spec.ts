import { expect, test } from '@playwright/test'
import { connect, livePage, mockApi } from './support/fixtures'

function logWindow(first: number) {
  return {
    log_count: 150,
    logs: Array.from({ length: 150 }, (_, index) => {
      const number = first + index
      const timestamp = Date.UTC(2026, 10, 1, 0, number)
      return [new Date(timestamp).toISOString(), timestamp, 'worker', 'INFO', `Log line ${number}`]
    }),
  }
}

test('a rolling log window stays put while reading and catches up on request', async ({ page }) => {
  const responses = { logs: logWindow(1) }
  await mockApi(page, { responses })
  await page.goto('/#/logs')
  await connect(page)

  const logs = livePage(page).getByRole('list', { name: '运行日志' })
  const latest = livePage(page).getByRole('button', { name: '回到最新' })
  await expect(logs.getByText('Log line 150', { exact: true })).toBeVisible()
  await logs.evaluate((element) => (element.scrollTop = 560))
  await expect(latest).toBeVisible()
  const position = await logs.evaluate((element) => element.scrollTop)
  expect(position).toBeGreaterThan(0)
  const firstVisible = () =>
    logs.evaluate((element) => {
      const top = element.getBoundingClientRect().top
      return Array.from(element.querySelectorAll('.logs__line'))
        .find((row) => row.getBoundingClientRect().bottom > top)
        ?.textContent?.trim()
    })
  await expect.poll(firstVisible).toMatch(/Log line/)
  const visibleText = await firstVisible()

  responses.logs = logWindow(151)
  await page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/logs?') &&
      response.request().method() === 'GET' &&
      response.ok(),
  )
  await expect.poll(firstVisible).toBe(visibleText)
  await expect.poll(() => logs.evaluate((element) => element.scrollTop)).toBe(position)

  await latest.click()
  await expect(logs.getByText('Log line 300', { exact: true })).toBeVisible()
  await expect(logs).toBeFocused()
  await expect.poll(() => logs.evaluate((element) => element.scrollTop)).toBe(0)
})

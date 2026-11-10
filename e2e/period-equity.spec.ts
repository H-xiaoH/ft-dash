import { expect, test } from '@playwright/test'
import type { DailyEntry } from '../src/lib/types'
import { connect, livePage, mockApi, RESPONSES } from './support/fixtures'

for (const [width, locale] of [
  [320, 'zh-CN'],
  [320, 'en-US'],
  [479, 'zh-CN'],
  [479, 'en-US'],
] as const) {
  test.describe(`period tooltip at ${width}px in ${locale}`, () => {
    test.use({ locale, viewport: { width, height: 924 } })

    test('shows complete historical equity and profit inside the chart', async ({ page }) => {
      const daily = RESPONSES.daily as { data: DailyEntry[] }
      await mockApi(page, {
        responses: {
          daily: {
            ...daily,
            data: daily.data.map((row) => ({
              ...row,
              abs_profit: -1234567890123.45,
              rel_profit: -1.2345,
            })),
          },
        },
      })
      await page.goto('/')
      await connect(page)
      const chart = livePage(page).locator('.period-chart')
      const tooltip = chart.locator('.period-tooltip')
      await expect(chart.locator('canvas')).toBeVisible()
      await chart.scrollIntoViewIfNeeded()
      const box = (await chart.boundingBox())!
      for (const [index, equity] of [
        [1, '81.00'],
        [19, '99.00'],
      ] as const) {
        await page.mouse.move(
          box.x + 66 + ((box.width - 122) / 20) * (index + 0.5),
          box.y + box.height / 2,
        )
        await expect(tooltip).toContainText(`${equity} USDT`)
        await expect(tooltip).toContainText(locale === 'zh-CN' ? '账户净值' : 'Equity')
        await expect(tooltip).toContainText('-1,234,567,890,123.45 USDT')
        await expect(tooltip).toContainText('(-123.45%)')
        await expect
          .poll(() =>
            tooltip.evaluate((element) => {
              const outer = element.getBoundingClientRect()
              const chart = element.closest('.period-chart')!.getBoundingClientRect()
              const text = document.createRange()
              text.selectNodeContents(element)
              const ratio = document.createRange()
              ratio.selectNodeContents(element.querySelector('.period-tooltip__ratio')!)
              return (
                outer.left >= chart.left - 1 &&
                outer.right <= chart.right + 1 &&
                ratio.getClientRects().length === 1 &&
                Array.from(text.getClientRects()).every(
                  (rect) =>
                    rect.left >= outer.left - 1 &&
                    rect.right <= outer.right + 1 &&
                    rect.bottom <= outer.bottom + 1,
                )
              )
            }),
          )
          .toBe(true)
      }

      await livePage(page)
        .getByRole('button', { name: locale === 'zh-CN' ? '展开明细' : 'Show details' })
        .click()
      const details = livePage(page).locator('.period-details')
      const equityLabel = locale === 'zh-CN' ? '账户净值' : 'Equity'
      await expect(details.getByText(`${equityLabel} 81.00 USDT`, { exact: true })).toBeVisible()
      await expect(details.getByText(`${equityLabel} 99.00 USDT`, { exact: true })).toBeVisible()
    })
  })
}

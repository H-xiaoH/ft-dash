import { expect, test } from '@playwright/test'
import { connect, livePage, mockApi } from './support/fixtures'

test('historical equity appears in the rendered period tooltip', async ({ page }) => {
  await page.addInitScript(() => {
    const draw = CanvasRenderingContext2D.prototype.fillText
    const texts: string[] = []
    Object.assign(window, { periodPaintedTexts: texts })
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      texts.push(text)
      if (texts.length > 2000) texts.splice(0, 1000)
      if (maxWidth === undefined) draw.call(this, text, x, y)
      else draw.call(this, text, x, y, maxWidth)
    }
  })
  await mockApi(page)
  await page.goto('/')
  await connect(page)
  const chart = livePage(page).locator('.period-chart')
  await expect(chart.locator('canvas')).toBeVisible()
  const box = (await chart.boundingBox())!
  await page.mouse.move(box.x + 66 + ((box.width - 122) / 20) * 1.5, box.y + box.height / 2)
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { periodPaintedTexts: string[] }).periodPaintedTexts.some((text) =>
          text.includes('81.00 USDT'),
        ),
      ),
    )
    .toBe(true)
})

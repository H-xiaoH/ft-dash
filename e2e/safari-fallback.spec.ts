import { expect, test } from '@playwright/test'
import { connect, livePage, mockApi } from './support/fixtures'

test('base styles keep navigation, overlays and overview columns usable without newer CSS', async ({
  page,
}) => {
  await page.route('**/*.css', async (route) => {
    const response = await route.fetch()
    const css = (await response.text())
      .replaceAll('color-mix(', 'unsupported-color-mix(')
      .replace(/@container[^{}]*\{/g, '@media not all{')
      .replace(/\(container-type:\s*inline-size\)/g, '(unsupported-container-type: inline-size)')
    await route.fulfill({ response, body: css })
  })
  await mockApi(page)
  await page.goto('/')
  await connect(page)
  await expect(page.locator('.shell')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 780 })
  const tabbar = page.locator('.tabbar')
  await expect(tabbar).toBeVisible()
  await expect(tabbar).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(livePage(page).locator('.ov-stake').first()).toBeVisible()
  await page.goto('/#/stats')
  await livePage(page).locator('.metric--button').first().click()
  await expect(page.locator('.overlay')).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
})

import { expect, test } from '@playwright/test'
import { connect, livePage, mockApi } from './support/fixtures'

test('base styles keep navigation, overlays and overview columns usable without color mixing', async ({
  page,
}) => {
  await page.route('**/*.css', async (route) => {
    const response = await route.fetch()
    const css = (await response.text()).replaceAll('color-mix(', 'unsupported-color-mix(')

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
  await livePage(page).locator('button.metric').first().click()
  await expect(page.locator('.v-dialog .v-overlay__scrim')).not.toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  )
})

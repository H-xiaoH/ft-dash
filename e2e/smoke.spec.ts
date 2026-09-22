import { expect, test } from '@playwright/test'
import { ROUTES, connect, mockApi } from './support/fixtures'

test.describe('connect screen', () => {
  test('refuses bad credentials with a readable message', async ({ page }) => {
    await mockApi(page, { rejectAuth: true })
    await page.goto('/')
    await connect(page)

    await expect(page.locator('.banner--bad')).toContainText('用户名或密码错误')
    await expect(page.locator('.connect__card')).toBeVisible()
  })

  test('connects and shows live figures from the API', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')
    await connect(page)

    await expect(page.locator('.shell')).toBeVisible()
    await expect(page.locator('.strip__state-label')).toHaveText('运行中')
    await expect(page.locator('.strip__metric').first()).toContainText('100.00')
    await expect(page.locator('.metric__label').first()).toHaveText('账户净值')
  })
})

test.describe('navigation', () => {
  test('every route renders its content without console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(String(error)))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })

    await mockApi(page)
    await page.goto('/')
    await connect(page)
    await expect(page.locator('.shell')).toBeVisible()

    for (const route of ROUTES) {
      await page.goto(`/${route.path}`)
      await expect(page.locator('main')).toContainText(route.marker)
    }

    expect(errors).toEqual([])
  })

  test('lays out without horizontal overflow at phone, tablet and desktop widths', async ({
    page,
  }) => {
    await mockApi(page)
    await page.goto('/')
    await connect(page)
    await expect(page.locator('.shell')).toBeVisible()

    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      for (const route of ROUTES) {
        await page.goto(`/${route.path}`)
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        expect(overflow, `${route.path} overflows at ${width}px`).toBeLessThanOrEqual(2)
      }
    }
  })
})

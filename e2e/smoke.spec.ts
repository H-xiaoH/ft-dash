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
  test('a page whose code cannot be fetched says so instead of hanging', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')
    await connect(page)
    await expect(page.locator('.shell')).toBeVisible()

    // The flaky-network case: the view's chunk never arrives, so the navigation dies.
    // Built app: a hashed chunk. Dev server: the source module it serves instead.
    for (const pattern of ['**/assets/SettingsView-*.js', '**/views/SettingsView.vue*']) {
      await page.route(pattern, (route) => route.abort())
    }
    await page.goto('/#/settings')

    await expect(page.locator('.toast')).toContainText('页面加载失败')
  })

  test('every route renders its content without console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(String(error)))
    page.on('console', (message) => {
      const text = message.text()
      // Vue's dev-mode warnings catch real mistakes (bad props, missing keys, and
      // router misuse such as a Transition wrapped around RouterView).
      if (
        message.type() === 'error' ||
        text.includes('[Vue warn]') ||
        text.includes('[Vue Router warn]')
      )
        errors.push(text)
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

  test('data tables become card lists on narrow screens', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')
    await connect(page)
    await expect(page.locator('.shell')).toBeVisible()
    await page.setViewportSize({ width: 390, height: 844 })

    for (const route of ['#/trades', '#/stats', '#/market']) {
      await page.goto(`/${route}`)
      await expect(page.locator('.card').first()).toBeVisible()
      // A hash change slides the previous page out; wait for it to leave before judging
      // this page's layout.
      await expect(page.locator('.page-track > *')).toHaveCount(1)
      // Nothing on the page may still require sideways scrolling.
      const scrollable = await page.evaluate(() =>
        [...document.querySelectorAll('.table-wrap')]
          .filter((element) => element.scrollWidth > element.clientWidth + 2)
          .map(
            (element) =>
              `${element.className}: ${element.clientWidth}/${element.scrollWidth} in ${
                element.closest('.panel')?.querySelector('.panel__title')?.textContent ?? '?'
              }`,
          ),
      )
      expect(scrollable, `${route} still scrolls horizontally`).toEqual([])
    }
  })
})

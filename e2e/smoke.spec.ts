import { expect, test } from '@playwright/test'
import { API_ORIGIN, ROUTES, connect, livePage, mockApi } from './support/fixtures'

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
    await expect(livePage(page).locator('.metric__label').first()).toHaveText('账户净值')
  })

  test('the language menu is an emoji button that opens a highlighted picker', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')

    // Collapsed to a single emoji, so the connect card keeps the corner to itself.
    const trigger = page.locator('.connect__lang .filter-menu__button')
    await expect(trigger).toHaveText('🌐')

    await trigger.click()
    const options = page.locator('.filter-menu__item')
    await expect(options).toHaveText(['跟随系统', '简体中文', 'English'])
    // The current pick is the highlighted one, and the list says so to screen readers.
    await expect(page.locator('.filter-menu__item.is-active')).toHaveText('跟随系统')
    await expect(page.locator('.filter-menu__item[aria-selected="true"]')).toHaveText('跟随系统')

    await page.locator('.filter-menu__item', { hasText: 'English' }).click()
    await expect(page.locator('.connect__title')).toHaveText('Connect to your bot')
    // The pick is stored as a preference, not as the language it resolved to.
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('ftdash.settings.v1') ?? '{}'),
    )
    expect(stored.locale).toBe('en')
  })

  test('the bot name field says it can be left empty', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')
    // Unnamed bots take the username, so the field says what leaving it blank means.
    await expect(page.getByLabel('机器人名称')).toHaveAttribute('placeholder', '可选')
  })

  test('a lost connection shows a state word, not a sentence, in the top bar', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')
    await connect(page)
    await expect(page.locator('.strip__state-label')).toHaveText('运行中')

    // The bot goes away: every later request fails at the network level.
    await page.route(`${API_ORIGIN}/**`, (route) => route.abort())

    await expect(page.locator('.strip__state-label')).toHaveText('不可用')
    // The sentence still exists — in the banner that can act on it.
    await expect(page.locator('.shell__banner')).toContainText('请求被浏览器拦截')
  })
})

test.describe('navigation', () => {
  test('a page whose code cannot be fetched says so instead of hanging', async ({ page }) => {
    await mockApi(page)
    /*
     * The flaky-network case: the view's chunk never arrives, so the navigation dies.
     * Built app: a hashed chunk. Dev server: the source module it serves instead. Blocked
     * before the first load on purpose — the app holds every page on the track, so from
     * the second load on the chunk would already be cached and never asked for again.
     */
    for (const pattern of ['**/assets/SettingsView-*.js', '**/views/SettingsView.vue*']) {
      await page.route(pattern, (route) => route.abort())
    }
    await page.goto('/#/settings')
    await connect(page)

    // Filtered: the "bot added" toast may still be counting down from the connect step.
    await expect(page.locator('.toast', { hasText: '页面加载失败' })).toHaveCount(1)
  })

  test('every route renders its content without console errors', async ({ page, browserName }) => {
    test.skip(
      browserName === 'webkit',
      /*
       * Harness limit, not an app limit: WebKit rejects Playwright's fulfilled cross-origin
       * responses with an "access control checks" error even when they carry a valid
       * Access-Control-Allow-Origin (verified by logging the response). The app itself loads
       * data under WebKit — see "connects and shows live figures from the API" — so this
       * console-error sweep stays on Chromium until the fixtures are served by a real HTTP
       * server instead of interception.
       */
    )
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
      // Only changing the hash leaves the document up, so the page already on screen is
      // still sliding out: wait for this route's content to arrive, then for the page it
      // pushed out to leave the track.
      await expect(livePage(page).filter({ hasText: route.marker }).first()).toBeVisible()
      await expect(livePage(page)).toHaveCount(1)
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
      await expect(livePage(page).locator('.card').first()).toBeVisible()
      // A hash change slides the previous page out; wait for it to leave before judging
      // this page's layout.
      await expect(livePage(page)).toHaveCount(1)
      // Nothing on the page may still require sideways scrolling.
      const scrollable = await page.evaluate(() =>
        [...document.querySelectorAll('.page-track > :not(.page-neighbor) .table-wrap')]
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

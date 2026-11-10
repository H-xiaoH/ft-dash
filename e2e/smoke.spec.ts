import { expect, test } from '@playwright/test'
import { API_BASE, API_ORIGIN, ROUTES, connect, livePage, mockApi } from './support/fixtures'

test.describe('connect screen', () => {
  test('refuses bad credentials with a readable message, and saves nothing', async ({ page }) => {
    const api = await mockApi(page, { rejectAuth: true })
    await page.goto('/')
    await connect(page)

    await expect(page.locator('.v-alert.text-error')).toContainText('用户名或密码错误')
    await expect(page.locator('.connect .v-card')).toBeVisible()
    // The probe failed, so no bot was written down and no shell opened.
    expect(await page.evaluate(() => localStorage.getItem('ftdash.bots.v2'))).toBeNull()

    // Fix the password: the same form now gets in, and only then is the bot saved.
    api.setRejectAuth(false)
    await page.locator('.connect__submit').click()
    await expect(page.locator('.shell')).toBeVisible()
    const stored = await page.evaluate(() => localStorage.getItem('ftdash.bots.v2'))
    expect(JSON.parse(stored!).bots).toHaveLength(1)
  })

  test('connects and shows live figures from the API', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')
    await connect(page)

    await expect(page.locator('.shell')).toBeVisible()
    await expect(page.locator('.strip__state-label')).toHaveText('运行中')
    await expect(page.locator('.strip__metric').first()).toContainText('98.00')
    await expect(livePage(page).locator('.v-card-subtitle').first()).toHaveText('账户净值')
  })

  test('the language menu is an emoji button that opens a highlighted picker', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')

    // Collapsed to a single emoji, so the connect card keeps the corner to itself.
    const trigger = page.locator('.connect__lang .filter-menu__button')
    await expect(trigger).toHaveText('🌐')

    await trigger.click()
    const options = page.locator('.v-overlay--active [role=option]')
    await expect(options).toHaveText(['跟随系统', '简体中文', 'English'])
    // The current pick is the highlighted one, and the list says so to screen readers.
    await expect(page.locator('.v-overlay--active [role=option].v-list-item--active')).toHaveText(
      '跟随系统',
    )
    await expect(page.locator('.v-overlay--active [role=option][aria-selected="true"]')).toHaveText(
      '跟随系统',
    )

    await page.locator('.v-overlay--active [role=option]', { hasText: 'English' }).click()
    await expect(page.locator('.connect h1')).toHaveText('Connect to your backend')
    // The pick is stored as a preference, not as the language it resolved to.
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('ftdash.settings.v2') ?? '{}'),
    )
    expect(stored.locale).toBe('en')
  })

  test('the bot name field says it can be left empty', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')
    // Unnamed bots take the username, so the field says what leaving it blank means.
    await expect(page.getByLabel('后端名称')).toHaveAttribute('placeholder', '可选')
  })

  test('a lost connection shows a state word, not a sentence, in the top bar', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')
    await connect(page)
    await expect(page.locator('.strip__state-label')).toHaveText('运行中')

    // The bot goes away: every later request fails at the network level.
    await page.route(`${API_ORIGIN}/**`, (route) => route.abort())

    await expect(page.locator('.strip__state-label')).toHaveText('未连通')
    // The sentence still exists — in the banner, which also says the poll keeps trying.
    await expect(page.locator('.global-notices')).toContainText('请求被浏览器拦截')
    await expect(page.locator('.global-notices')).toContainText('正在自动重试')
    await expect(page.locator('.global-notices button')).toHaveCount(0)
  })

  test('a rejected session goes back to the sign-in form instead of a dead shell', async ({
    page,
  }) => {
    const api = await mockApi(page)
    await page.goto('/')
    await connect(page)
    await expect(page.locator('.shell')).toBeVisible()

    // The bot's password is rotated behind the app's back: every later call is a 401.
    api.setRejectAuth(true)

    await expect(page.locator('.connect .v-card')).toBeVisible()
    await expect(page.locator('.v-alert.text-error')).toContainText('用户名或密码错误')
    // The bot is still listed and the fields still say what to sign in to.
    await expect(page.locator('input[inputmode="url"]')).toHaveValue(API_BASE)
    await expect(page.locator('.global-notices')).toHaveCount(0)
  })
})

test('log minimum level includes higher-severity lines and excludes debug', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await connect(page)
  await page.goto('/#/logs')
  const log = livePage(page)
  const levels = log.locator('.logs__line .v-chip')
  await expect(levels).toHaveText(['CRITICAL', 'ERROR', 'WARNING', 'INFO'])
  await expect(log.locator('.logs .v-list-item', { hasText: 'Test debug' })).toHaveCount(0)
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
    await expect(
      page.locator('.v-snackbar--active .v-snackbar__wrapper', { hasText: '页面加载失败' }),
    ).toHaveCount(1)
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

  test('the overview keeps its wide columns on desktop and drops them on a phone', async ({
    page,
  }) => {
    await mockApi(page, { tradeCount: 12 })
    await page.goto('/')
    await connect(page)
    await expect(page.locator('.shell')).toBeVisible()

    const openPanel = livePage(page).locator('.panel', { hasText: '当前持仓' }).first()
    const header = (label: string) => openPanel.locator('th', { hasText: label })

    // Desktop: direction text, current price, and the leverage chip all present.
    await page.setViewportSize({ width: 1280, height: 900 })
    await expect(header('当前价')).toBeVisible()
    await expect(openPanel.locator('.side__label')).toHaveCount(0)
    await expect(openPanel.locator('.overview__leverage')).toHaveCount(0)

    // Phone: the same cells are hidden (they stay in the DOM, so ask about visibility), and
    // only the direction arrow is left beside the pair.
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(header('当前价')).toBeHidden()
    await expect(openPanel.locator('.side__label').first()).toBeHidden()
    await expect(openPanel.locator('.overview__leverage').first()).toBeHidden()
    await expect(openPanel.locator('.table__side').first()).toBeVisible()
  })

  test('data lists fit narrow screens and market keeps its column headers', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')
    await connect(page)
    await expect(page.locator('.shell')).toBeVisible()
    await page.setViewportSize({ width: 390, height: 844 })

    for (const route of ['#/trades', '#/stats', '#/market']) {
      await page.goto(`/${route}`)
      if (route === '#/market') {
        const list = livePage(page).getByRole('region', { name: '白名单' })
        await expect(list.getByRole('columnheader')).toHaveText([
          '交易对',
          '持仓中',
          '累计已平仓盈亏',
        ])
        for (const header of await list.getByRole('columnheader').all())
          await expect(header).toBeVisible()
        await expect(list.locator('tbody tr')).toHaveCount(3)
        await expect(list.locator('ul')).toHaveCount(0)
      } else {
        await expect(livePage(page).locator('.progressive-table tbody tr').first()).toBeVisible()
      }
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

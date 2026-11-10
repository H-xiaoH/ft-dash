import { expect, test, type Page } from '@playwright/test'
import { settlePages } from './support/gestures'
import {
  API_BASE,
  API_ORIGIN,
  PASSWORD,
  SECOND_BASE,
  connect,
  livePage,
  mockApi,
} from './support/fixtures'

const LONG_ADDRESS_TEST = 'the backend picker displays its full address on desktop and mobile'
const LONG_API_PREFIX = `/freqtrade/${'backend'.repeat(20)}`
const LONG_API_BASE = `${API_ORIGIN}${LONG_API_PREFIX}/api/v1`

test.beforeEach(async ({ page }, testInfo) => {
  const longAddress = testInfo.title === LONG_ADDRESS_TEST
  await mockApi(page, longAddress ? { apiPrefix: LONG_API_PREFIX } : undefined)
  await page.goto('/')
  await connect(page, longAddress ? LONG_API_BASE : API_BASE)
  await expect(page.locator('.shell')).toBeVisible()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.locator('.rail__item').nth(6).click()
  await expect(livePage(page).locator('.settings__columns')).toBeVisible()
  await settlePages(page)
})

const panel = (page: Page, title: string) =>
  livePage(page)
    .locator('.panel')
    .filter({ has: page.locator('.panel__title', { hasText: title }) })

/** The 后端 panel itself, not the 后端控制 block nested inside it. */
const botsPanel = (page: Page) =>
  livePage(page)
    .locator('.panel')
    .filter({ has: page.locator('.panel__title', { hasText: /^后端$/ }) })

/** The bot picker's footer action opens the manager, which is where add/edit/remove live. */
const openBotManager = async (page: Page) => {
  await expect(page).toHaveURL(/#\/settings(?:\?|$)/)
  await settlePages(page)
  await botsPanel(page).locator('.filter-menu__button').click()
  await page.getByRole('button', { name: '管理后端', exact: true }).click()
  await expect(botsPanel(page).locator('.bots__manage')).toBeVisible()
  await expect(
    botsPanel(page).locator('.expand-transition-enter-active, .expand-transition-leave-active'),
  ).toHaveCount(0)
}

/** Picking a bot in the picker is what switches to it. */
const pickBot = async (page: Page, name: string) => {
  await expect(page).toHaveURL(/#\/settings(?:\?|$)/)
  await settlePages(page)
  await botsPanel(page).locator('.filter-menu__button').click()
  await page.locator('.v-overlay--active [role=option]', { hasText: name }).first().click()
}

/** Distance between two boxes, measured from the bottom of one to the top of the next. */
const gapBetween = async (above: Awaited<ReturnType<typeof panel>>, below: typeof above) => {
  const [a, b] = await Promise.all([above.boundingBox(), below.boundingBox()])
  return Math.round(b!.y - (a!.y + a!.height))
}

/**
 * The dropdown under a given field label. The region panel now holds two of them, so
 * "the dropdown on the settings page" is no longer a single thing to point at.
 */
const fieldMenu = (page: Page, label: string) =>
  livePage(page).locator('.v-input', { has: page.locator('label', { hasText: label }) })

test(LONG_ADDRESS_TEST, async ({ page }) => {
  const trigger = botsPanel(page).locator('.filter-menu__button')
  const address = trigger.locator('.filter-menu__trigger-hint')
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 924 })
    await expect(address).toHaveText(LONG_API_BASE)
    await expect(trigger.locator('.v-badge')).toBeVisible()
    await expect(trigger.locator('svg')).toBeVisible()
    const columns = livePage(page).locator('.settings__columns')
    await expect
      .poll(() =>
        columns.evaluate(
          (element) =>
            Array.from(element.children).filter(
              (child) =>
                child.getBoundingClientRect().top ===
                element.children[0].getBoundingClientRect().top,
            ).length,
        ),
      )
      .toBe(width === 1440 ? 2 : 1)
    await expect
      .poll(() =>
        address.evaluate((element, narrow) => {
          const button = element.closest('button')!.getBoundingClientRect()
          const panel = element.closest('.panel')!.getBoundingClientRect()
          const range = document.createRange()
          range.selectNodeContents(element)
          const lines = Array.from(range.getClientRects())
          return (
            button.left >= panel.left &&
            button.right <= panel.right &&
            lines.length >= (narrow ? 2 : 1) &&
            lines.every(
              (rect) =>
                rect.left >= button.left &&
                rect.right <= button.right &&
                rect.top >= button.top &&
                rect.bottom <= button.bottom,
            )
          )
        }, width === 320),
      )
      .toBe(true)
  }
})

test('the language and time zone dropdown triggers share the settings presentation', async ({
  page,
}) => {
  const language = fieldMenu(page, '语言')
  const timezone = fieldMenu(page, '时区')
  const buttonPresentation = (menu: Awaited<ReturnType<typeof fieldMenu>>) =>
    menu.locator('.v-field').evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        height: style.height,
        justifyContent: style.justifyContent,
        padding: style.padding,
        borderRadius: style.borderRadius,
      }
    })
  const [languageBox, timezoneBox] = await Promise.all([
    language.locator('.v-field').boundingBox(),
    timezone.locator('.v-field').boundingBox(),
  ])

  await expect(language).toHaveClass(/v-input/)
  await expect(timezone).toHaveClass(/v-input/)
  expect(Math.round(languageBox!.width)).toBe(Math.round(timezoneBox!.width))
  expect(await buttonPresentation(language)).toEqual(await buttonPresentation(timezone))

  const popupPresentation = () =>
    page.locator('.v-overlay--active .v-list').evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        borderRadius: style.borderRadius,
        borderColor: style.borderColor,
        backgroundColor: style.backgroundColor,
        boxShadow: style.boxShadow,
      }
    })

  await language.locator('.v-field').click()
  const languagePopup = page.locator('.v-overlay--active .v-list')
  await expect(languagePopup).toBeVisible()
  await expect(languagePopup.locator('.filter-menu__search')).toHaveCount(0)
  await expect(languagePopup).not.toHaveClass(/menu-list-enter-active/)
  const languagePopupBox = (await languagePopup.boundingBox())!
  const languageTriggerBox = (await language.locator('.v-field').boundingBox())!
  expect(Math.round(languagePopupBox.x)).toBe(Math.round(languageTriggerBox.x))
  const languagePopupStyle = await popupPresentation()
  await page.keyboard.press('Escape')
  await expect(languagePopup).toBeHidden()

  await timezone.locator('.v-field').click()
  const timezonePopup = page.locator('.v-overlay--active .v-list')
  await expect(timezonePopup).toBeVisible()
  await expect(page.getByRole('combobox', { name: '时区' })).toBeVisible()
  await expect(timezonePopup).not.toHaveClass(/menu-list-enter-active/)
  const timezonePopupBox = (await timezonePopup.boundingBox())!
  const timezoneTriggerBox = (await timezone.locator('.v-field').boundingBox())!
  expect(Math.round(timezonePopupBox.x)).toBe(Math.round(timezoneTriggerBox.x))
  expect(await popupPresentation()).toEqual(languagePopupStyle)
})

test('toasts stay in the lower-right corner above the mobile tab bar', async ({ page }) => {
  // Any toast will do; testing the stored credentials is the one click that always makes one.
  await openBotManager(page)
  await botsPanel(page).locator('button', { hasText: '测试连接' }).first().click()
  const toast = page.locator('.v-snackbar--active .v-snackbar__wrapper', { hasText: '连接成功' })
  await expect(toast).toBeVisible()

  // 1440 wide in this spec: the stack hugs the right edge instead of the centre.
  const wide = (await toast.boundingBox())!
  expect(Math.round(wide.x + wide.width)).toBeGreaterThan(1440 - 40)
  expect(Math.round(wide.width)).toBeLessThan(460)

  await page.setViewportSize({ width: 390, height: 780 })
  const tabbar = page.locator('.tabbar')
  await expect(tabbar).toBeVisible()
  const narrow = (await toast.boundingBox())!
  const tabbarBox = (await tabbar.boundingBox())!
  expect(Math.round(narrow.x + narrow.width)).toBeGreaterThan(390 - 40)
  expect(narrow.x).toBeGreaterThanOrEqual(16)
  expect(narrow.x + narrow.width).toBeLessThanOrEqual(390 - 16)
  expect(Math.round(narrow.y + narrow.height)).toBeLessThanOrEqual(Math.round(tabbarBox.y) - 12)

  await toast.click()
  await expect(toast).toHaveCount(0)

  const longName = '这是一个用于验证很长提示文案会在手机窄屏内自动换行而不会溢出的后端名称'
  await openBotManager(page)
  await livePage(page).locator('button', { hasText: '添加后端' }).click()
  const editor = livePage(page).locator('.bots__editor')
  await editor.getByLabel('后端名称').fill(longName)
  await editor.locator('input[inputmode="url"]').fill(API_BASE)
  await editor.getByLabel('用户名').fill('long-toast')
  await editor.getByLabel('密码').fill(PASSWORD)
  await editor.locator('button[type="submit"]').click()

  const longToast = page.locator('.v-snackbar--active .v-snackbar__wrapper', { hasText: longName })
  await expect(longToast).toBeVisible()
  const wrapped = (await longToast.boundingBox())!
  expect(wrapped.x).toBeGreaterThanOrEqual(16)
  expect(wrapped.x + wrapped.width).toBeLessThanOrEqual(390 - 16)
  expect(wrapped.height).toBeGreaterThan(narrow.height)
})

test('the footer reads the app build next to the bot version', async ({ page }) => {
  /*
   * The two numbers answer different questions — which build of this page, and which
   * Freqtrade the bot is running — so each is named rather than left to sit under a bare
   * "版本" that reads as if it described the page.
   */
  const footer = livePage(page)
    .locator('.panel', { has: page.locator('.panel__title', { hasText: '本机数据' }) })
    .locator('span.small.muted')
  await expect(footer).toHaveText(
    /^FT Dash - \d{2}\.\d{2}\.\d{2}\.\d{2}\.\d{2} · FreqTrade - \d{4}\.\d+$/,
  )
})

test('the time zone setting decides what clock the app reads by', async ({ page }) => {
  /*
   * The spec runs with the browser in Asia/Shanghai, so "follow the browser" is UTC+8 and the
   * fixture's fixed log stamp (11:59 UTC) reads as 19:59. Switching to UTC must move the app's
   * clock with it — and survive a reload, because it is a preference, not a session detail.
   */
  const logTime = () =>
    // The list shows newest first, so the 11:59 stamp is the last row.
    livePage(page).locator('.logs__line .v-list-item__prepend > span').last()

  await expect(livePage(page).locator('.panel__title', { hasText: '区域' })).toHaveCount(1)
  await page.goto('/#/logs')
  await expect(logTime()).toContainText('19:59')

  await page.goto('/#/settings')
  /*
   * The browser is Asia/Shanghai, so pin that same zone by name: the point is that pinning a
   * zone works, and "follow the browser" resolving to it must read the clock the same way.
   *
   * The list is the whole IANA catalogue, so it is reached through the search box rather than
   * scrolled — 400-odd rows in a popup is not a list anyone scrolls by hand.
   */
  const picker = fieldMenu(page, '时区')
  await expect(picker.locator('.v-field')).toContainText('跟随浏览器')
  await picker.locator('.v-field').click()
  await page.getByRole('combobox', { name: '时区' }).fill('Shanghai')
  /*
   * Two rows, both honest: the browser zone *is* Shanghai, so the follow-the-browser row is
   * reachable by that name too. Its display text is still just "跟随浏览器".
   */
  await expect(page.locator('.v-overlay--active [role=option]')).toHaveCount(2)
  const shanghai = page.locator('.v-overlay--active [role=option]', { hasText: 'Asia/Shanghai' })
  await expect(shanghai).toHaveCount(1)
  await expect(shanghai).toContainText('UTC+08:00')
  await shanghai.click()
  await expect(picker.locator('.v-field')).toContainText('Asia/Shanghai')

  // Pinning Shanghai reads the same clock "follow the browser" did one step ago.
  await page.goto('/#/logs')
  await expect(logTime()).toContainText('19:59')

  // And the pin is a preference, not a session detail: it survives a reload.
  await page.goto('/#/settings')
  await page.reload()
  await expect(fieldMenu(page, '时区').locator('.v-field')).toContainText('Asia/Shanghai')
  await page.goto('/#/logs')
  await expect(logTime()).toContainText('19:59')

  // Switching to UTC still moves the clock, eight hours the other way.
  await page.goto('/#/settings')
  const back = fieldMenu(page, '时区')
  await back.locator('.v-field').click()
  await page.getByRole('combobox', { name: '时区' }).fill('UTC')
  await expect(page.locator('.v-overlay--active [role=option]')).toHaveCount(1)
  await expect(page.locator('.v-overlay--active [role=option]')).toHaveText('UTC')
  await page.locator('.v-overlay--active [role=option]', { hasText: /^UTC$/ }).click()
  await page.goto('/#/logs')
  await expect(logTime()).toContainText('11:59')
})

test('logs render the date and time on separate lines', async ({ page }) => {
  await page.goto('/#/logs')
  const stamp = livePage(page).locator('.logs__line .v-list-item__prepend > span').last()
  const date = stamp.locator('span:first-child')
  const time = stamp.locator('span:last-child')

  await expect(date).not.toBeEmpty()
  await expect(time).toHaveText('19:59')
  await expect(date).toHaveCSS('display', 'block')
  await expect(time).toHaveCSS('display', 'block')
})

test('the minimum log level includes all more severe levels', async ({ page }) => {
  await page.goto('/#/logs')
  await settlePages(page)
  const rows = livePage(page).locator('.logs .v-list-item')
  const levelMenu = livePage(page).locator('.filter-menu').first()
  const chooseLevel = async (level: string) => {
    await levelMenu.locator('.filter-menu__button').click()
    await page
      .locator('.v-overlay--active [role=option]', { hasText: new RegExp(`^${level}$`) })
      .click()
    await expect(page.locator('.v-overlay .filter-menu__list')).toBeHidden()
  }

  // INFO is the default: DEBUG is below it, while the four higher levels remain visible.
  await expect(rows).toHaveCount(4)
  await expect(rows.filter({ hasText: 'DEBUG' })).toHaveCount(0)

  await chooseLevel('DEBUG')
  await expect(rows).toHaveCount(5)
  await expect(rows.filter({ hasText: 'Test unknown level' })).toHaveCount(0)

  // WARNING must be normalized as WARNING, not treated as an unknown level that slips through.
  await chooseLevel('ERROR')
  await expect(rows).toHaveCount(2)
  await expect(rows.filter({ hasText: 'ERROR' })).toHaveCount(1)
  await expect(rows.filter({ hasText: 'CRITICAL' })).toHaveCount(1)
  await expect(rows.filter({ hasText: 'WARNING' })).toHaveCount(0)
})

test('the time zone list offers every zone and searches them by name', async ({ page }) => {
  const picker = fieldMenu(page, '时区')
  await picker.locator('.v-field').click()
  // UTC is a fixed offset, not a region, so `supportedValuesOf` leaves it out — put back by hand.
  await expect(page.locator('.v-overlay--active [role=option]').first()).toHaveText('跟随浏览器')

  await page.getByRole('combobox', { name: '时区' }).fill('Tokyo')
  const tokyo = page.locator('.v-overlay--active [role=option]', { hasText: 'Asia/Tokyo' })
  await expect(tokyo).toHaveCount(1)
  // The offset rides along as right-aligned text, not as part of the zone name.
  await expect(tokyo).toContainText('UTC+09:00')
  // And it is decoration only: every offset contains "UTC", so matching on one would make
  // a search for UTC return the whole list.
  await page.getByRole('combobox', { name: '时区' }).fill('UTC+09')
  await expect(page.locator('.v-overlay--active [role=option]')).toHaveCount(0)

  // A term that matches nothing says so, and clears in place.
  await page.getByRole('combobox', { name: '时区' }).fill('nowhere')
  await expect(page.locator('.v-overlay--active [role=option]')).toHaveCount(0)
  await expect(page.locator('.v-overlay--active .v-list')).toContainText('没有数据')
  await page.getByRole('combobox', { name: '时区' }).fill('')
  await expect(page.locator('.filter-menu__empty')).toHaveCount(0)
  await expect(page.locator('.v-overlay--active [role=option]').first()).toHaveText('跟随浏览器')

  // A term is per-opening: it is not left behind to hide rows on the next visit.
  await page.getByRole('combobox', { name: '时区' }).fill('Tokyo')
  await tokyo.click()
  await expect(picker.locator('.v-field')).toContainText('Asia/Tokyo')
  await picker.locator('.v-field').click()
  await expect(page.getByRole('combobox', { name: '时区' })).toHaveValue('Asia/Tokyo')
})

test('the cards form two even columns with an even gap before the full-width card', async ({
  page,
}) => {
  const columns = livePage(page).locator('.settings__columns > .v-col')
  await expect(columns).toHaveCount(2)
  /*
   * Measured through Playwright, which reads null for a box it cannot see — a held page's
   * copy of these columns is one such box. Both waits are on the live page, so a measure
   * can neither catch the swap mid-flight nor an unlaid-out column.
   */
  await expect(columns.nth(0)).toBeVisible()
  await expect(columns.nth(1)).toBeVisible()

  /*
   * The panels fill in from the config, so the page is still moving when the first measure
   * lands: on a slow runner the tops differed and the gaps read 0. Every measure is polled
   * until the layout has settled, which is what "the cards are even" actually means.
   */
  const columnTopGap = async () => {
    const [left, right] = await Promise.all([
      columns.nth(0).boundingBox(),
      columns.nth(1).boundingBox(),
    ])
    return left && right ? Math.abs(Math.round(left.y) - Math.round(right.y)) : Number.NaN
  }
  // Both stacks start on the same line; neither is pushed down by balancing.
  await expect.poll(columnTopGap).toBeLessThanOrEqual(1)

  // The gap inside a column and the gap before the full-width card are the same.
  await expect.poll(() => gapBetween(panel(page, '区域'), panel(page, '界面'))).toBe(16)
  await expect
    .poll(() => gapBetween(livePage(page).locator('.settings__columns'), panel(page, '本机数据')))
    .toBe(16)

  // The local-data card spans the whole width, outside the two stacks.
  expect(Math.round((await panel(page, '本机数据').boundingBox())!.width)).toBe(
    Math.round((await livePage(page).locator('.settings__columns').boundingBox())!.width),
  )
})

test('the write switch asks before it enables anything', async ({ page }) => {
  // The "bot added" toast from the connect step is still counting down; letting it go first
  // keeps this test's single-toast assertions about one toast.
  await expect(page.locator('.v-snackbar--active .v-snackbar__wrapper')).toHaveCount(0, {
    timeout: 8000,
  })

  const writeSwitch = botsPanel(page).locator('.v-switch', { hasText: '后端控制' })
  const toggle = writeSwitch.locator('input[type="checkbox"]')
  await writeSwitch.scrollIntoViewIfNeeded()

  // Off by default, and the switch shows the state rather than asking for it twice.
  await expect(toggle).not.toBeChecked()

  // Turning it on opens the risk dialog; the list of what it enables lives in there.
  await writeSwitch.locator('.v-selection-control__input').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('开启后请谨慎使用')
  await expect(dialog.locator('li')).toHaveCount(4)
  // Until it is confirmed, the switch stays off.
  await expect(toggle).not.toBeChecked()

  await dialog.getByRole('button', { name: '我了解风险，开启控制功能' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(toggle).toBeChecked()

  /*
   * The toast's own countdown, then its dismissal — both before anything else can run,
   * because the toast only lives a few seconds and a slow worker would otherwise outlive it.
   */
  const timer = page.locator('.v-snackbar__timer .v-progress-linear__determinate').first()
  await expect(timer).toBeVisible()
  // Pin the element: a second toast arriving would move `.first()` to a fresh, wider bar.
  const bar = await timer.elementHandle()
  const start = (await bar!.boundingBox())!.width
  await page.waitForTimeout(400)
  expect((await bar!.boundingBox())?.width ?? 0).toBeLessThan(start)

  // Dismissing animates out: the toast stays on screen for its leave, then goes.
  await page.locator('.v-snackbar--active .v-snackbar__wrapper').first().click()
  await expect(page.locator('.v-snackbar .v-snackbar__wrapper')).toBeHidden({ timeout: 3000 })
  await expect(page.locator('.v-snackbar--active .v-snackbar__wrapper')).toHaveCount(0, {
    timeout: 3000,
  })

  // Turning it off needs no confirmation.
  await writeSwitch.locator('.v-selection-control__input').click()
  await expect(toggle).not.toBeChecked()
  await expect(dialog).toHaveCount(0)
})

test('the password stays out of localStorage unless you ask for it', async ({ page }) => {
  // The connect helper never touches the "remember" toggle, so this is the default path.
  const stored = await page.evaluate(() => ({
    local: localStorage.getItem('ftdash.bots.v2'),
    session: sessionStorage.getItem('ftdash.bots.session.v1'),
  }))

  // The bot list itself is persisted; only the password is held back.
  expect(stored.local).toContain('api.example.test')
  expect(stored.local).not.toContain('secret')
  expect(stored.session).toContain('tester')
  expect(stored.session).toContain('secret')
})

test('carries the default bot name over from the connect form', async ({ page }) => {
  await openBotManager(page)
  const bots = livePage(page).locator('.bots__row')
  await expect(bots).toHaveCount(1)
  // The connect form never asked for a name, so the bot is named after its username.
  await expect(bots.first()).toContainText('tester')
  await expect(bots.first()).toContainText('当前')
})

test('test connection moves success into the bot test button', async ({ page }) => {
  await openBotManager(page)
  const row = livePage(page).locator('.bots__row').first()
  const button = row.getByRole('button', {
    name: /测试连接|连接成功|Test connection|Connected|Connection successful/,
  })

  await button.click()

  await expect(button).toContainText('连接成功')
  await expect(row.locator('.bots__meta .v-chip', { hasText: '连接成功' })).toHaveCount(0)

  const language = fieldMenu(page, '语言').locator('.v-field')
  await language.click()
  await page.locator('.v-overlay--active [role=option]', { hasText: 'English' }).click()
  await expect(button).toContainText('Connection successful')
})

test('the bot name follows username until the name is edited', async ({ page }) => {
  await openBotManager(page)
  await livePage(page).locator('button', { hasText: '添加后端' }).click()
  const editor = livePage(page).locator('.bots__editor')
  const name = editor.getByLabel('后端名称')
  const username = editor.getByLabel('用户名')

  await username.fill('second')
  await expect(name).toHaveValue('second')
  await name.fill('我的后端')
  await username.fill('third')
  await expect(name).toHaveValue('我的后端')
})

test('delete bot opens a named confirmation dialog and restores focus on cancel', async ({
  page,
}) => {
  const panelOf = botsPanel(page)
  await openBotManager(page)
  const remove = panelOf
    .locator('.bots__row')
    .first()
    .getByRole('button', { name: '删除', exact: true })
  await remove.click()
  const dialog = page.getByRole('dialog', { name: '删除', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('将从本机移除 tester，需要重新输入凭据才能再次添加。')
  await expect(dialog).not.toContainText('立即作用于你的真实账户')
  await expect(panelOf.locator('.inline-confirm')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(remove).toBeFocused()
})

test('backend handles reorder and persist without switching, and action buttons align', async ({
  page,
}) => {
  await mockApi(page, { secondBot: true })
  await openBotManager(page)
  await livePage(page).getByRole('button', { name: '添加后端', exact: true }).click()
  const editor = livePage(page).locator('.bots__editor')
  await editor.getByLabel('后端名称', { exact: true }).fill('second')
  await editor.locator('input[inputmode="url"]').fill(SECOND_BASE)
  await editor.locator('input[autocomplete="username"]').fill('second')
  await editor.locator('input[autocomplete="current-password"]').fill('second-secret')
  await editor.getByRole('button', { name: '保存', exact: true }).click()
  const rows = livePage(page).locator('.bots__row')
  await expect(rows).toHaveCount(2)
  await expect(editor).toHaveCount(0)
  await rows.last().scrollIntoViewIfNeeded()
  const handle = rows.first().locator('.bots__drag')
  await handle.hover()
  const start = (await handle.boundingBox())!
  const end = (await rows.last().boundingBox())!
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  try {
    await expect(rows.first()).toHaveClass(/sortable-chosen/)
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2 + 20)
    await expect(page.locator('.sortable-fallback')).toBeVisible()
    await page.mouse.move(start.x + start.width / 2, end.y + end.height * 0.9, { steps: 12 })
    await expect(rows.first().locator('.bots__name')).toHaveText('second')
  } finally {
    await page.mouse.up()
  }
  await expect(rows.first().locator('.bots__name')).toHaveText('second')
  await expect(rows.last()).toHaveClass(/v-list-item--active/)
  await page.reload()
  await expect(livePage(page).locator('.settings__columns')).toBeVisible()
  await openBotManager(page)
  await expect(rows.first().locator('.bots__name')).toHaveText('second')
  await expect(rows.last()).toHaveClass(/v-list-item--active/)
  const keyboardHandle = rows.first().locator('.bots__drag')
  await keyboardHandle.focus()
  await keyboardHandle.press('ArrowDown')
  await expect(rows.last().locator('.bots__name')).toHaveText('second')
  await expect(rows.last().locator('.bots__drag')).toBeFocused()
  await rows.last().locator('.bots__drag').click()
  await page.getByRole('menuitem', { name: '上移', exact: true }).click()
  await expect(rows.first().locator('.bots__name')).toHaveText('second')
  await expect(rows.first().locator('.bots__drag')).toBeFocused()
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    const dimensions = await livePage(page)
      .locator('.bots__row .v-btn:visible')
      .evaluateAll((buttons) =>
        buttons.map((button) => ({
          height: button.getBoundingClientRect().height,
          icon: Boolean(button.querySelector('svg')),
        })),
      )
    expect(dimensions.length).toBeGreaterThan(5)
    expect(dimensions[0].height).toBeGreaterThanOrEqual(28)
    for (const button of dimensions) {
      expect(button.height).toBe(dimensions[0].height)
      expect(button.icon).toBe(true)
    }
  }
})

test('clearing local data requires confirmation and cancel preserves credentials', async ({
  page,
}) => {
  const dataPanel = panel(page, '本机数据')
  const before = await page.evaluate(() => localStorage.getItem('ftdash.bots.v2'))
  await dataPanel.getByRole('button', { name: '清除本机数据', exact: true }).click()
  const confirmation = dataPanel.getByRole('alert')
  await expect(confirmation).toContainText('这会把保存的凭据与偏好一并删除。')
  await confirmation.getByRole('button', { name: '取消' }).click()
  await expect(confirmation).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('ftdash.bots.v2'))).toBe(before)
})

test('adding a second bot and switching moves the dashboard to it', async ({ page }) => {
  // A bot switch is also a data-source boundary: the previous route filter must not follow it.
  await page.locator('.rail__item').nth(1).click()
  await expect(page).toHaveURL(/trades/)
  await livePage(page).locator('.v-btn-toggle .v-btn').nth(1).click()
  await expect(page).toHaveURL(/filter=closed/)
  await page.locator('.rail__item').nth(6).click()
  await expect(livePage(page).locator('.settings__columns')).toBeVisible()

  const topPicker = page.locator('.strip__picker .filter-menu__button')
  await expect(topPicker).toHaveCount(0)

  // The second origin only exists for this test.
  await mockApi(page, { secondBot: true })
  await openBotManager(page)
  const bots = livePage(page).locator('.bots__row')
  await livePage(page).locator('button', { hasText: '添加后端' }).click()
  const editor = livePage(page).locator('.bots__editor')
  await expect(editor.getByLabel('后端名称')).toHaveAttribute('placeholder', '可选')
  await editor.locator('input[inputmode="url"]').fill(SECOND_BASE)
  await editor.locator('input[autocomplete="username"]').fill('second')
  await editor
    .locator('input[type="password"][autocomplete="current-password"]')
    .fill('second-secret')
  await editor.locator('button[type="submit"]').click()

  await expect(bots).toHaveCount(2)
  // Adding does not steal the selection: the first bot is still the one in use.
  await expect(bots.first()).toContainText('当前')

  // Opening the picker probes the inactive backend without switching to it.
  await botsPanel(page).locator('.filter-menu__button').click()
  const menuOptions = page.locator('.v-overlay--active [role=option]')
  await expect(menuOptions.filter({ hasText: 'tester' })).toContainText(API_BASE)
  await expect(menuOptions.filter({ hasText: 'second' })).toContainText(SECOND_BASE)
  await expect(menuOptions.filter({ hasText: 'second' }).locator('.bg-success')).toBeVisible()
  await page.keyboard.press('Escape')

  await page.setViewportSize({ width: 320, height: 1000 })
  await expect(topPicker).toBeHidden()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await expect(topPicker).toBeVisible()
  expect((await topPicker.boundingBox())!.x).toBeLessThan(
    (await page.locator('.strip__latency').boundingBox())!.x,
  )

  // Open the same manager directly from the top bar on another page.
  await page.locator('.rail__item').nth(0).click()
  await expect(page).toHaveURL(/#\/$/)
  await topPicker.click()
  await expect(menuOptions.filter({ hasText: 'second' })).toContainText(SECOND_BASE)
  await page.getByRole('button', { name: '管理后端', exact: true }).click()
  await expect(page).toHaveURL(/#\/settings$/)
  const manager = botsPanel(page).locator('.bots__manage')
  await expect(manager).toBeVisible()
  await expect(manager.getByRole('heading', { name: '管理后端' })).toBeFocused()

  await topPicker.click()
  await menuOptions.filter({ hasText: 'second' }).click()
  await expect(
    page.locator('.v-snackbar--active .v-snackbar__wrapper', { hasText: '已切换' }),
  ).toHaveCount(1)
  await expect(botsPanel(page)).toContainText(SECOND_BASE)
  await expect(manager).toBeHidden()
  await openBotManager(page)
  await expect(bots.nth(1)).toContainText('当前')
  await expect(bots.first()).not.toContainText('当前')

  await page.locator('.rail__item').nth(1).click()
  await expect(page).not.toHaveURL(/filter=/)
  await expect(
    livePage(page).locator('.v-btn-toggle .v-btn').filter({ hasText: '全部交易' }),
  ).toHaveAttribute('aria-pressed', 'true')

  // The system page reports the endpoint the dashboard is now polling.
  await page.locator('.rail__item').nth(5).click()
  await expect(livePage(page).locator('.panel', { hasText: '连接状态' })).toContainText(SECOND_BASE)

  // Switching back restores the original bot and its address.
  await page.locator('.rail__item').nth(6).click()
  await pickBot(page, 'tester')
  await page.locator('.rail__item').nth(5).click()
  await expect(livePage(page).locator('.panel', { hasText: '连接状态' })).toContainText(API_BASE)
})

test('switching bots never bounces through the connect screen', async ({ page }) => {
  await mockApi(page, { secondBot: true })
  await openBotManager(page)
  await livePage(page).locator('button', { hasText: '添加后端' }).click()
  const editor = livePage(page).locator('.bots__editor')
  await editor.getByLabel('名称').fill('second')
  await editor.getByLabel('API 地址').fill(SECOND_BASE)
  await editor.getByLabel('用户名').fill('second')
  await editor.getByLabel('密码', { exact: true }).fill('second-secret')
  await editor.locator('button[type="submit"]').click()
  await expect(livePage(page).locator('.bots__row')).toHaveCount(2)

  /*
   * The defect was a flash, so sample the DOM instead of asserting at one instant: while
   * the new bot connected, the shell was replaced by the connect form — whose red banner
   * is titled "connection failed" — and stayed there if the attempt failed.
   */
  await page.evaluate(() => {
    const states: { shell: boolean; connect: boolean; failed: boolean }[] = []
    ;(window as unknown as { __states?: unknown }).__states = states
    const timer = setInterval(() => {
      states.push({
        shell: Boolean(document.querySelector('.shell')),
        connect: Boolean(document.querySelector('.connect .v-card')),
        failed: [...document.querySelectorAll('.banner')].some((node) =>
          (node.textContent ?? '').includes('连接失败'),
        ),
      })
    }, 10)
    ;(window as unknown as { __stop?: () => void }).__stop = () => clearInterval(timer)
  })

  await pickBot(page, 'second')
  await expect(
    page.locator('.v-snackbar--active .v-snackbar__wrapper', { hasText: '已切换' }),
  ).toHaveCount(1)
  await page.waitForTimeout(600)

  const states = await page.evaluate(() => {
    ;(window as unknown as { __stop?: () => void }).__stop?.()
    const seen =
      (window as unknown as { __states?: { shell: boolean; connect: boolean; failed: boolean }[] })
        .__states ?? []
    return {
      samples: seen.length,
      shells: seen.filter((state) => state.shell).length,
      connects: seen.filter((state) => state.connect).length,
      failures: seen.filter((state) => state.failed).length,
    }
  })
  // Enough samples that a multi-frame flash could not hide between them.
  expect(states.samples).toBeGreaterThan(20)
  // The switch keeps the shell up the whole time; it never falls back to the connect form
  // (that only happens when the picked bot genuinely cannot be reached).
  expect(states.shells, 'shell was replaced during the switch').toBe(states.samples)
  expect(states.connects, 'connect screen flashed during the switch').toBe(0)
  expect(states.failures, 'connection failed banner flashed during the switch').toBe(0)
})

test('the settings language picker offers following the system', async ({ page }) => {
  await expect(livePage(page).locator('.panel__title', { hasText: '区域' })).toHaveCount(1)
  // Located by structure: the trigger's own label is what the case is about, not the panel head.
  const trigger = fieldMenu(page, '语言').locator('.v-field')
  // Same control as the connect screen, but the panel is already titled — no emoji here.
  await expect(trigger).not.toContainText('🌐')
  await expect(trigger).toContainText('跟随系统')

  await trigger.click()
  await expect(page.locator('.v-overlay--active [role=option]')).toHaveText([
    '跟随系统',
    '简体中文',
    'English',
  ])
  await expect(page.locator('.v-overlay--active [role=option].v-list-item--active')).toHaveText(
    '跟随系统',
  )
  // Switching the language renames every panel; the field is found by label, not by title.
  await page.locator('.v-overlay--active [role=option]', { hasText: 'English' }).click()
  await expect(fieldMenu(page, 'Language').locator('.v-field')).toContainText('English')
})

test('the language popup stays inside a phone-width viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  const trigger = fieldMenu(page, '语言').locator('.v-field')
  await trigger.click()

  const [list, viewport] = await Promise.all([
    page.locator('.v-overlay--active .v-list').boundingBox(),
    page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
  ])
  expect(list).not.toBeNull()
  // The whole panel has to be reachable: it used to hang off the left edge of a phone.
  expect(list!.x).toBeGreaterThanOrEqual(0)
  expect(list!.x + list!.width).toBeLessThanOrEqual(viewport.width)
  expect(list!.y).toBeGreaterThanOrEqual(0)
  expect(list!.y + list!.height).toBeLessThanOrEqual(viewport.height)
})

test('the language popup travels with its trigger while the page scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 640 })
  await settlePages(page)
  const trigger = fieldMenu(page, '语言').locator('.v-field')
  const list = page.locator('.v-overlay--active .v-list')
  await trigger.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await trigger.click()
  await list.waitFor()
  await expect
    .poll(() =>
      list.evaluate((el) =>
        el
          .closest('.v-overlay__content')!
          .getAnimations()
          .some((animation) => animation.playState === 'running'),
      ),
    )
    .toBe(false)

  /** Distance from the trigger's box to the popup's — constant while it stays attached. */
  const offset = async () => {
    const [t, l] = await Promise.all([trigger.boundingBox(), list.boundingBox()])
    return Math.round(l!.y - t!.y)
  }
  const before = await offset()

  await livePage(page).evaluate((el) => {
    el.scrollTop += 100
  })
  // The popup used to be placed once: it stayed put and the trigger slid away from it.
  await expect.poll(async () => Math.abs((await offset()) - before)).toBeLessThanOrEqual(2)
  expect(await livePage(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
})

test('global toasts expire on the connect screen and do not revive after reconnecting', async ({
  page,
}) => {
  const dataPanel = panel(page, '本机数据')
  await dataPanel.getByRole('button', { name: '清除本机数据', exact: true }).click()
  await dataPanel.getByRole('alert').getByRole('button', { name: '确认', exact: true }).click()
  await expect(page.getByRole('heading', { name: '连接到你的后端', exact: true })).toBeVisible()
  const done = page.locator('.v-snackbar--active .v-snackbar__wrapper', { hasText: '操作已完成' })
  await expect(done).toBeVisible()
  await expect(done).toHaveCount(0, { timeout: 6500 })
  await connect(page)
  await expect(page.locator('.shell')).toBeVisible()
  await expect(
    page.locator('.v-snackbar--active .v-snackbar__wrapper', { hasText: '操作已完成' }),
  ).toHaveCount(0)
})

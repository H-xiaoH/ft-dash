import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { connect, livePage, mockApi } from './support/fixtures'
import { settlePages } from './support/gestures'

for (const width of [390, 693, 954]) {
  test(`toolbar controls share a compact height at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 924 })
    await mockApi(page)
    await page.goto('/')
    await connect(page)
    await expect(page.locator('.shell')).toBeVisible()
    for (const path of ['/', '/trades', '/stats']) {
      await page.goto(`/#${path}`)
      await settlePages(page)
      const heights = await livePage(page)
        .locator('.panel__head .v-btn')
        .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height))
      expect(heights.length).toBeGreaterThan(0)
      for (const height of heights) expect(Math.abs(height - 36)).toBeLessThanOrEqual(1)
      for (const group of await livePage(page).locator('.page-tabs, .sort-group').all()) {
        expect(await group.evaluate((element) => element.getBoundingClientRect().height)).toBe(36)
      }
      if (path !== '/stats') {
        const pair = livePage(page).locator('.table__pair-action').first()
        await expect(pair).toHaveClass(/v-btn--variant-text/)
        await expect(pair).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      }
    }
  })
}

test('backend actions keep readable colors and native field focus', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await connect(page)
  await expect(page.locator('.shell')).toBeVisible()
  await page.goto('/#/settings')
  await settlePages(page)
  const backend = livePage(page).locator('.panel').filter({ hasText: '后端控制' }).first()
  await backend.locator('.filter-menu__button').click()
  const title = page.locator('.v-overlay--active .filter-menu__list .v-card-title')
  await expect(title).toHaveText('选择后端')
  expect(
    await title.evaluate((element) => parseFloat(getComputedStyle(element).paddingLeft)),
  ).toBeGreaterThanOrEqual(12)
  await page.getByRole('option', { name: '管理后端', exact: true }).click()
  await expect(backend.locator('.bots__manage')).toBeVisible()
  await backend.getByRole('button', { name: '编辑', exact: true }).first().click()
  const editor = backend.locator('.bots__editor')
  await expect(editor).toBeVisible()
  const token = editor.getByLabel('ws_token', { exact: true })
  await token.focus()
  await expect(token).toHaveCSS('box-shadow', 'none')
  await expect(token).toHaveCSS('border-radius', '0px')
  await expect(editor.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
  await expect(backend.locator('[class*="-enter-active"]')).toHaveCount(0)
  expect(
    (
      await new AxeBuilder({ page })
        .include('.bots__editor')
        .withRules(['color-contrast'])
        .analyze()
    ).violations,
  ).toEqual([])
  await editor.getByRole('button', { name: '取消', exact: true }).click()
  await backend.locator('.v-switch').first().locator('input').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('[class*="-enter-active"]')).toHaveCount(0)
  expect(
    (await new AxeBuilder({ page }).include('.v-dialog').withRules(['color-contrast']).analyze())
      .violations,
  ).toEqual([])
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
})

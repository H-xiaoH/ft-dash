import { expect, test } from '@playwright/test'
import { connect, livePage, mockApi } from './support/fixtures'

test('native menus support keyboard selection, outside dismissal and focus return', async ({
  page,
}) => {
  await mockApi(page)
  await page.goto('/#/trades')
  await connect(page)
  const trigger = livePage(page).getByRole('button', { name: '排序', exact: true })
  await trigger.focus()
  await page.keyboard.press('ArrowDown')
  const list = page.getByRole('listbox')
  await expect(list).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(list).toBeHidden()
  await expect(trigger).toBeFocused()
  await trigger.click()
  await expect(list).toBeVisible()
  await page.mouse.click(1000, 20)
  await expect(list).toBeHidden()
})

test('dropdowns remain operable with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await page.goto('/#/settings')
  await connect(page)
  const trigger = livePage(page).locator('.filter-menu__button').first()
  await trigger.click()
  const list = page.getByRole('listbox')
  await expect(list).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(list).toBeHidden()
  await expect(trigger).toBeFocused()
})

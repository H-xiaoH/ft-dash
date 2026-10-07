import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { ROUTES, connect, mockApi } from './support/fixtures'

/**
 * Automated accessibility coverage. It is a floor, not a certificate: axe finds roughly a
 * third of WCAG issues, so the manual checks in the README still matter. What it buys is a
 * regression guard on the things it can see — names, roles, contrast, landmarks.
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

/** Violations as readable lines, so a failure names the rule instead of dumping JSON. */
async function violations(page: Page): Promise<string[]> {
  const { violations: found } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  return found.map(
    (item) =>
      `${item.id} [${item.impact ?? 'n/a'}] ${item.help} — ${item.nodes.length} node(s)\n` +
      item.nodes
        .slice(0, 3)
        .map((node) => {
          // Contrast checks carry the measured colours and ratio; print them, so a failure
          // explains itself instead of needing a separate probe.
          const data = node.any[0]?.data as
            | {
                fgColor?: string
                bgColor?: string
                contrastRatio?: number
                expectedContrastRatio?: string
              }
            | undefined
          const measured = data?.contrastRatio
            ? ` (fg ${data.fgColor} on ${data.bgColor}, ${data.contrastRatio}:1, needs ${data.expectedContrastRatio})`
            : ''
          return `    ${node.target.join(' ')}${measured}`
        })
        .join('\n'),
  )
}

/**
 * Let enter animations finish before measuring. axe reads computed colours, so an element
 * caught mid fade-in reports 1.35:1 even though it settles at 5.9:1 — recolouring the app to
 * satisfy one animation frame would break the design for a state nobody reads. Infinite
 * animations (spinners, shimmer) are ignored, otherwise this would never settle.
 */
async function settle(page: Page) {
  await page
    .waitForFunction(
      () =>
        document
          .getAnimations()
          .every(
            (animation) =>
              animation.playState !== 'running' ||
              animation.effect?.getTiming().iterations === Infinity,
          ),
      undefined,
      { timeout: 2000 },
    )
    .catch(() => {})
}

test.describe('accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page)
    await page.goto('/')
    await connect(page)
    await expect(page.locator('.shell')).toBeVisible()
  })

  test('every route is free of automated WCAG A/AA violations', async ({ page }) => {
    for (const route of ROUTES) {
      await page.goto(`/${route.path}`)
      await expect(page.locator('main')).toContainText(route.marker)
      await settle(page)
      expect(await violations(page), `${route.path}:\n`).toEqual([])
    }
  })

  test('the trade detail drawer is free of automated violations', async ({ page }) => {
    /*
     * Opened through the deep link rather than by clicking a row: this test is about the
     * drawer's own markup, and clicking is timing-sensitive across engines (a tap that lands
     * while the page transition swaps views can be swallowed).
     */
    await page.goto('/#/trades?trade=1')
    await expect(page.locator('.overlay--drawer .drawer')).toBeVisible()
    await settle(page)
    expect(await violations(page), 'drawer:\n').toEqual([])
  })
})

test.describe('accessibility (before connecting)', () => {
  test('the connect screen is free of automated violations', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')
    await expect(page.locator('.connect__card')).toBeVisible()
    await settle(page)
    expect(await violations(page), 'connect screen:\n').toEqual([])
  })

  test('the open language menu is free of automated violations', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')
    await page.locator('.connect__lang .filter-menu__button').click()
    await expect(page.locator('.filter-menu__list')).toBeVisible()
    await settle(page)
    expect(await violations(page), 'language menu:\n').toEqual([])
  })
})

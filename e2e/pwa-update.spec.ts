import { createServer } from 'node:http'
import { expect, test } from '@playwright/test'
import { connect, mockApi } from './support/fixtures'

test.use({ serviceWorkers: 'allow' })

test('each tab reloads only after confirming the available PWA update', async ({
  context,
  page,
  baseURL,
}) => {
  test.skip(!!process.env.E2E_DEV, 'Service Worker updates require a production build')
  let revision = 1
  // Serve the production build on its own origin. Change the worker bytes without rebuilding
  // or affecting the preview server used by the other tests.
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', baseURL)
      const asset = await fetch(url)
      const type = asset.headers.get('content-type')
      if (type) response.setHeader('content-type', type)
      response.setHeader('cache-control', 'no-store')
      response.statusCode = asset.status
      if (url.pathname === '/sw.js') {
        response.end(`${await asset.text()}\n// Test revision ${revision}\n`)
      } else {
        response.end(Buffer.from(await asset.arrayBuffer()))
      }
    } catch {
      response.writeHead(502).end()
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing preview port')
  const url = `http://127.0.0.1:${address.port}/`
  try {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page, { staleHeartbeat: true })
    await page.goto(url)
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    await page.reload()
    await connect(page)
    const heartbeat = page.locator('.global-notices .v-alert').filter({ hasText: '心跳延迟' })
    await expect(heartbeat).toBeVisible()
    const second = await context.newPage()
    await second.goto(url)
    await expect.poll(() => second.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)

    revision = 2
    await second.reload()
    const firstNotice = page.locator('.global-notices .v-alert').filter({
      hasText: '有新版本可用',
    })
    const secondNotice = second.locator('.global-notices--standalone .v-alert')
    const firstUpdate = firstNotice.getByRole('button', { name: '立即更新', exact: true })
    const secondUpdate = secondNotice.getByRole('button', { name: '立即更新', exact: true })
    await expect(firstUpdate).toBeVisible()
    await expect(secondUpdate).toBeVisible()
    await expect(firstNotice).toHaveClass(/text-info/)
    await expect(heartbeat).toHaveClass(/text-warning/)
    const body = firstNotice.getByText('更新后将重新载入此页面。', { exact: true })
    const [warningBox, noticeBox, bodyBox, buttonBox] = await Promise.all(
      [heartbeat, firstNotice, body, firstUpdate].map((item) => item.boundingBox()),
    )
    expect(noticeBox!.width).toBe(warningBox!.width)
    expect(noticeBox!.y).toBeGreaterThanOrEqual(warningBox!.y + warningBox!.height)
    expect(buttonBox!.x).toBeCloseTo(bodyBox!.x)
    expect(buttonBox!.y).toBeGreaterThanOrEqual(bodyBox!.y + bodyBox!.height)
    const loginBox = await second.locator('.connect').boundingBox()
    const standaloneBox = await secondNotice.boundingBox()
    expect(loginBox!.y).toBeGreaterThanOrEqual(standaloneBox!.y + standaloneBox!.height)

    // Keep a transient value in the document to detect any unsolicited reload.
    await page.evaluate(() => {
      document.documentElement.dataset.keepUntilConfirmed = 'yes'
    })
    await Promise.all([second.waitForEvent('load'), secondUpdate.click()])
    await expect(page.locator('html')).toHaveAttribute('data-keep-until-confirmed', 'yes')
    await expect(firstUpdate).toBeVisible()
    await Promise.all([page.waitForEvent('load'), firstUpdate.click()])
    await expect(firstUpdate).toBeHidden()
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

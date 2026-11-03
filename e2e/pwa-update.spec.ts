import { createServer } from 'node:http'
import { expect, test } from '@playwright/test'

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
    await page.goto(url)
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    await page.reload()
    const second = await context.newPage()
    await second.goto(url)
    await expect.poll(() => second.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)

    revision = 2
    await second.reload()
    const firstUpdate = page.getByRole('button', { name: '更新', exact: true })
    const secondUpdate = second.getByRole('button', { name: '更新', exact: true })
    await expect(firstUpdate).toBeVisible()
    await expect(secondUpdate).toBeVisible()

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

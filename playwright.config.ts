import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end suite. Runs against the production build served by `vite preview`,
 * with every API call answered from local fixtures (see `e2e/support/fixtures.ts`).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    // The interface follows the browser language; pin it so assertions stay stable.
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    // The offline shell is verified by hand; blocked here to keep runs deterministic.
    serviceWorkers: 'block',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run preview -- --port 4173',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})

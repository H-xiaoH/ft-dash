import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig, loadEnv } from 'vite'

/**
 * The build's own version, in `YY.MM.dd.HH.mm`. A dashboard nobody redeploys on a schedule
 * is easier to pin down by when it was built than by a hand-kept semver, and this is what
 * the settings page shows next to the bot's own version. `package.json` keeps a semver:
 * npm needs one, and nothing reads it at runtime.
 */
function buildStamp(now = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    pad(now.getFullYear() % 100),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
  ].join('.')
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = env.VITE_BASE || '/'
  const devProxyTarget = env.FT_DEV_PROXY_TARGET
  // The manifest cannot follow the browser the way the UI does, so the build decides it.
  const appLang = env.VITE_APP_LANG || 'zh-CN'

  return {
    base,
    define: {
      __APP_VERSION__: JSON.stringify(buildStamp()),
    },
    plugins: [
      vue(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'robots.txt'],
        manifest: {
          // Display name shown by the OS; `short_name` is the launcher label.
          name: 'Freqtrade Dashboard',
          short_name: 'FT Dash',
          description:
            'Live trading console for Freqtrade bots: positions, P&L, logs and system health.',
          lang: appLang,
          start_url: base,
          scope: base,
          display: 'standalone',
          orientation: 'any',
          background_color: '#000000',
          theme_color: '#000000',
          categories: ['finance', 'productivity'],
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'pwa-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
          // Authenticated bot data must never be served from a cache.
          navigateFallbackDenylist: [/\/api\//],
          cleanupOutdatedCaches: true,
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: devProxyTarget
      ? {
          proxy: {
            '/ft-api': {
              target: devProxyTarget,
              changeOrigin: true,
              secure: true,
              ws: true,
              rewrite: (path: string) => path.replace(/^\/ft-api/, '/api/v1'),
            },
          },
        }
      : undefined,
    build: {
      target: 'es2022',
    },
  }
})

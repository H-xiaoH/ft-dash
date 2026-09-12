import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Injects a Content-Security-Policy into the built index.html.
 *
 * Build-only: the dev server needs inline scripts and eval for HMR, so applying
 * this in development would just break `npm run dev`.
 *
 * `connect-src` has to stay broad because the API host is user-configurable at
 * runtime (proxy mode uses '/api', direct mode can be any origin). The value
 * here is therefore the hard part: no inline scripts, no third-party scripts, no
 * object/embed, no base-uri hijack, no form hijack.
 *
 * `frame-ancestors` cannot be delivered via <meta> - set it as a response header
 * (see README) to prevent clickjacking of the bot-control buttons.
 */
function cspPlugin() {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    // Components use inline style attributes throughout.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https: http: ws: wss:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-src 'none'",
  ].join('; ')

  return {
    name: 'ft-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
      )
    },
  }
}

/**
 * The freqtrade API only sends CORS headers for origins listed in its
 * `api_server.CORS_origins`. Browsers therefore cannot call it cross-origin: a
 * preflight carrying `Authorization` is answered with "Disallowed CORS origin".
 *
 * We solve that in development with a same-origin proxy - the app always talks to
 * `/api/v1` and Vite forwards it to the real bot. In production the same works if
 * you reverse-proxy `/api` to the bot, or you point the app at an absolute URL and
 * add the app's origin to `CORS_origins`.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_FT_TARGET || 'http://127.0.0.1:8080'
  const proxy = {
    '/api': { target, changeOrigin: true, secure: true, ws: true },
  }

  // Subpath deploys (GitHub Pages serves at /<repo>/) need every absolute URL -
  // route base, PWA scope, manifest icons, SW navigation fallback - to agree.
  const base = env.VITE_BASE || '/'

  return {
    base,
    plugins: [
      vue(),
      cspPlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: null,
        includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
        manifest: {
          name: 'Freqtrade Dashboard',
          short_name: 'FT Dash',
          description: 'A clean, installable dashboard for your freqtrade bot.',
          lang: 'zh-CN',
          theme_color: '#0b0f1a',
          background_color: '#0b0f1a',
          display: 'standalone',
          orientation: 'any',
          start_url: base,
          scope: base,
          categories: ['finance', 'productivity'],
          icons: [
            { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
            { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
            {
              src: `${base}icons/maskable-512.png`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          navigateFallback: `${base}index.html`,
          navigateFallbackDenylist: [/\/api\//],
          // Never cache live trading data - the bot must always be queried fresh.
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkOnly',
            },
          ],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
        },
        devOptions: { enabled: false },
      }),
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: { port: 5173, proxy },
    preview: { port: 4173, proxy },
    build: {
      target: 'es2020',
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          // Rolldown (Vite 8) only accepts the function form here.
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (/[\\/](vue|@vue|vue-router|pinia)[\\/]/.test(id)) return 'vendor'
            return undefined
          },
        },
      },
    },
  }
})

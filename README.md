# ft-dash

A mobile-first, offline-capable web console for [Freqtrade](https://www.freqtrade.io/) bots.
It is a static Vue PWA: your browser talks straight to your bot's REST API, so there is no
backend to host and nothing to trust in the middle.

## What it does

- **Overview** — equity, available balance, position value, open/closed P&L, today's P&L,
  win rate, drawdown, profit factor, a daily P&L chart and the live position list.
- **Trades** — open and closed trades with sorting, search, per-trade detail (orders, fees,
  funding, leverage, stop loss, liquidation) and CSV export. On phones the same data is a
  card list instead of a wide table.
- **Statistics** — performance by pair, entry tag, exit reason and full tag; daily, weekly
  and monthly breakdowns; exit-reason win/loss counts and holding-time averages.
- **Market** — whitelist and blacklist, active pair locks and a candlestick chart for any
  whitelisted pair with the price scale of the latest close.
- **Logs** — live bot log with level filtering, search and a follow toggle.
- **System** — CPU/RAM/load, heartbeat lag warning, process uptime and the effective config
  (strategy, exchange, trading mode, stake, leverage mode).
- **Live events** — a real-time tape fed by the Freqtrade websocket (entries, fills,
  cancellations, protection triggers, warnings, exceptions).
- **Bot controls** — pause/resume entries, stop, reload config, close a position, edit the
  blacklist and release locks. These are *off by default* and require an explicit
  acknowledgement in Settings; destructive actions ask for typed confirmation.

Interface languages: **简体中文** and **English** (follows the browser by default).

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests
npm run build    # production build in dist/
```

Open the app, then enter your API base URL, username and password. Credentials are stored in
this browser only (localStorage, or sessionStorage if you turn "remember" off) and are used
solely as an `Authorization` header toward the API you entered.

### API address

Any of these forms work and are normalised to `…/api/v1`:

| You type | Resolved to |
| --- | --- |
| `bot.example.com` | `https://bot.example.com/api/v1` |
| `https://bot.example.com` | `https://bot.example.com/api/v1` |
| `https://bot.example.com/freqtrade` | `https://bot.example.com/freqtrade/api/v1` |
| `/ft-api` | relative to the current origin (dev proxy, see below) |

### CORS: required for any origin you serve from

A browser will refuse to call your API unless the API allows the origin the app is served
from. Add it to the Freqtrade config and restart the bot:

```json
{
  "api_server": {
    "enabled": true,
    "listen_ip_address": "0.0.0.0",
    "listen_port": 8080,
    "username": "your-api-user",
    "password": "a-long-random-password",
    "jwt_secret_key": "a-long-random-string",
    "CORS_origins": ["https://your-name.github.io", "http://localhost:5173"]
  }
}
```

Include `http://localhost:5173` while developing locally. If you would rather not widen the
CORS list, use the dev proxy instead (see `.env.example`): point `VITE_API_BASE_DEFAULT` at
`/ft-api` and set `FT_DEV_PROXY_TARGET` to the origin serving `/api/v1` in a git-ignored
`.env.local`.

## Deploying to GitHub Pages

1. Push this repository to GitHub.
2. In **Settings → Pages**, set the source to **GitHub Actions**.
3. Push to `main`. The included workflow (`.github/workflows/deploy.yml`) runs the tests,
   builds with `VITE_BASE=/<repo-name>/` and publishes `dist/`.

The app uses hash-based routing, so deep links such as `/#/trades` work on Pages without any
404 rewrite. Serving it from a sub-path is handled by `VITE_BASE`; for a user site or a custom
domain at the root, build with `VITE_BASE=/`.

## Configuration

Nothing is required at build time. Optional environment variables (`.env.local`, git-ignored)
are documented in [`.env.example`](.env.example):

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_DEFAULT` | Pre-fills the API address on the connect screen. Leave empty for a public build. |
| `VITE_BASE` | Public path the app is served from (`/<repo>/` on Pages, `/` for a root domain). |
| `FT_DEV_PROXY_TARGET` | Dev-only proxy target so `npm run dev` can reach an API whose CORS list does not include `localhost:5173`. |

Never commit a real host, username or password: `.env*` files are git-ignored.

## Security notes

- **The app is front-end only.** Anyone who can load the page can see the interface, but no
  data is readable without credentials that pass your bot's basic auth.
- **Serve it over HTTPS** and use a long random API password. The credentials live in the
  visitor's browser, not on a server.
- **Freqtrade logs the websocket URL**, and the token is passed as a query parameter
  (Freqtrade's protocol has no alternative). Console URLs therefore appear in the bot log;
  ft-dash requests a fresh JWT for each connection and never reuses one, so exposure is
  limited to the token's 15-minute lifetime.
- **Nothing is cached from the API.** The service worker precaches only the app shell
  (HTML/CSS/JS/fonts/icons); all `/api/…` traffic is network-only.
- Bot controls stay disabled until you switch them on in Settings, and they act on your live
  account immediately when enabled.

## Compatibility

Built against **Freqtrade 2026.8 / API v2.5** and verified end to end against a live futures
instance. Older releases may lack individual endpoints (`/exits`, `/mix_tags`,
`/pair_candles` column filtering); the affected panels then show an error or stay empty
instead of breaking the app. WebSocket delivery requires the bot's
`api_server.jwt_secret_key`; no separate `ws_token` is needed.

## Tech stack

Vue 3 (`<script setup>` + TypeScript) · Vite · Pinia · vue-router · vue-i18n · VueUse ·
`vite-plugin-pwa` (Workbox) · hand-rolled SVG charts, no chart dependency.

## Project layout

```
src/
  lib/          API client, formatters, CSV, storage helpers
  stores/       settings, bot data + polling, live event tape
  views/        one file per screen
  components/   shell pieces, charts, dialogs
  i18n/         zh-CN and en message catalogues
tests/          unit tests (vitest)
```

## Contributing

Commits follow [gitmoji](https://gitmoji.dev/) (`✨ feat:`, `🐛 fix:`, `📝 docs:`, …). Run
`npm test` and `npm run typecheck` before opening a pull request. New UI strings must be added
to both `src/i18n/locales/zh-CN.ts` and `src/i18n/locales/en.ts`.

## License

[MIT](LICENSE). ft-dash is not affiliated with the Freqtrade project. Trading is risky; this
software comes with no warranty and no financial advice.

# ft-dash

[![Deploy to GitHub Pages](https://github.com/H-xiaoH/ft-dash/actions/workflows/deploy.yml/badge.svg)](https://github.com/H-xiaoH/ft-dash/actions/workflows/deploy.yml)

**English** · [简体中文](README.zh-CN.md)

A mobile-first, installable web console for [Freqtrade](https://www.freqtrade.io/) bots.
It is a static Vue PWA: your browser talks straight to your bot's REST API, so there is no
backend to host and nothing to trust in the middle.

## What it does

- **Overview** — equity, open/closed/today's P&L, trade count and profit factor over a daily
  P&L chart, plus the open positions and recently closed trades.
- **Trades** — open, closed or all trades (all = positions merged with history) with side,
  staked amount, prices, P&L and duration; sortable columns, a search that expands from the
  toolbar, an outcome filter (all / profitable / losing), per-trade detail (orders, fees,
  funding, leverage, stop loss, liquidation) and CSV export. On phones the same data is a
  card list instead of a wide table. 20 rows per page, with a pager that resets whenever the
  filter, search or sort changes.
- **Statistics** — per-pair totals plus win rate, average holding time, fees, volume and last
  close (derived from the loaded trades, so pairs older than the loaded window show —); a
  daily/weekly/monthly chart with period table; and average holding times. Column headers
  sort; the search narrows the list.
- **Market** — a candlestick chart first (drag across it to scrub, with an exchange-style
  OHLC/volume readout in the corner). The chart is marked up: the strategy's buy and sell
  signals ride under and over their candles, and the bot's own fills point in at the price
  they happened at. Then a pair picker, the bot's timeframe, whitelist, blacklist and active
  pair locks.
- **Logs** — live bot log with a level filter, search that expands from the toolbar and a
  follow toggle.
- **System** — CPU/RAM/load, heartbeat lag warning, process uptime, the effective config
  (strategy, exchange, trading mode, stake mode) and the live event tape.
- **Alerts** — optional system notifications for fills, warnings, exceptions, a shutdown
  event and a heartbeat that has been silent for 30 seconds. They fire while the page or the
  installed app is open (background tabs included) — a background tab is checked on a slower
  cadence (every 10 seconds) and the browser throttles it further once the tab has been
  hidden for a few minutes, so a stall there is reported within about a minute rather than
  30 seconds. A closed app cannot be reached at all without a push server, which this
  front-end-only design does not have.
- **Live events** — a real-time tape fed by the Freqtrade websocket (entries, fills,
  cancellations, protection triggers, warnings, exceptions), shown on the System page.
- **Bot controls** — pause/resume entries, stop, reload config, close a position, edit the
  blacklist and release locks. These are *off by default* and require an explicit
  acknowledgement in Settings; destructive actions ask for typed confirmation.

Interface languages: **简体中文** and **English** (follows the browser by default).

On phones you also move between pages by swiping sideways: the page follows your finger, the
neighbour slides in beside it, and releasing past a third of the screen (or a quick flick)
completes the move. Tapping a tab plays the same full-page slide. The bottom bar is not a drag
surface: a touch on it belongs to the tab under the finger, so a wobbling thumb never swallows
a tap. Every other page is held on the track the whole time, so a switch shows no blank and no
loading state as soon as that page's code has arrived — the one page whose code cannot be
fetched at all is the exception, and it says so instead of hanging. The data behind the page is
refreshed once the pages stop changing, so a walk across several tabs fetches once, for the page
it lands on. A sideways swipe still moves one page at a time. The candle chart is the exception
to the pre-loading: its candles are fetched only while the market page is the one on screen.

Pages keep a gutter between them, so a swipe reads as two sheets rather than one long one, and
the bottom bar lights each tab as the block passes over it — mid-swipe, with the finger still
down, included.
Wide screens travel the way the rail reads: a whole page up or down, and the wheel over the
left rail walks pages — one notch is one page, a trackpad's stream keeps walking as you scroll,
and the page behind the rail does not move. The wheel only takes over there.

Data refreshes on a fixed 1-second cadence while the tab is visible (balance, positions,
P&L, CPU/RAM), with heavier slices spread over longer intervals — trades and pair lists every
8 seconds, analytics, logs and config every 24 seconds. Polling stops entirely when the tab is
hidden, and overlapping rounds are skipped rather than queued.

## Quick start

Builds carry a `YY.MM.dd.HH.mm` timestamp as their version, shown at the foot of the settings
page (`package.json` keeps a semver, which npm wants and nothing reads at runtime).

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (vitest)
npm run e2e          # end-to-end tests against the production build (playwright)
npm run lint         # eslint
npm run format:check # prettier, --write to fix
npm run build        # type-check + production build in dist/
```

The end-to-end suite never touches a real bot: it points the app at a fake API origin and
answers every request from fixtures in `e2e/support/fixtures.ts`, so it runs offline and needs
no credentials. First run needs `npx playwright install chromium webkit` to fetch the browsers
(WebKit is Safari's engine; the `webkit` project runs the smoke and accessibility specs on it).

**Browser floor.** Off-screen pages and open dialogs are parked with the native `inert`
attribute, with no polyfill behind it: iOS Safari before 15.5 (May 2022) is not covered, and
there those pages stay in the tab order.

Automation covers rendering, interaction and accessibility rules. These few things can only be
checked on a real device — worth two minutes in Safari with the PWA installed:

1. **Installed mode**: launching from the home screen shows no address bar; the notch and rounded
   corners do not cover content; rotation and window resizing stay aligned.
2. **Updates**: a deploy lands on its own — the app asks for a new worker every minute and
   whenever you come back to the tab, then reloads onto the new build. Nothing to click, and no
   cold start to provoke.
3. **Page gestures**: sideways swipes track the finger and do not flicker; the bottom-bar
   selection follows along; tapping a tab matches what a swipe does, and a sideways drag that
   starts on the bar leaves the pages alone. The tabs light up under the block as it passes. No
   page scrolls past its own content, and the log page fills the window with the list scrolling
   inside it. On wide screens pages slide up and down and the wheel over the rail walks them — a
   notch each for a mouse, continuously for a trackpad — without scrolling the page.
4. **Candles**: dragging scrubs the readout; a dropdown follows its button while the page
   scrolls; the P&L tag stays pinned to the right.
5. **Language**: switching applies immediately; with "follow system" selected, changing the
   system language changes the app when you return to it.
6. **Live stream**: foreground updates tick every second; backgrounding and returning resumes;
   **a fully closed app receives no alerts** — a known limit of a frontend-only app.
7. **Cross-device**: acting on the bot elsewhere shows up here within seconds.

Open the app, then enter your API base URL, username and password. Credentials are stored in
this browser only (localStorage, or sessionStorage if you turn "remember" off) and are used
solely as an `Authorization` header toward the API you entered.

### Several bots

One ft-dash can manage several bots: add, edit and delete them under
**Settings → Bots**, and pick the one in use with "Switch". Exactly one bot is active — it is
the only one polled and the only one with a live stream — so switching swaps the data source
and resets page state such as search, filters, paging and open detail drawers.

- Bots live in this browser only. Passwords stay in the current tab (sessionStorage) unless
  "remember on this device" is on, which writes them to localStorage.
- The UI never shows the active bot's name while you browse; only the confirmation dialogs of
  **write actions** (force exit, start/stop) name the bot they are about to touch. The single
  "bot controls" master switch still governs all of them.
- Every row has "Test connection", which probes that bot on its own client without disturbing
  the active connection.

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

## Authentication

Two transports, two mechanisms — Freqtrade decides which one each accepts:

| Transport | Mechanism | Notes |
| --- | --- | --- |
| REST (`/status`, `/profit`, actions, …) | **HTTP Basic** `Authorization: Basic …` | Always used, and always available. If a cached JWT is rejected (a bot restarted with a new `jwt_secret_key`), the client silently retries that request with Basic, so polling keeps working. |
| `POST /token/login` | **HTTP Basic** | Only called to mint the JWT below. |
| WebSocket (`/message/ws`) | **`?token=` query parameter** | A browser cannot attach an `Authorization` header to a WebSocket handshake, so Basic is impossible here. Freqtrade accepts either a JWT from `/token/login` (requires `api_server.jwt_secret_key`) or the shared `api_server.ws_token`. |

**Live stream auth** is configurable in Settings and defaults to *Automatic*:

1. **Automatic (JWT)** — fetch a 15-minute JWT from `/token/login` for each connection. If the
   endpoint is missing (old Freqtrade, no `jwt_secret_key`), or the handshake is refused, the
   app falls back to your `ws_token` when one is set.
2. **ws_token** — use the shared secret from `api_server.ws_token` directly. Useful behind a
   reverse proxy, or when you do not want to expose credentials to the login endpoint.
3. **Disable stream** — poll only. Everything except the live event tape keeps working.

Failures are explicit rather than silent: a rejected handshake (Freqtrade answers `403` for a
bad token; the browser cannot see a close code) surfaces as "handshake rejected — token
refused, or your proxy does not forward Upgrade requests", and automatic retries stop after
three attempts so a broken config cannot spin. Polling is unaffected — Basic auth still works.

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
instance. It reads `/ping`, `/show_config`, `/version`, `/health`, `/sysinfo`, `/balance`,
`/profit`, `/profit_all`, `/status`, `/count`, `/trades`, `/performance`, `/stats`,
`/daily`, `/weekly`, `/monthly`, `/logs`, `/whitelist`, `/blacklist`, `/locks` and
`/pair_candles`, and posts to `/start`, `/stop`, `/stopentry`, `/reload_config`, `/forceexit`,
`/blacklist` and `/locks/delete` when controls are enabled.

The day, week and month reports are the bot's own, bucketed in UTC — the same days the bot and
the exchange work in. **Settings → Time zone** (the browser's own zone by default, UTC for the
exchanges' clock) decides how *times* are shown: a trade closed at 23:30 UTC reads as 07:30 the
next morning in Shanghai. It does not move the report boundaries.

Older releases may lack individual endpoints (for example `/pair_candles` column filtering or
`/stats` durations); the affected panel then shows an error or stays empty instead of
breaking the app. WebSocket delivery needs either `api_server.jwt_secret_key` (for automatic
JWT auth) or a configured `api_server.ws_token`.

## Tech stack

Vue 3 (`<script setup>` + TypeScript) · Vite · Pinia · vue-router · vue-i18n ·
`vite-plugin-pwa` (Workbox) · Vitest + Playwright · hand-rolled SVG charts, no chart dependency.

## Project layout

```
src/
  lib/          API client, formatters, axis scale, pair statistics, CSV, storage helpers
  stores/       settings, bot data + polling, live event tape
  views/        one file per screen
  components/   shell pieces, hand-rolled charts, toolbar controls, dialogs
  composables/  locale-bound formatters, toasts, responsive chart heights
  i18n/         zh-CN and en message catalogues
tests/          unit tests (vitest)
```

## Contributing

Commits follow [gitmoji](https://gitmoji.dev/) (`✨ feat:`, `🐛 fix:`, `📝 docs:`, …). Run
`npm run lint`, `npm run format:check`, `npm test` and `npm run e2e` before opening a pull
request; CI runs the same set. New UI strings must be added to both
`src/i18n/locales/zh-CN.ts` and `src/i18n/locales/en.ts` (the two catalogues are expected to
stay key-for-key identical). Participation is covered by the
[Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE). ft-dash is not affiliated with the Freqtrade project. Trading is risky; this
software comes with no warranty and no financial advice.

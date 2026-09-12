/**
 * End-to-end render smoke test (no browser required).
 *
 * Boots the real app through Vite, stubs `fetch` with realistic freqtrade
 * payloads, then drives the actual code path: client.js -> endpoints.js -> stores
 * -> renderToString for every route. Because the fixtures mirror the real API
 * (wrapped envelopes, millisecond timestamps, 5-element log rows) this catches
 * shape regressions that a build alone cannot.
 *
 *   node scripts/smoke-render.mjs [--dump <dir>]
 */
import { createServer } from 'vite'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

/* ------------------------------------------------------- minimal DOM stubs */

const storage = new Map()
globalThis.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
}
globalThis.document = {
  documentElement: { dataset: {} },
  querySelector: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
  title: '',
}
// `navigator` is a getter-only global in modern Node, so redefine rather than assign.
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'node-smoke' },
  configurable: true,
  writable: true,
})
globalThis.location = {
  href: 'http://localhost/',
  origin: 'http://localhost',
  pathname: '/',
  search: '',
  hash: '',
  host: 'localhost',
}
globalThis.window = globalThis
globalThis.matchMedia = () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
})
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0)

/* --------------------------------------------------------------- fixtures */

const trade = (id, overrides = {}) => ({
  trade_id: id,
  pair: 'ETH/USDT:USDT',
  base_currency: 'ETH',
  quote_currency: 'USDT',
  is_open: true,
  is_short: false,
  exchange: 'okx',
  strategy: 'NostalgiaForInfinityX7',
  amount: 1.2345,
  amount_requested: 1.2345,
  stake_amount: 2500.5,
  max_stake_amount: 2500.5,
  open_rate: 2010.25,
  open_rate_requested: 2010.25,
  open_trade_value: 2481.65,
  current_rate: 2055.8,
  close_rate: null,
  open_date: '2026-09-10 04:12:33',
  // Real freqtrade returns milliseconds.
  open_timestamp: 1788939622807,
  open_fill_date: '2026-09-10 04:12:33',
  open_fill_timestamp: 1788939622708,
  close_date: null,
  close_timestamp: null,
  enter_tag: 'breakout',
  exit_reason: null,
  leverage: 3,
  fee_open: 0.0005,
  fee_close: 0.0003125,
  profit_ratio: 0.0678,
  profit_pct: 6.78,
  profit_abs: 169.25,
  total_profit_abs: 169.25,
  stop_loss_abs: 1900.1,
  stop_loss_ratio: -0.05,
  initial_stop_loss_abs: 1900.1,
  initial_stop_loss_ratio: -0.05,
  has_open_orders: false,
  orders: [
    {
      order_id: 'abc-1',
      ft_order_side: 'buy',
      status: 'closed',
      average: 2010.25,
      price: 2010.25,
      amount: 1.2345,
      filled: 1.2345,
      order_type: 'limit',
    },
  ],
  ...overrides,
})

const closedTrade = (id, overrides = {}) =>
  trade(id, {
    is_open: false,
    close_rate: 2100.4,
    current_rate: 2100.4,
    close_date: '2026-09-11 09:45:00',
    close_timestamp: 1788956417061,
    exit_reason: 'exit_long_rebuy_d_1_119 ( 64 )',
    profit_ratio: 0.0445,
    profit_pct: 4.45,
    profit_abs: 111.4,
    ...overrides,
  })

const dailyRow = (date, abs, rel, trades) => ({
  date,
  abs_profit: abs,
  rel_profit: rel,
  starting_balance: 105 + abs,
  fiat_value: abs,
  trade_count: trades,
})

const FIXTURES = {
  '/show_config': {
    version: '2026.8',
    strategy_version: 'v17.5.70',
    api_version: 2.37,
    state: 'running',
    runmode: 'live',
    dry_run: false,
    trading_mode: 'futures',
    margin_mode: 'isolated',
    short_allowed: true,
    strategy: 'NostalgiaForInfinityX7',
    timeframe: '5m',
    exchange: 'okx',
    bot_name: 'freqtrade',
    stake_currency: 'USDT',
    max_open_trades: 6,
    available_capital: 103.2,
  },
  // Real /version only carries the version string.
  '/version': { version: '2026.8' },
  '/health': {
    last_process: '2026-09-12 03:10:19',
    last_process_ts: 1789182619601,
    bot_start: '2026-09-09 07:40:22',
    bot_start_ts: 1788939622807,
    bot_startup: '2026-09-09 07:40:25',
    bot_startup_ts: 1788939625000,
  },
  '/sysinfo': {
    cpu_pct: [0, 0, 0, 0, 9.1, 0, 0, 0],
    cpu_load: [
      { cpu: 0, pct: 0 },
      { cpu: 4, pct: 9.1 },
    ],
    cpu_load_avg: { '1m': 0.435546875, '5m': 0.4111328125, '15m': 0.4375 },
    cpu_count: 8,
    cpu_avg: 1.1375,
    ram_pct: 62.2,
  },
  '/profit': {
    profit_closed_coin: 2.50509221,
    profit_closed_percent_mean: 7.03,
    profit_closed_ratio_mean: 0.07033698044138531,
    profit_closed_percent: 2.42,
    profit_closed_ratio: 0.024150557429249816,
    profit_closed_fiat: 2.50483919568679,
    profit_all_coin: 1.99886349,
    profit_all_percent_mean: 3.32,
    profit_all_ratio_mean: 0.033232826353108244,
    profit_all_percent: 1.93,
    profit_all_ratio: 0.019270215809132116,
    profit_all_fiat: 1.9986616047875099,
    trade_count: 5,
    closed_trade_count: 4,
    first_trade_date: '2026-09-09 07:40:22',
    latest_trade_date: '2026-09-11 17:50:15',
    avg_duration: '2:09:24',
    best_pair: 'RAY/USDT:USDT',
    best_rate: 7.96,
    winning_trades: 4,
    losing_trades: 0,
    profit_factor: null, // the real bot returns null when there are no losses
    winrate: 1,
    expectancy: 0.626273,
    expectancy_ratio: 100,
    sharpe: 69.9480009810093,
    // Real bots return -100 for these when there is not enough data.
    sortino: -100,
    calmar: -100,
    sqn: 3.1707,
    cagr: 73.59372346501677,
    max_drawdown: 0,
    max_drawdown_abs: 0,
    current_drawdown: 0,
    trading_volume: 258.01709,
    stake_currency: 'USDT',
    starting_capital: 103.2,
    bot_start_date: '2026-09-09 07:40:22',
  },
  '/balance': {
    currencies: [
      {
        currency: 'USDT',
        free: 102.8838198319825,
        balance: 107.28357362860208,
        used: 3.97628379661959,
        est_stake: 102.8838198319825,
        stake: 'USDT',
        is_position: false,
      },
      {
        currency: 'GALA/USDT:USDT',
        free: 0,
        balance: 0,
        est_stake: 4.495465475199996,
        stake: 'USDT',
        is_position: true,
        position: 7990,
      },
    ],
    total: 107.3792853071825,
    symbol: 'USD',
    value: 107.36843999936647,
    stake: 'USDT',
    starting_capital: 103.2,
  },
  '/count': { current: 1, max: 6, total_stake: 3.97628379661959 },
  '/status': [
    trade(1),
    trade(2, { pair: 'BTC/USDT:USDT', is_short: true, leverage: 5, profit_ratio: -0.0182, profit_pct: -1.82, profit_abs: -45.6 }),
  ],
  '/performance': [
    { pair: 'RAY/USDT:USDT', profit_abs: 1.68678054, profit_ratio: 0.0795841399202325, profit_pct: 7.96, count: 1, profit: 1.68678054 },
    { pair: 'MEGA/USDT:USDT', profit_abs: 0.12017927, profit_ratio: 0.03557190547109767, profit_pct: 3.56, count: 1, profit: 0.12017927 },
    { pair: 'GALA/USDT:USDT', profit_abs: -0.50622872, profit_ratio: -0.11518379, profit_pct: -11.52, count: 2, profit: -0.50622872 },
  ],
  // Real /stats has only these two keys; durations are plain seconds.
  '/stats': {
    exit_reasons: {
      'exit_long_rebuy_d_1_119 ( 64 )': { wins: 1, losses: 0, draws: 0 },
      'exit_long_rapid_d_2_120 ( 101 )': { wins: 1, losses: 0, draws: 0 },
      exit_long_stoploss: { wins: 0, losses: 2, draws: 1 },
    },
    durations: { wins: 7764.158535, draws: null, losses: null },
  },
  // Newest first, wrapped in an envelope - exactly like the real API.
  '/daily?timescale=30': {
    data: [
      dailyRow('2026-09-12', 0, 0, 0),
      dailyRow('2026-09-11', 0.60613454, 0.0057398, 1),
      dailyRow('2026-09-10', 0, 0, 0),
      dailyRow('2026-09-09', 1.9, 0.018, 3),
    ],
    fiat_display_currency: 'USD',
    stake_currency: 'USDT',
  },
  '/weekly?timescale=12': {
    data: [dailyRow('2026-09-12', 0.6, 0.005, 1), dailyRow('2026-09-05', 1.9, 0.018, 3)],
    fiat_display_currency: 'USD',
    stake_currency: 'USDT',
  },
  '/monthly?timescale=12': {
    data: [dailyRow('2026-09', 2.5, 0.024, 4)],
    fiat_display_currency: 'USD',
    stake_currency: 'USDT',
  },
  '/trades?limit=50&offset=0': {
    trades: [
      closedTrade(5, { pair: 'MEGA/USDT:USDT' }),
      closedTrade(3, { pair: 'SOL/USDT:USDT', exit_reason: 'exit_long_stoploss', profit_ratio: -0.031, profit_abs: -0.0782 }),
      closedTrade(2, { pair: 'XRP/USDT:USDT', is_short: true, exit_reason: 'roi', profit_ratio: 0.021, profit_abs: 0.0529 }),
    ],
    trades_count: 3,
    offset: 0,
    total_trades: 3,
  },
  '/whitelist': {
    whitelist: ['PEPE/USDT:USDT', 'SHIB/USDT:USDT', 'BTC/USDT:USDT'],
    length: 3,
    method: ['VolumePairList', 'FullTradesFilter', 'AgeFilter'],
  },
  '/blacklist': { blacklist: ['DOGE/USDT:USDT'], blacklist_expanded: [], errors: {}, length: 1, method: ['StaticPairList'] },
  '/locks': {
    lock_count: 1,
    locks: [
      {
        id: 1,
        pair: 'XRP/USDT:USDT',
        lock_end_time: '2026-09-12 12:00:00',
        lock_end_timestamp: 1789214400000,
        reason: 'Stoploss guard',
        active: true,
        side: 'long',
      },
    ],
  },
  // Newer freqtrade: [date, timestamp_ms, logger, level, message]
  '/logs?limit=200': {
    log_count: 3,
    logs: [
      ['2026-09-12 03:08:14', 1789182494507.9314, 'freqtrade.worker', 'INFO', "Bot heartbeat. PID=1, version='2026.8, state='RUNNING'"],
      ['2026-09-12 03:09:14', 1789182554510.3042, 'freqtrade.persistence', 'WARNING', 'Unable to fetch ticker'],
      ['2026-09-12 03:10:19', 1789182619601.3083, 'freqtrade.exchange', 'ERROR', 'Exchange error: rate limit'],
    ],
  },
  '/pair_candles?pair=PEPE/USDT:USDT&timeframe=5m&limit=300': {
    strategy: 'NostalgiaForInfinityX7',
    pair: 'PEPE/USDT:USDT',
    timeframe: '5m',
    timeframe_ms: 300000,
    columns: ['date', 'open', 'high', 'low', 'close', 'volume', 'RSI_14', 'EMA_12', 'enter_long', 'exit_long'],
    data: Array.from({ length: 60 }, (_, i) => {
      const base = 0.0000033 + i * 1e-9
      return [
        new Date(1789100000000 + i * 300000).toISOString(),
        base,
        base * 1.003,
        base * 0.997,
        base * 1.001,
        78565000000 + i,
        40 + (i % 20),
        base * 1.0002,
        0,
        0,
      ]
    }),
    length: 60,
  },
}

// Endpoints that legitimately fail while the bot is running.
const FAILURES = {
  '/strategies': { status: 503, body: { detail: 'Bot is not in the correct state.' } },
  '/available_pairs': { status: 503, body: { detail: 'Bot is not in the correct state.' } },
  '/plot_config': { status: 200, body: { main_plot: {}, subplots: {} } },
}

/* ----------------------------------------------------- fetch interception */

const requests = []

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url
  const path = url.replace(/^https?:\/\/[^/]+/, '')
  const headers = init.headers || {}
  const record = {
    method: init.method || 'GET',
    path,
    authorization: headers.Authorization || headers.authorization || '',
    cache: init.cache || '',
    matched: true,
  }
  requests.push(record)

  const clean = path.replace(/^\/api\/v1/, '')
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })

  if (clean === '/ping') return json({ status: 'pong' })
  if (clean === '/token/login') return json({ access_token: 'smoke-access', refresh_token: 'smoke-refresh' })
  if (clean === '/token/refresh') return json({ access_token: 'smoke-access-2', refresh_token: 'smoke-refresh' })

  if (FAILURES[clean]) return json(FAILURES[clean].body, FAILURES[clean].status)
  if (FIXTURES[clean]) return json(FIXTURES[clean])

  // Fall back to a prefix match so query strings do not need to match exactly.
  const key = Object.keys(FIXTURES).find((candidate) => candidate.split('?')[0] === clean.split('?')[0])
  if (key) return json(FIXTURES[key])

  record.matched = false
  return json({ detail: `No smoke fixture for ${clean}` }, 404)
}

/* ------------------------------------------------------------------- main */

const EXPECTATIONS = [
  ['/', ['账户总资产', '累计盈亏']],
  ['/trades', ['持仓中', '历史 (3)']],
  ['/charts', ['K线图', '最近 300 根']],
  ['/stats', ['盈亏比', '盈利交易', '持仓时长']],
  ['/market', ['白名单', 'XRP/USDT', 'Stoploss guard']],
  ['/logs', ['Bot heartbeat', 'INFO']],
  ['/system', ['Freqtrade 版本', 'not in the correct state', '交易模式']],
  ['/settings', ['认证方式', '数据刷新']],
]

const dumpIndex = process.argv.indexOf('--dump')
const dumpDir = dumpIndex > -1 ? process.argv[dumpIndex + 1] : null
if (dumpDir) {
  const { mkdirSync } = await import('node:fs')
  mkdirSync(dumpDir, { recursive: true })
}

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'warn',
})

const [
  { default: App },
  routerModule,
  botModule,
  { useAuthStore },
  clientModule,
  redirectModule,
  pointerModule,
] = await Promise.all([
  server.ssrLoadModule('/src/App.vue'),
  server.ssrLoadModule('/src/router/index.js'),
  server.ssrLoadModule('/src/stores/bot.js'),
  server.ssrLoadModule('/src/stores/auth.js'),
  server.ssrLoadModule('/src/api/client.js'),
  server.ssrLoadModule('/src/utils/safeRedirect.js'),
  server.ssrLoadModule('/src/composables/useChartPointer.js'),
])

const { routes, ROUTER_BASE } = routerModule
const { CORE_KEYS, useBotStore } = botModule
const { session } = clientModule
const { safeRedirectPath } = redirectModule

/** Drives login + refreshAll through the real stores and the stubbed network. */
async function render(path, { authenticated = true } = {}) {
  const errors = []
  const warnings = []

  const pinia = createPinia()
  setActivePinia(pinia)

  const auth = useAuthStore()
  const bot = useBotStore()

  if (authenticated) {
    await auth.connect({
      baseUrl: 'https://bot.example.com/api/v1',
      username: 'smoke-user',
      password: 'smoke',
      remember: true,
    })
    await bot.refreshAll()
    // Keys only some routes need.
    await bot.loadMany(['logs', 'sysinfo', 'strategies'], { silent: true })
  }

  const app = createSSRApp(App)
  app.use(pinia)

  const router = createRouter({ history: createMemoryHistory(), routes })
  app.use(router)

  app.config.errorHandler = (error) => errors.push(error)
  app.config.warnHandler = (message) => warnings.push(message)

  await router.push(path)
  await router.isReady()

  const html = await renderToString(app)
  return { html, errors, warnings, auth, bot }
}

let failures = 0
const renderedPages = new Map()
const check = (label, condition, detail = '') => {
  if (condition) {
    console.log(`✓ ${label}`)
  } else {
    failures += 1
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

for (const [path, needles] of EXPECTATIONS) {
  try {
    const { html, errors, warnings } = await render(path)
    renderedPages.set(path, html)
    if (dumpDir) {
      const { writeFileSync } = await import('node:fs')
      writeFileSync(`${dumpDir}/${path === '/' ? 'dashboard' : path.slice(1)}.html`, html)
    }

    const missing = needles.filter((needle) => !html.includes(needle))
    const problems = []
    if (errors.length) problems.push(`${errors.length} error(s): ${errors[0]?.message}`)
    if (warnings.length) problems.push(`${warnings.length} warning(s): ${warnings[0]}`)
    if (missing.length) problems.push(`missing ${JSON.stringify(missing)}`)

    check(
      `${path.padEnd(10)} renders`,
      problems.length === 0,
      problems.join(' | '),
    )
  } catch (error) {
    failures += 1
    console.log(`✗ ${path.padEnd(10)} threw: ${error?.stack?.split('\n').slice(0, 3).join(' ')}`)
  }
}

// Login screen when there is no session.
try {
  const { html, errors } = await render('/login', { authenticated: false })
  check(
    '/login     renders login screen',
    errors.length === 0 && html.includes('连接机器人'),
    errors[0]?.message || 'missing expected text',
  )
} catch (error) {
  failures += 1
  console.log(`✗ /login     threw: ${error?.message}`)
}

/* ------------------------------------------- data-layer assertions */

const { auth, bot } = await render('/')

check('auth: JWT transport selected', session.mode === 'jwt', `mode=${session.mode}`)
check('auth: session authenticated', auth.authenticated === true)
check(
  'auth: requests carried a bearer token',
  requests.some((r) => r.authorization.startsWith('Bearer ')),
)
check(
  'auth: token/login used basic auth',
  requests.some((r) => r.path.endsWith('/token/login') && r.authorization.startsWith('Basic ')),
)

check('normalize: /trades envelope unwrapped to array', Array.isArray(bot.data.trades) && bot.data.trades.length === 3)
check('normalize: tradesTotal captured', bot.tradesTotal === 3, `got ${bot.tradesTotal}`)
check('normalize: /daily envelope unwrapped to array', Array.isArray(bot.data.daily) && bot.data.daily.length === 4)
check('normalize: /locks envelope unwrapped to array', Array.isArray(bot.data.locks) && bot.data.locks.length === 1)
check('normalize: /logs envelope unwrapped to array', Array.isArray(bot.data.logs) && bot.data.logs.length === 3)

check('trend: daily reversed into chronological order', bot.profitTrend[0]?.date === '2026-09-09', `got ${bot.profitTrend[0]?.date}`)
check('trend: cumulative profit summed oldest-first', Math.abs(bot.profitTrend.at(-1)?.cumulative - 2.50613454) < 1e-6, `got ${bot.profitTrend.at(-1)?.cumulative}`)

check('stats: totalTrades derived from exit reasons', bot.statsSummary.totalTrades === 5, `got ${bot.statsSummary.totalTrades}`)
check('stats: numeric durations normalised', bot.statsSummary.durations.some((d) => d.key === 'wins' && d.avg === 7764.158535))
check('profit: win rate computed from win/loss counts', bot.summary.winRate === 100, `got ${bot.summary.winRate}`)
check('profit: null profit_factor stays null', bot.summary.profitFactor === null)
check(
  'profit: -100 sortino/calmar sentinels surfaced as null',
  bot.summary.sortino === null && bot.summary.calmar === null,
  `sortino=${bot.summary.sortino} calmar=${bot.summary.calmar}`,
)
check('profit: sqn + cagr carried through', bot.summary.sqn === 3.1707 && Math.round(bot.summary.cagr) === 74)
check('profit: zero drawdown stays zero, not null', bot.summary.maxDrawdownAbs === 0)
check('errors: /strategies 503 surfaced, not swallowed', bot.errors.strategies === 'Bot is not in the correct state.', `got "${bot.errors.strategies}"`)
check('errors: core endpoints all succeeded', !bot.errors.profit && !bot.errors.balance && !bot.errors.trades)

const unmatched = requests.filter((r) => !r.matched)
check(
  'network: every request matched a fixture',
  unmatched.length === 0,
  unmatched.map((r) => r.path).join(', '),
)

// The chart view loads candles from a watcher, so assert the request wiring
// rather than the rendered markup.
const candleRequest = requests.find((r) => r.path.includes('/pair_candles'))
check(
  'charts: pair_candles requested with a whitelisted pair + timeframe',
  Boolean(candleRequest) &&
    candleRequest.path.includes('pair=') &&
    candleRequest.path.includes('timeframe=5m') &&
    ['PEPE', 'SHIB', 'BTC'].some((base) => candleRequest.path.includes(base)),
  candleRequest ? candleRequest.path : 'no pair_candles request was made',
)
check(
  'trades: history requested newest-first (order_by_id=false)',
  requests.some((r) => r.path.includes('/trades?') && r.path.includes('order_by_id=false')),
)

/* --------------------------------------------- auto-refresh (poll) contract */

{
  const bot = useBotStore()
  const validKeys = new Set(bot.loaderKeys)
  const byName = Object.fromEntries(routes.map((r) => [r.name, r]))

  // A typo in route meta would silently never fetch anything.
  const unknown = []
  for (const route of routes) {
    for (const key of [...(route.meta?.load || []), ...(route.meta?.poll || [])]) {
      if (!validKeys.has(key)) unknown.push(`${route.name}.${key}`)
    }
  }
  check('routes: every declared slice name exists', unknown.length === 0, unknown.join(', '))

  const pollSetFor = (name) => [
    ...new Set([...CORE_KEYS, ...(byName[name]?.meta?.poll || [])]),
  ]

  // Regression: the System page's stats only refreshed when its button was pressed.
  check('system: sysinfo is in the poll set', pollSetFor('system').includes('sysinfo'))
  check('system: heartbeat/version are polled', ['health', 'version'].every((k) => pollSetFor('system').includes(k)))
  check(
    'system: strategies is NOT polled (it 503s while the bot runs)',
    !pollSetFor('system').includes('strategies'),
  )
  check('logs: logs are polled while the route is open', pollSetFor('logs').includes('logs'))
  check(
    'system: sysinfo is also loaded on entry',
    (byName.system?.meta?.load || []).includes('sysinfo'),
  )

  // Prove the contract end to end: two polling rounds must issue two fresh
  // /sysinfo requests (nothing caches or short-circuits the repeat).
  const sysinfoCount = () => requests.filter((r) => r.path.includes('/sysinfo')).length
  const before = sysinfoCount()
  await bot.loadMany(pollSetFor('system'), { silent: true })
  await bot.loadMany(pollSetFor('system'), { silent: true })
  const after = sysinfoCount()
  check('system: repeated polls keep refetching sysinfo', after - before === 2, `${before} -> ${after}`)
  check('system: sysinfo value stays populated after polling', bot.data.sysinfo?.ram_pct > 0, JSON.stringify(bot.data.sysinfo?.ram_pct))

  // And the default core poll must not carry the heavy page-specific slices.
  const coreOnly = [...new Set(CORE_KEYS)]
  check(
    'default poll stays lean (no sysinfo/logs)',
    !coreOnly.includes('sysinfo') && !coreOnly.includes('logs'),
    coreOnly.join(', '),
  )
}

/* ------------------------------------------- geometry / layout assertions */

/**
 * An SVG stroke straddles its path, so a circle clips flat once
 * `r + strokeWidth / 2` exceeds half the viewBox. Only the donut uses a
 * 100x100 viewBox.
 */
function overflowingCircles(html) {
  const problems = []
  for (const svg of html.matchAll(/<svg[^>]*viewBox="0 0 100 100"[^>]*>([\s\S]*?)<\/svg>/g)) {
    for (const circle of svg[1].matchAll(/<circle\b[^>]*>/g)) {
      const tag = circle[0]
      const r = Number((tag.match(/\br="([\d.]+)"/) || [])[1])
      const stroke = Number((tag.match(/stroke-width="([\d.]+)"/) || [])[1] ?? 0)
      if (Number.isFinite(r) && r + stroke / 2 > 50) {
        problems.push(`r=${r} stroke=${stroke} reaches ${r + stroke / 2} > 50`)
      }
    }
  }
  return problems
}

for (const path of ['/', '/stats']) {
  const html = renderedPages.get(path) || ''
  const problems = overflowingCircles(html)
  check(
    `layout: donut ring inside its viewBox on ${path}`,
    html.includes('viewBox="0 0 100 100"') && problems.length === 0,
    problems.join('; ') || 'no donut rendered',
  )
}

/* ------------------------------- "don't remember me" must not break the session */

{
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth2 = useAuthStore()
  const bot2 = useBotStore()

  await auth2.connect({
    baseUrl: 'https://bot.example.com/api/v1',
    username: 'smoke-user',
    password: 'smoke',
    remember: false,
  })
  await bot2.load('profit')

  check('remember=false: still authenticated', auth2.authenticated === true)
  check('remember=false: transport stays JWT', session.mode === 'jwt', `mode=${session.mode}`)
  check('remember=false: requests still authorised', !bot2.errors.profit, bot2.errors.profit || 'ok')
  check(
    'remember=false: secrets kept out of storage',
    !/(password|refreshToken|accessToken)/.test(localStorage.getItem('ft.auth') || ''),
    localStorage.getItem('ft.auth') || '',
  )

  const persisted = JSON.parse(localStorage.getItem('ft.auth') || '{}')
  check('remember=false: base url still persisted', persisted.baseUrl === 'https://bot.example.com/api/v1')
}

/* -------------------------------------------------- chart pointer / touch */

{
  const { useChartPointer } = pointerModule
  const event = (over = {}) => ({
    pointerType: 'mouse',
    buttons: 0,
    pointerId: 1,
    clientX: 10,
    currentTarget: { setPointerCapture() {} },
    ...over,
  })

  // Touch pointers never hover: a tap fires no pointermove, and lifting the finger
  // destroys the pointer, which fires pointerleave. Those are the broken cases.
  const touch = useChartPointer((e) => e.clientX)

  touch.onPointerDown(event({ pointerType: 'touch', clientX: 7 }))
  check('touch: a tap shows the value', touch.hoverIndex.value === 7, String(touch.hoverIndex.value))

  touch.onPointerMove(event({ pointerType: 'touch', buttons: 0, clientX: 99 }))
  check('touch: a lifted finger does not scrub', touch.hoverIndex.value === 7, String(touch.hoverIndex.value))

  touch.onPointerMove(event({ pointerType: 'touch', buttons: 1, clientX: 42 }))
  check('touch: dragging scrubs', touch.hoverIndex.value === 42, String(touch.hoverIndex.value))

  touch.onPointerLeave(event({ pointerType: 'touch' }))
  check('touch: lifting keeps the value readable', touch.hoverIndex.value === 42, String(touch.hoverIndex.value))

  touch.onPointerCancel(event({ pointerType: 'touch' }))
  check('touch: a scroll taking over clears it', touch.hoverIndex.value === -1, String(touch.hoverIndex.value))

  const mouse = useChartPointer((e) => e.clientX)
  mouse.onPointerMove(event({ clientX: 5 }))
  check('mouse: hovering tracks without pressing', mouse.hoverIndex.value === 5)
  mouse.onPointerLeave(event({}))
  check('mouse: leaving clears', mouse.hoverIndex.value === -1)

  let captured = false
  const capturing = useChartPointer((e) => e.clientX)
  capturing.onPointerDown(
    event({
      pointerType: 'touch',
      clientX: 3,
      currentTarget: {
        setPointerCapture: () => {
          captured = true
        },
      },
    }),
  )
  check('touch: pointer capture is requested so drags survive leaving the plot', captured)

  const throwing = useChartPointer((e) => e.clientX)
  throwing.onPointerDown(
    event({
      pointerType: 'touch',
      clientX: 9,
      currentTarget: {
        setPointerCapture() {
          throw new Error('nope')
        },
      },
    }),
  )
  check(
    'touch: a capture failure still shows the value',
    throwing.hoverIndex.value === 9,
    String(throwing.hoverIndex.value),
  )

  const outOfRange = useChartPointer(() => null)
  outOfRange.onPointerDown(event({ clientX: 1 }))
  check('a resolver returning null leaves the value untouched', outOfRange.hoverIndex.value === -1)
}

/* ------------------------------------------- chart event wiring (compiled) */

{
  // Listener props are invisible in the source and in SSR output, so compile the
  // components for the client and assert the bindings are actually there. This is
  // the check that catches `v-on="handlers"` emitting `on:onPointerDown` - a custom
  // event name that never fires, which silently killed mouse hover AND touch.
  const EVENTS = ['onPointerdown', 'onPointermove', 'onPointerleave', 'onPointercancel']
  for (const name of ['AreaChart', 'BarChart', 'CandleChart']) {
    const { code } = await server.transformRequest(
      `/src/components/charts/${name}.vue`,
      { ssr: false },
    )
    const missing = EVENTS.filter((event) => !new RegExp(`\\b${event}\\b`).test(code))
    check(
      `charts: ${name} binds all four pointer events`,
      missing.length === 0,
      missing.length ? `missing ${missing.join(', ')}` : '',
    )
    check(
      `charts: ${name} avoids the v-on object form`,
      !/toHandlers\(/.test(code),
      'v-on="obj" needs bare lowercase keys - use explicit @pointerdown bindings',
    )
  }
}

/* ------------------------------------------------- routing / subpath deploy */

{
  const expectedBase = process.env.VITE_BASE || '/'
  check(
    'router: history base equals the vite base',
    ROUTER_BASE === expectedBase,
    `ROUTER_BASE=${JSON.stringify(ROUTER_BASE)} expected=${JSON.stringify(expectedBase)}`,
  )

  // The bug this guards: `createWebHistory()` with no argument silently defaults to
  // "/", so a subpath deploy matches nothing and the catch-all rewrites the URL to
  // the site root. Asserting the export alone would not catch that, so also pin the
  // call site.
  const routerSource = (await import('node:fs')).readFileSync('src/router/index.js', 'utf8')
  check(
    'router: createWebHistory is constructed with the base',
    /createWebHistory\(\s*ROUTER_BASE\s*\)/.test(routerSource),
    'router/index.js must pass ROUTER_BASE to createWebHistory',
  )

  // App-relative navigation must keep working whatever the base is.
  const r = createRouter({ history: createMemoryHistory(ROUTER_BASE), routes })
  check(
    'router: app-relative deep links resolve',
    r.resolve('/trades').name === 'trades' && r.resolve('/').name === 'dashboard',
    `trades=${String(r.resolve('/trades').name)} root=${String(r.resolve('/').name)}`,
  )

  // resolve() does not follow redirects, so exercise the catch-all by navigating.
  await r.push('/definitely-not-a-route')
  await r.isReady()
  check(
    'router: unknown paths redirect to the dashboard',
    r.currentRoute.value.name === 'dashboard',
    `landed on ${String(r.currentRoute.value.name)}`,
  )
}

/* ------------------------------------------------------ security invariants */

/** A value that must never appear in localStorage; distinct from the token fixture. */
const PASSWORD_CANARY = 'canary-DO-NOT-PERSIST-42'

{
  // 1. The password must never reach localStorage - only a revocable refresh token.
  //    Set the state up explicitly rather than depending on earlier blocks.
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth3 = useAuthStore()
  const bot3 = useBotStore()
  await auth3.connect({
    baseUrl: 'https://bot.example.com/api/v1',
    username: 'smoke-user',
    password: PASSWORD_CANARY,
    remember: true,
  })

  const persisted = localStorage.getItem('ft.auth') || '{}'
  const saved = JSON.parse(persisted)
  check(
    'security: password is never persisted',
    !('password' in saved) && !persisted.includes(PASSWORD_CANARY),
    persisted,
  )
  check(
    'security: refresh token is persisted instead',
    typeof saved.refreshToken === 'string' && saved.refreshToken.length > 0,
    persisted,
  )
  check('security: mode recorded as jwt', saved.mode === 'jwt', String(saved.mode))

  // 2. Logging out must wipe every stored secret.
  auth3.logout()
  const afterLogout = localStorage.getItem('ft.auth') || '{}'
  check(
    'security: logout clears stored secrets',
    !afterLogout.includes(PASSWORD_CANARY) && !JSON.parse(afterLogout).refreshToken,
    afterLogout,
  )
  void bot3

  // 3. Credentials embedded in the base URL must be stripped before they get
  //    persisted, rendered in Settings, or echoed inside error messages.
  const stripped = clientModule.normalizeBaseUrl('https://user:s3cret@ft.example.com')
  check(
    'security: userinfo stripped from base url',
    stripped === 'https://ft.example.com/api/v1' && !stripped.includes('s3cret'),
    stripped,
  )

  // 4. The post-login redirect is attacker-controllable via ?redirect=.
  const redirects = [
    ['/trades', '/trades'],
    ['//evil.example.com', null],
    ['https://evil.example.com', null],
    ['/\\evil.example.com', null],
    ['', null],
    [undefined, null],
  ]
  const badRedirect = redirects.filter(([input, expected]) => safeRedirectPath(input) !== expected)
  check(
    'security: off-site login redirects rejected',
    badRedirect.length === 0,
    badRedirect.map(([input]) => JSON.stringify(input)).join(', '),
  )

  // 5. Trading data must not be written to the on-disk HTTP cache.
  const cacheable = requests.filter(
    (r) => r.path.startsWith('/api/') && r.cache !== 'no-store',
  )
  check(
    'security: every API request uses cache: no-store',
    cacheable.length === 0,
    cacheable.map((r) => r.path).slice(0, 3).join(', '),
  )

  // 6. A bare username must never produce a Basic header with an empty password.
  check(
    'security: no Authorization header when only a username is known',
    !requests.some((r) => r.authorization.startsWith('Basic ') && r.authorization.endsWith('Og==')),
    'found "Basic <user>:" style header',
  )
}

/* ------------------------------------------------------------- summary */

await server.close()

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
process.exit(failures ? 1 : 0)

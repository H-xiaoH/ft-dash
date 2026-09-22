import type { Page } from '@playwright/test'

/**
 * Offline fixtures for the end-to-end suite.
 *
 * The tests never touch a real bot: the app is pointed at a fake API origin and every
 * request is answered from here, so the suite is deterministic and needs no credentials.
 */
export const API_ORIGIN = 'https://api.example.test'
export const API_BASE = `${API_ORIGIN}/api/v1`
export const USERNAME = 'tester'
export const PASSWORD = 'secret'

const DAY = 86_400_000
const NOW = Date.parse('2026-09-20T12:00:00Z')

function trade(id: number, pair: string, overrides: Record<string, unknown> = {}) {
  const open = NOW - 6 * 3_600_000
  const close = NOW - 3_600_000
  return {
    trade_id: id,
    pair,
    base_currency: pair.split('/')[0],
    quote_currency: 'USDT',
    is_open: false,
    is_short: false,
    exchange: 'okx',
    amount: 100,
    amount_requested: 100,
    stake_amount: 10,
    max_stake_amount: 10,
    strategy: 'TestStrategy',
    enter_tag: 'tag-a',
    timeframe: '5m',
    fee_open: 0.0005,
    fee_open_cost: 0.005,
    fee_close: 0.0005,
    fee_close_cost: 0.005,
    open_date: new Date(open).toISOString(),
    open_timestamp: open,
    open_rate: 1,
    open_trade_value: 10,
    close_date: new Date(close).toISOString(),
    close_timestamp: close,
    close_rate: 1.1,
    profit_ratio: 0.1,
    profit_pct: 10,
    profit_abs: 1,
    exit_reason: 'exit_signal',
    leverage: 3,
    orders: [
      {
        order_id: `o-${id}`,
        status: 'closed',
        order_type: 'limit',
        ft_order_side: 'entry',
        price: 1,
        average: 1,
        amount: 100,
        filled: 100,
        order_timestamp: open,
      },
    ],
    ...overrides,
  }
}

const openTrade = trade(99, 'OPEN/USDT', {
  is_open: true,
  // Opened more recently than anything closed, so "all" lists it first.
  open_timestamp: NOW - 3_600_000,
  open_date: new Date(NOW - 3_600_000).toISOString(),
  close_date: null,
  close_timestamp: null,
  close_rate: null,
  profit_ratio: 0.02,
  profit_abs: 0.2,
  current_rate: 1.02,
  exit_reason: null,
})

const closedTrades = [
  trade(1, 'AAA/USDT', {
    profit_ratio: 0.08,
    profit_abs: 0.8,
    close_timestamp: NOW - 4 * 3_600_000,
  }),
  trade(2, 'AAA/USDT', {
    profit_ratio: -0.02,
    profit_abs: -0.2,
    close_timestamp: NOW - 5 * 3_600_000,
  }),
  trade(3, 'BBB/USDT', {
    profit_ratio: 0.05,
    profit_abs: 0.5,
    close_timestamp: NOW - 6 * 3_600_000,
  }),
  trade(4, 'CCC/USDT', {
    profit_ratio: 0.03,
    profit_abs: 0.3,
    close_timestamp: NOW - 7 * 3_600_000,
  }),
]

const profitSummary = {
  profit_closed_coin: 1.4,
  profit_closed_percent_mean: 3.5,
  profit_closed_ratio_mean: 0.035,
  profit_closed_percent_sum: 14,
  profit_closed_ratio_sum: 0.14,
  profit_closed_percent: 1.4,
  profit_closed_ratio: 0.014,
  profit_closed_fiat: 1.4,
  profit_all_coin: 1.6,
  profit_all_percent_mean: 3.6,
  profit_all_ratio_mean: 0.036,
  profit_all_percent_sum: 14.4,
  profit_all_ratio_sum: 0.144,
  profit_all_percent: 1.6,
  profit_all_ratio: 0.016,
  profit_all_fiat: 1.6,
  trade_count: 5,
  closed_trade_count: 4,
  first_trade_date: '2026-09-01 00:00:00',
  first_trade_timestamp: NOW - 19 * DAY,
  latest_trade_date: '2026-09-20 11:00:00',
  latest_trade_timestamp: NOW - 3_600_000,
  avg_duration: '2:30:00',
  best_pair: 'AAA/USDT',
  best_rate: 8,
  best_pair_profit_ratio: 0.08,
  best_pair_profit_abs: 0.8,
  winning_trades: 3,
  losing_trades: 1,
  profit_factor: 1.75,
  winrate: 0.75,
  expectancy: 0.3,
  expectancy_ratio: 1.2,
  sharpe: 1.5,
  sortino: 2.2,
  sqn: 1.1,
  calmar: 0.9,
  cagr: 0.2,
  max_drawdown: 0.012,
  max_drawdown_abs: 0.12,
  max_drawdown_start: '2026-09-05 00:00:00',
  max_drawdown_end: '2026-09-06 00:00:00',
  current_drawdown: 0.004,
  current_drawdown_abs: 0.04,
  current_drawdown_high: 1.5,
  current_drawdown_start: '2026-09-18 00:00:00',
  trading_volume: 400,
  bot_start_timestamp: NOW - 19 * DAY,
  bot_start_date: '2026-09-01 00:00:00',
}

function periodRows(count: number, stepDays: number) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(NOW - (index + 1) * stepDays * DAY)
    return {
      date: date.toISOString().slice(0, 10),
      abs_profit: index % 3 === 0 ? 0.5 : 0,
      rel_profit: index % 3 === 0 ? 0.005 : 0,
      starting_balance: 100 + index,
      fiat_value: index % 3 === 0 ? 0.5 : 0,
      trade_count: index % 3 === 0 ? 1 : 0,
    }
  })
}

function candles(count = 60) {
  const data: (string | number)[][] = []
  let price = 1
  for (let index = 0; index < count; index += 1) {
    const drift = Math.sin(index / 5) * 0.004
    const open = price
    const close = price * (1 + drift)
    const high = Math.max(open, close) * 1.002
    const low = Math.min(open, close) * 0.998
    const time = new Date(NOW - (count - index) * 5 * 60_000)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ')
    data.push([time, open, high, low, close, 100 + index])
    price = close
  }
  return data
}

export const RESPONSES: Record<string, unknown> = {
  ping: { status: 'pong' },
  version: { version: '2026.8' },
  show_config: {
    version: '2026.8',
    strategy_version: 'test',
    api_version: 2.5,
    dry_run: false,
    state: 'running',
    runmode: 'live',
    trading_mode: 'futures',
    margin_mode: 'isolated',
    short_allowed: true,
    stake_currency: 'USDT',
    stake_amount: 'unlimited',
    max_open_trades: 6,
    stoploss: -0.99,
    trailing_stop: false,
    force_entry_enable: true,
    position_adjustment_enable: false,
    strategy: 'TestStrategy',
    exchange: 'okx',
    timeframe: '5m',
    bot_name: 'test-bot',
  },
  health: {
    last_process: '2026-09-20T12:00:00Z',
    last_process_ts: NOW,
    bot_start: '2026-09-01T00:00:00Z',
    bot_start_ts: NOW - 19 * DAY,
    bot_startup: '2026-09-20T10:00:00Z',
    bot_startup_ts: NOW - 2 * 3_600_000,
  },
  sysinfo: {
    cpu_pct: [10, 20, 30, 40],
    cpu_load: [
      { cpu: 0, pct: 10 },
      { cpu: 1, pct: 20 },
      { cpu: 2, pct: 30 },
      { cpu: 3, pct: 40 },
    ],
    cpu_load_avg: { '1m': 0.5, '5m': 0.4, '15m': 0.3 },
    cpu_count: 4,
    cpu_avg: 25,
    ram_pct: 42,
  },
  balance: {
    currencies: [
      {
        currency: 'USDT',
        free: 90.5,
        balance: 100,
        used: 9.5,
        bot_owned: 98,
        est_stake: 100,
        est_stake_bot: 98,
        stake: 'USDT',
        is_position: false,
      },
      {
        currency: 'OPEN/USDT:USDT',
        free: 0,
        balance: 0,
        used: 0,
        bot_owned: 4.2,
        est_stake: 4.2,
        est_stake_bot: 4.2,
        stake: 'USDT',
        is_position: true,
        position: 100,
      },
    ],
    total: 100,
    total_bot: 98,
    symbol: 'USD',
    value: 100,
    value_bot: 98,
    stake: 'USDT',
    note: '',
    starting_capital: 95,
    starting_capital_ratio: 0.05,
    starting_capital_pct: 5,
    starting_capital_fiat: 95,
  },
  profit: profitSummary,
  profit_all: { all: profitSummary, long: profitSummary, short: profitSummary },
  status: [openTrade],
  count: { current: 1, max: 6, total_stake: 4.2 },
  trades: { trades: closedTrades, trades_count: 4, offset: 0, total_trades: 4 },
  trade: closedTrades[0],
  performance: [
    { pair: 'AAA/USDT', count: 2, profit_abs: 0.6, profit_ratio: 0.03, profit_pct: 3, profit: 3 },
    { pair: 'BBB/USDT', count: 1, profit_abs: 0.5, profit_ratio: 0.05, profit_pct: 5, profit: 5 },
    { pair: 'CCC/USDT', count: 1, profit_abs: 0.3, profit_ratio: 0.03, profit_pct: 3, profit: 3 },
  ],
  stats: {
    exit_reasons: {
      exit_signal: { wins: 3, losses: 1, draws: 0 },
    },
    durations: { wins: 3_600_000, losses: 1_800_000, draws: null },
  },
  daily: { data: periodRows(20, 1), fiat_display_currency: 'USD', stake_currency: 'USDT' },
  weekly: { data: periodRows(8, 7), fiat_display_currency: 'USD', stake_currency: 'USDT' },
  monthly: { data: periodRows(3, 30), fiat_display_currency: 'USD', stake_currency: 'USDT' },
  logs: {
    log_count: 2,
    logs: [
      ['2026-09-20 11:59:00', NOW - 60_000, 'freqtrade.worker', 'INFO', 'Bot heartbeat'],
      ['2026-09-20 11:58:00', NOW - 120_000, 'freqtrade.worker', 'WARNING', 'Test warning'],
    ],
  },
  whitelist: { whitelist: ['OPEN/USDT', 'AAA/USDT', 'BBB/USDT'], length: 3 },
  blacklist: { blacklist: ['CCC/.*'], length: 1, errors: {} },
  locks: { lock_count: 0, locks: [] },
  token: { access_token: 'test-token', refresh_token: 'test-refresh' },
}

function bodyFor(url: URL, method: string): unknown | undefined {
  const path = url.pathname.replace('/api/v1/', '')
  if (path.startsWith('pair_candles')) {
    return {
      strategy: 'TestStrategy',
      pair: url.searchParams.get('pair') ?? 'AAA/USDT',
      timeframe: url.searchParams.get('timeframe') ?? '5m',
      timeframe_ms: 300_000,
      columns: ['date', 'open', 'high', 'low', 'close', 'volume'],
      data: candles(),
      length: 60,
      buy_signals: 1,
      sell_signals: 0,
      last_analyzed_ts: NOW,
    }
  }
  if (path.startsWith('trade/')) return RESPONSES.trade
  if (path === 'token/login') return RESPONSES.token
  if (method !== 'GET') return { status: 'ok' }
  return RESPONSES[path]
}

/** Answers every API call from the fixtures and stubs the websocket handshake. */
export async function mockApi(
  page: Page,
  options: { rejectAuth?: boolean; tradeCount?: number; staleHeartbeat?: boolean } = {},
) {
  const calls: string[] = []
  const { tradeCount } = options
  /**
   * Health is answered relative to the moment of the request: the heartbeat alert
   * compares against the real clock, so a frozen timestamp would look days stale.
   */
  const healthPayload = () => {
    const ts = Date.now() - (options.staleHeartbeat ? 5 * 60_000 : 0)
    return {
      ...(RESPONSES.health as Record<string, unknown>),
      last_process: new Date(ts).toISOString(),
      last_process_ts: ts,
    }
  }
  const tradesPayload = tradeCount
    ? {
        trades: Array.from({ length: tradeCount }, (_, index) =>
          trade(index + 1, `P${String(index + 1).padStart(2, '0')}/USDT`, {
            close_timestamp: NOW - (index + 2) * 3_600_000,
          }),
        ),
        trades_count: tradeCount,
        offset: 0,
        total_trades: tradeCount,
      }
    : RESPONSES.trades

  await page.route(`${API_ORIGIN}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace('/api/v1/', '')
    calls.push(path)

    if (options.rejectAuth && !path.startsWith('token')) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Incorrect username or password' }),
      })
      return
    }

    // `tradeCount` lets a test page through a longer history than the default fixture.
    const body =
      tradeCount && path.startsWith('trades')
        ? tradesPayload
        : path === 'health'
          ? healthPayload()
          : bodyFor(url, request.method())
    if (body === undefined) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Not Found' }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })

  // The live stream is stubbed out: these tests cover the UI, not the socket.
  await page.routeWebSocket(/message\/ws/, (socket) => {
    socket.onMessage(() => {})
  })

  return { calls }
}

/** Types the fake credentials into the connect screen and waits for the shell. */
export async function connect(page: Page) {
  await page.locator('input[inputmode="url"]').fill(API_BASE)
  await page.locator('input[autocomplete="username"]').fill(USERNAME)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.locator('.connect__submit').click()
}

export const ROUTES: { path: string; marker: string }[] = [
  { path: '#/', marker: '每日盈亏' },
  { path: '#/trades', marker: '交易对' },
  { path: '#/stats', marker: '统计' },
  { path: '#/market', marker: 'K 线' },
  { path: '#/logs', marker: '日志' },
  { path: '#/system', marker: '系统' },
  { path: '#/settings', marker: '连接' },
]

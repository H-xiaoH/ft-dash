import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBotStore } from '@/stores/bot'
import { useSettingsStore } from '@/stores/settings'

/**
 * Connecting while the bot is restarting: `/count` answers 502 ("trader is not running")
 * until the trader is up. Without a poll the page would sit on its failure banner forever.
 */

const showConfig = {
  version: '2026.9',
  api_version: 2.5,
  bot_name: 'Restarting',
  stake_currency: 'USDT',
  stake_amount: 'unlimited',
  dry_run: true,
  max_open_trades: 3,
}

/** The core group must succeed whole for the connection state to clear. */
const corePayloads: Record<string, unknown> = {
  '/status': [],
  '/count': { current: 0, max: 6, total_stake: 0 },
  '/balance': {
    currencies: [],
    total: 0,
    symbol: 'USDT',
    value: 0,
    stake: 'USDT',
    note: '',
  },
  '/profit': Object.fromEntries(
    [
      'profit_closed_coin',
      'profit_closed_fiat',
      'profit_all_coin',
      'profit_all_fiat',
      'trade_count',
      'closed_trade_count',
      'winning_trades',
      'losing_trades',
      'profit_closed_percent_mean',
      'profit_closed_ratio_mean',
      'profit_closed_percent_sum',
      'profit_closed_ratio_sum',
      'profit_closed_percent',
      'profit_closed_ratio',
      'profit_all_percent_mean',
      'profit_all_ratio_mean',
      'profit_all_percent_sum',
      'profit_all_ratio_sum',
      'profit_all_percent',
      'profit_all_ratio',
    ].map((key) => [key, 0]),
  ),
  '/health': {
    last_process: null,
    last_process_ts: null,
    bot_start: '2026-10-29T21:29:15Z',
    bot_start_ts: 1793309355,
    bot_startup: '2026-10-29T21:30:45Z',
    bot_startup_ts: 1793309445,
  },
  '/sysinfo': {
    cpu_pct: [10],
    cpu_load: [{ cpu: 0, pct: 10 }],
    cpu_load_avg: { '1m': 0.5, '5m': 0.5, '15m': 0.5 },
    cpu_count: 8,
    cpu_avg: 10,
    ram_pct: 40,
  },
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('connect recovery', () => {
  let traderUp = false

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    setActivePinia(createPinia())
    vi.useFakeTimers()
    traderUp = false
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = String(input)
      if (!traderUp && url.endsWith('/count')) {
        return Promise.resolve(
          jsonResponse({ error: 'Error querying /api/v1/count: trader is not running' }, 502),
        )
      }
      if (url.endsWith('/ping')) return Promise.resolve(jsonResponse({ status: 'pong' }))
      if (url.includes('/show_config')) return Promise.resolve(jsonResponse(showConfig))
      const path = new URL(url).pathname.replace(/^.*\/api\/v1/, '')
      return Promise.resolve(jsonResponse(corePayloads[path] ?? {}))
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('keeps polling after a restarting bot refuses the first connect', async () => {
    const settings = useSettingsStore()
    settings.addBot({
      name: 'Restarting',
      baseUrl: 'https://bot.example/api/v1',
      username: 'a',
      password: 'p',
    })
    const bot = useBotStore()

    expect(await bot.connect()).toBe(false)
    expect(bot.connection).toBe('unreachable')
    expect(bot.showConfig?.bot_name).toBe('Restarting')

    // The trader comes up; the poll that was already running is what notices.
    traderUp = true
    await vi.advanceTimersByTimeAsync(1_100)
    expect(bot.connection).toBe('online')
    expect(bot.errorKey).toBeNull()

    bot.cleanup()
  })

  it('does not poll a rejected password', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(jsonResponse({ detail: 'Unauthorized' }, 401)))
    const settings = useSettingsStore()
    settings.addBot({
      name: 'Wrong',
      baseUrl: 'https://bot.example/api/v1',
      username: 'a',
      password: 'nope',
    })
    const bot = useBotStore()

    expect(await bot.connect()).toBe(false)
    expect(bot.connection).toBe('unauthorized')

    await vi.advanceTimersByTimeAsync(3_000)
    expect(bot.connection).toBe('unauthorized')

    bot.cleanup()
  })
})

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEventsStore } from '@/stores/events'
import { useBotStore } from '@/stores/bot'
import { useSettingsStore } from '@/stores/settings'

/**
 * Switching bots must not let the previous bot's answers land on the new one's screen.
 * The store keeps an epoch for exactly that, so this drives the real thing: a request is
 * left in flight, the bot is switched, and only then is the response released.
 */

const showConfig = (botName: string) => ({
  version: '2026.9',
  api_version: 2.5,
  bot_name: botName,
  stake_currency: 'USDT',
  stake_amount: 'unlimited',
  dry_run: true,
  max_open_trades: 3,
})

const candles = {
  strategy: 'TestStrategy',
  pair: 'BTC/USDT',
  timeframe: '5m',
  timeframe_ms: 300_000,
  columns: ['date', 'open', 'high', 'low', 'close', 'volume'],
  data: [],
  length: 0,
}

function addTestBots() {
  const settings = useSettingsStore()
  settings.addBot({
    name: 'first',
    baseUrl: 'https://first.example/api/v1',
    username: 'a',
    password: 'p',
  })
  settings.addBot({
    name: 'second',
    baseUrl: 'https://second.example/api/v1',
    username: 'b',
    password: 'q',
  })
  return settings
}

function jsonResponse(body: unknown) {
  const normalizedBody =
    body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 0
      ? { status: 'pong' }
      : body
  return new Response(JSON.stringify(normalizedBody), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

class FakeWebSocket {
  static instances: FakeWebSocket[] = []

  readonly listeners = new Map<string, Array<(event: { data?: unknown }) => void>>()
  closed = false

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this)
  }

  static reset() {
    FakeWebSocket.instances = []
  }

  addEventListener(type: string, listener: (event: { data?: unknown }) => void) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  close() {
    this.closed = true
  }

  send() {}

  emit(type: string, event: { data?: unknown } = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

/** Minimal payloads the core group parses, so a poll can succeed and clear `unreachable`. */
const corePayloads: Record<string, unknown> = {
  '/status': [],
  '/count': { current: 0, max: 3, total_stake: 0 },
  '/balance': { currencies: [], total: 0, symbol: 'USDT', value: 0, stake: 'USDT', note: '' },
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
    last_process: '2026-10-24T12:00:00Z',
    last_process_ts: 1_792_843_200,
    bot_start: '2026-10-24T11:00:00Z',
    bot_start_ts: 1_792_839_600,
    bot_startup: '2026-10-24T11:30:00Z',
    bot_startup_ts: 1_792_841_400,
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

describe('switching bots', () => {
  it('checks controls and current readiness again at the write entry', async () => {
    const settings = addTestBots()
    settings.websocket = false
    const fetcher = vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
      const path = new URL(String(input)).pathname.replace('/api/v1', '')
      if (options?.method === 'POST') return Promise.resolve(jsonResponse({ status: 'ok' }))
      if (path === '/show_config') return Promise.resolve(jsonResponse(showConfig('FirstBot')))
      if (path === '/trades')
        return Promise.resolve(
          jsonResponse({ trades: [], trades_count: 0, offset: 0, total_trades: 0 }),
        )
      return Promise.resolve(jsonResponse(corePayloads[path] ?? {}))
    })
    vi.stubGlobal('fetch', fetcher)
    const bot = useBotStore()
    await bot.connect()
    bot.stopPolling()
    const writeCount = () =>
      fetcher.mock.calls.filter(([, options]) => options?.method === 'POST').length
    try {
      for (const [enabled, acknowledged] of [
        [false, false],
        [true, false],
        [false, true],
      ]) {
        settings.allowControls = enabled!
        settings.controlsAcknowledged = acknowledged!
        expect(await bot.stop()).toBeNull()
        expect(writeCount()).toBe(0)
      }
      settings.allowControls = true
      settings.controlsAcknowledged = true
      expect(bot.writesAllowed).toBe(true)
      expect(await bot.stop()).toEqual({ status: 'ok' })
      expect(writeCount()).toBe(1)
      // A confirmation opened earlier must not bypass a failed core refresh.
      fetcher.mockImplementationOnce(() => Promise.resolve(new Response('{}', { status: 500 })))
      await bot.refreshCore()
      expect(bot.writesAllowed).toBe(false)
      expect(await bot.forceExit(1)).toBeNull()
      expect(writeCount()).toBe(1)
    } finally {
      bot.cleanup()
    }
  })

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('connects from config without requesting the version endpoint', async () => {
    const settings = addTestBots()
    settings.websocket = false
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname.replace('/api/v1', '')
      if (path === '/show_config')
        return jsonResponse({ ...showConfig('first'), version: '2099.1', api_version: 99 })
      if (path === '/trades')
        return jsonResponse({ trades: [], trades_count: 0, offset: 0, total_trades: 0 })
      return jsonResponse(corePayloads[path] ?? {})
    })
    vi.stubGlobal('fetch', fetcher)
    const bot = useBotStore()
    try {
      await expect(bot.connect()).resolves.toBe(true)
      expect(bot.showConfig?.version).toBe('2099.1')
      expect(bot.showConfig?.api_version).toBe(99)
      expect(
        fetcher.mock.calls.some(([url]) => new URL(String(url)).pathname.endsWith('/version')),
      ).toBe(false)
    } finally {
      bot.cleanup()
    }
  })

  it('drops a reply that arrives after the dashboard moved to another bot', async () => {
    const settings = addTestBots()

    /** The first bot's `/status` hangs until we release it. */
    let hangFirstStatus = false
    let releaseFirst: (value: Response) => void = () => {}
    const firstReply = new Promise<Response>((resolve) => {
      releaseFirst = resolve
    })

    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('https://first.example')) {
        if (url.includes('/status')) {
          return hangFirstStatus ? firstReply : Promise.resolve(jsonResponse([]))
        }
        return Promise.resolve(
          jsonResponse(url.includes('/show_config') ? showConfig('FirstBot') : {}),
        )
      }
      if (url.includes('/show_config'))
        return Promise.resolve(jsonResponse(showConfig('SecondBot')))
      if (url.includes('/status')) return Promise.resolve(jsonResponse([]))
      return Promise.resolve(jsonResponse({}))
    })

    const bot = useBotStore()
    await bot.connect()
    expect(bot.showConfig?.bot_name).toBe('FirstBot')

    // Leave a core refresh hanging, then move to the second bot.
    hangFirstStatus = true
    const inFlight = bot.refreshCore()
    expect(await bot.switchBot(settings.bots[1].id)).toBe(true)
    expect(bot.showConfig?.bot_name).toBe('SecondBot')

    // A stale core pass must not replace metadata published by the selected bot.
    bot.latencyMs = 7777
    bot.lastFetchAt = 8888

    // The old bot finally answers: that payload must be discarded, not painted on top.
    releaseFirst(jsonResponse({ trade_id: 1, pair: 'STALE/USDT' }))
    await inFlight
    expect(bot.openTrades).toEqual([])
    expect(bot.showConfig?.bot_name).toBe('SecondBot')
    expect(bot.latencyMs).toBe(7777)
    expect(bot.lastFetchAt).toBe(8888)

    bot.cleanup()
  })

  it('clears connection metadata before connecting a bot without a snapshot', async () => {
    const settings = addTestBots()
    let releaseSecondConfig: (value: Response) => void = () => {}
    const secondConfig = new Promise<Response>((resolve) => {
      releaseSecondConfig = resolve
    })

    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('https://second.example') && url.includes('/show_config'))
        return secondConfig
      if (url.includes('/show_config'))
        return Promise.resolve(
          jsonResponse(
            url.startsWith('https://first.example')
              ? showConfig('FirstBot')
              : showConfig('SecondBot'),
          ),
        )
      if (url.includes('/status')) return Promise.resolve(jsonResponse([]))
      return Promise.resolve(jsonResponse({}))
    })

    const bot = useBotStore()
    await bot.connect()
    bot.latencyMs = 111
    bot.lastFetchAt = 1111

    const switching = bot.switchBot(settings.bots[1].id)
    expect(bot.latencyMs).toBeNull()
    expect(bot.lastFetchAt).toBeNull()

    releaseSecondConfig(jsonResponse(showConfig('SecondBot')))
    await switching
    bot.cleanup()
  })

  it('restores connection metadata from the selected bot snapshot', async () => {
    const settings = addTestBots()
    let firstConfigCalls = 0
    let releaseFirstReconnect: (value: Response) => void = () => {}
    const firstReconnect = new Promise<Response>((resolve) => {
      releaseFirstReconnect = resolve
    })

    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('https://first.example') && url.includes('/show_config')) {
        firstConfigCalls += 1
        return firstConfigCalls === 1
          ? Promise.resolve(jsonResponse(showConfig('FirstBot')))
          : firstReconnect
      }
      if (url.includes('/show_config'))
        return Promise.resolve(
          jsonResponse(
            url.startsWith('https://first.example')
              ? showConfig('FirstBot')
              : showConfig('SecondBot'),
          ),
        )
      if (url.includes('/status')) return Promise.resolve(jsonResponse([]))
      return Promise.resolve(jsonResponse({}))
    })

    const bot = useBotStore()
    await bot.connect()
    bot.latencyMs = 101
    bot.lastFetchAt = 1001

    await bot.switchBot(settings.bots[1].id)
    bot.latencyMs = 202
    bot.lastFetchAt = 2002

    const switchingBack = bot.switchBot(settings.bots[0].id)
    try {
      expect(bot.latencyMs).toBe(101)
      expect(bot.lastFetchAt).toBe(1001)
    } finally {
      releaseFirstReconnect(jsonResponse(showConfig('FirstBot')))
      await switchingBack
      bot.cleanup()
    }
  })

  it('invalidates old requests when settings change before a direct reconnect', async () => {
    const settings = addTestBots()
    let firstStatusCalls = 0
    let releaseFirstStatus: (value: Response) => void = () => {}
    const firstStatus = new Promise<Response>((resolve) => {
      releaseFirstStatus = resolve
    })

    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('https://first.example')) {
        if (url.includes('/status')) {
          firstStatusCalls += 1
          return firstStatusCalls === 1 ? Promise.resolve(jsonResponse([])) : firstStatus
        }
        return Promise.resolve(
          jsonResponse(url.includes('/show_config') ? showConfig('FirstBot') : {}),
        )
      }
      if (url.includes('/show_config'))
        return Promise.resolve(jsonResponse(showConfig('SecondBot')))
      if (url.includes('/status')) return Promise.resolve(jsonResponse([]))
      return Promise.resolve(jsonResponse({}))
    })

    const bot = useBotStore()
    await bot.connect()
    const staleRefresh = bot.refreshCore()
    expect(firstStatusCalls).toBe(2)

    settings.removeBot(settings.bots[0].id)
    expect(await bot.connect()).toBe(true)

    releaseFirstStatus(jsonResponse([{ trade_id: 1, pair: 'STALE/USDT' }]))
    await staleRefresh
    expect(bot.openTrades).toEqual([])
    expect(bot.showConfig?.bot_name).toBe('SecondBot')
    bot.cleanup()
  })

  it('does not let a stale refresh block the new bot or refetch it through the old run', async () => {
    const settings = addTestBots()
    let firstStatusCalls = 0
    let releaseFirstStatus: (value: Response) => void = () => {}
    const firstStatus = new Promise<Response>((resolve) => {
      releaseFirstStatus = resolve
    })
    let secondTradesCalls = 0

    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('https://first.example')) {
        if (url.includes('/status')) {
          firstStatusCalls += 1
          return firstStatusCalls === 1 ? Promise.resolve(jsonResponse([])) : firstStatus
        }
        return Promise.resolve(
          jsonResponse(url.includes('/show_config') ? showConfig('FirstBot') : {}),
        )
      }
      if (url.startsWith('https://second.example')) {
        if (url.includes('/trades')) secondTradesCalls += 1
        return Promise.resolve(
          jsonResponse(url.includes('/show_config') ? showConfig('SecondBot') : {}),
        )
      }
      return Promise.resolve(jsonResponse({}))
    })

    const bot = useBotStore()
    await bot.connect()
    const staleRefresh = bot.refreshAll()
    expect(firstStatusCalls).toBe(2)

    expect(await bot.switchBot(settings.bots[1].id)).toBe(true)
    expect(secondTradesCalls).toBe(1)

    releaseFirstStatus(jsonResponse([]))
    await staleRefresh
    expect(secondTradesCalls).toBe(1)
    bot.cleanup()
  })

  it('drops completed slices from a refresh batch after a bot switch', async () => {
    const settings = addTestBots()
    let firstLogsCalls = 0
    let releaseFirstLogs: (value: Response) => void = () => {}
    const firstLogs = new Promise<Response>((resolve) => {
      releaseFirstLogs = resolve
    })

    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('https://first.example')) {
        if (url.includes('/logs')) {
          firstLogsCalls += 1
          return firstLogsCalls === 1 ? Promise.resolve(jsonResponse({ logs: [] })) : firstLogs
        }
        if (url.includes('/show_config'))
          return Promise.resolve(jsonResponse(showConfig('FirstBot')))
        return Promise.resolve(jsonResponse({}))
      }
      if (url.startsWith('https://second.example')) {
        if (url.includes('/show_config'))
          return Promise.resolve(jsonResponse(showConfig('SecondBot')))
        return Promise.resolve(jsonResponse({}))
      }
      return Promise.resolve(jsonResponse({}))
    })

    const bot = useBotStore()
    await bot.connect()
    const staleSystemRefresh = bot.refreshSystem()
    expect(firstLogsCalls).toBe(2)
    await flushPromises()

    expect(await bot.switchBot(settings.bots[1].id)).toBe(true)
    expect(bot.showConfig?.bot_name).toBe('SecondBot')

    releaseFirstLogs(jsonResponse({ logs: [{ 0: 0, 1: 0, 2: 'stale', 3: 'INFO', 4: '' }] }))
    await staleSystemRefresh
    expect(bot.showConfig?.bot_name).toBe('SecondBot')
    bot.cleanup()
  })

  it('resets hidden heartbeat state for the next bot', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(100_000)
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    const settings = addTestBots()
    settings.notifications = true
    let firstHealthCalls = 0
    let secondHealthCalls = 0
    const notifications: string[] = []
    class TestNotification {
      static permission = 'granted'

      constructor(title: string) {
        notifications.push(title)
      }
    }
    vi.stubGlobal('Notification', TestNotification)
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/health')) {
        if (url.startsWith('https://first.example')) firstHealthCalls += 1
        if (url.startsWith('https://second.example')) secondHealthCalls += 1
        return Promise.resolve(
          jsonResponse({
            last_process: '1970-01-01T00:00:00Z',
            // Any positive old instant: 0 now means "never processed" and carries no age.
            last_process_ts: 1,
            bot_start: '1970-01-01T00:00:00Z',
            bot_start_ts: 0,
            bot_startup: '1970-01-01T00:00:00Z',
            bot_startup_ts: 0,
          }),
        )
      }
      if (url.includes('/show_config'))
        return Promise.resolve(
          jsonResponse(
            url.startsWith('https://first.example')
              ? showConfig('FirstBot')
              : showConfig('SecondBot'),
          ),
        )
      return Promise.resolve(jsonResponse({}))
    })

    const bot = useBotStore()
    await bot.connect()
    bot.stopPolling()
    bot.startPolling()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(firstHealthCalls).toBe(2)
    expect(notifications).toHaveLength(1)

    expect(await bot.switchBot(settings.bots[1].id)).toBe(true)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(secondHealthCalls).toBe(2)
    expect(notifications).toHaveLength(2)
    bot.cleanup()
  })

  it('keeps active-bot removal inside the lifecycle coordinator', async () => {
    const settings = addTestBots()
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/show_config'))
        return Promise.resolve(
          jsonResponse(
            url.startsWith('https://first.example')
              ? showConfig('FirstBot')
              : showConfig('SecondBot'),
          ),
        )
      return Promise.resolve(jsonResponse({}))
    })

    const bot = useBotStore()
    await bot.connect()
    expect(await bot.removeBot(settings.bots[0].id)).toBe(true)
    expect(settings.bots).toHaveLength(1)
    expect(settings.activeBotId).toBe(settings.bots[0].id)
    expect(bot.showConfig?.bot_name).toBe('SecondBot')
    bot.cleanup()
  })

  it('keeps the active bot when its replacement cannot connect during removal', async () => {
    const settings = addTestBots()
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('https://second.example') && url.includes('/show_config')) {
        return Promise.reject(new Error('replacement is offline'))
      }
      if (url.includes('/show_config'))
        return Promise.resolve(
          jsonResponse(
            url.startsWith('https://first.example')
              ? showConfig('FirstBot')
              : showConfig('SecondBot'),
          ),
        )
      return Promise.resolve(jsonResponse({}))
    })

    const bot = useBotStore()
    await bot.connect()
    expect(await bot.removeBot(settings.bots[0].id)).toBe(false)
    expect(settings.bots).toHaveLength(2)
    expect(settings.activeBotId).toBe(settings.bots[0].id)
    expect(bot.showConfig?.bot_name).toBe('FirstBot')
    bot.cleanup()
  })

  it('does not roll back over a newer bot switch after removal loses its race', async () => {
    const settings = addTestBots()
    const third = settings.addBot({
      name: 'third',
      baseUrl: 'https://third.example/api/v1',
      username: 'c',
      password: 'r',
    })
    let releaseSecondConfig: (error: Error) => void = () => {}
    const secondConfig = new Promise<Response>((_, reject) => {
      releaseSecondConfig = reject
    })

    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('https://second.example') && url.includes('/show_config'))
        return secondConfig
      if (url.includes('/show_config')) {
        const name = url.startsWith('https://third.example') ? 'ThirdBot' : 'FirstBot'
        return Promise.resolve(jsonResponse(showConfig(name)))
      }
      return Promise.resolve(jsonResponse({}))
    })

    const bot = useBotStore()
    await bot.connect()
    const removing = bot.removeBot(settings.bots[0].id)
    expect(settings.activeBotId).toBe(settings.bots[1].id)

    expect(await bot.switchBot(third.id)).toBe(true)
    releaseSecondConfig(new Error('replacement is offline'))

    expect(await removing).toBe(false)
    expect(settings.activeBotId).toBe(third.id)
    expect(settings.bots).toHaveLength(3)
    expect(bot.showConfig?.bot_name).toBe('ThirdBot')
    bot.cleanup()
  })

  it('drops websocket auth and messages that belong to a previous bot', async () => {
    const settings = addTestBots()
    settings.streamAuth = 'auto'
    settings.wsToken = 'shared-token'
    let loginCalls = 0
    let releaseFirstLogin: (value: Response) => void = () => {}
    let releaseSecondLogin: () => void = () => {}
    const firstLogin = new Promise<Response>((resolve) => {
      releaseFirstLogin = resolve
    })
    const secondLogin = new Promise<void>((resolve) => {
      releaseSecondLogin = resolve
    })
    FakeWebSocket.reset()
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/token/login')) {
        loginCalls += 1
        return loginCalls === 1
          ? firstLogin
          : secondLogin.then(() => jsonResponse({ access_token: 'new-token' }))
      }
      if (url.includes('/show_config'))
        return Promise.resolve(
          jsonResponse(
            url.startsWith('https://first.example')
              ? showConfig('FirstBot')
              : showConfig('SecondBot'),
          ),
        )
      return Promise.resolve(jsonResponse({}))
    })

    const bot = useBotStore()
    await bot.connect()
    expect(loginCalls).toBe(1)
    expect(await bot.switchBot(settings.bots[1].id)).toBe(true)
    expect(loginCalls).toBeGreaterThanOrEqual(2)

    releaseFirstLogin(jsonResponse({ access_token: 'old-token' }))
    await flushPromises()
    expect(FakeWebSocket.instances).toEqual([])

    releaseSecondLogin()
    await flushPromises()
    expect(FakeWebSocket.instances.length).toBeGreaterThan(0)
    expect(FakeWebSocket.instances.every((socket) => socket.url.includes('new-token'))).toBe(true)
    bot.cleanup()
  })

  it('closes the current socket before retrying stream authentication', async () => {
    const settings = addTestBots()
    settings.streamAuth = 'ws_token'
    settings.wsToken = 'old-token'
    let releaseLogin: () => void = () => {}
    const login = new Promise<void>((resolve) => {
      releaseLogin = resolve
    })
    const events = useEventsStore()
    FakeWebSocket.reset()
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/token/login')) {
        return login.then(() => jsonResponse({ access_token: 'new-token' }))
      }
      if (url.includes('/show_config'))
        return Promise.resolve(
          jsonResponse(
            url.startsWith('https://first.example')
              ? showConfig('FirstBot')
              : showConfig('SecondBot'),
          ),
        )
      return Promise.resolve(jsonResponse({}))
    })

    const bot = useBotStore()
    await bot.connect()
    await flushPromises()
    expect(FakeWebSocket.instances).toHaveLength(1)
    const oldSocket = FakeWebSocket.instances[0]

    settings.streamAuth = 'auto'
    settings.wsToken = 'new-token'
    await flushPromises()
    oldSocket.emit('message', {
      data: JSON.stringify({ type: 'warning', data: { msg: 'stale socket' } }),
    })
    oldSocket.emit('open')
    oldSocket.emit('error')
    oldSocket.emit('close')

    expect(oldSocket.closed).toBe(true)
    expect(events.events).toHaveLength(0)

    releaseLogin()
    await flushPromises()
    expect(FakeWebSocket.instances).toHaveLength(2)
    const newSocket = FakeWebSocket.instances[1]
    expect(newSocket.url).toContain('new-token')
    oldSocket.emit('message', {
      data: JSON.stringify({ type: 'warning', data: { msg: 'stale after replacement' } }),
    })
    oldSocket.emit('open')
    oldSocket.emit('error')
    oldSocket.emit('close')
    expect(events.events).toHaveLength(0)
    expect(newSocket.closed).toBe(false)
    bot.cleanup()
  })

  it('drops a stale request failure after switching bots', async () => {
    const settings = addTestBots()

    let hangFirstStatus = false
    let rejectFirst: (error: Error) => void = () => {}
    const firstReply = new Promise<Response>((_, reject) => {
      rejectFirst = reject
    })
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('https://first.example')) {
        if (url.includes('/status')) {
          return hangFirstStatus ? firstReply : Promise.resolve(jsonResponse([]))
        }
        return Promise.resolve(
          jsonResponse(url.includes('/show_config') ? showConfig('FirstBot') : {}),
        )
      }
      if (url.includes('/show_config'))
        return Promise.resolve(jsonResponse(showConfig('SecondBot')))
      if (url.includes('/status')) return Promise.resolve(jsonResponse([]))
      return Promise.resolve(jsonResponse({}))
    })

    const bot = useBotStore()
    await bot.connect()
    hangFirstStatus = true
    const inFlight = bot.refreshCore()
    expect(await bot.switchBot(settings.bots[1].id)).toBe(true)
    expect(bot.connection).toBe('online')

    rejectFirst(new Error('old bot went away'))
    await inFlight

    expect(bot.connection).toBe('online')
    expect(bot.errorKey).toBeNull()
    bot.cleanup()
  })

  it('does not retry stale candles against the selected bot after a switch', async () => {
    const settings = addTestBots()

    let candleCalls = 0
    let releaseFirstCandle: (value: Response) => void = () => {}
    const firstCandle = new Promise<Response>((resolve) => {
      releaseFirstCandle = resolve
    })
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('https://first.example')) {
        if (url.includes('/pair_candles')) {
          candleCalls += 1
          return candleCalls === 1 ? firstCandle : Promise.resolve(jsonResponse(candles))
        }
        return Promise.resolve(
          jsonResponse(url.includes('/show_config') ? showConfig('FirstBot') : {}),
        )
      }
      if (url.includes('/show_config'))
        return Promise.resolve(jsonResponse(showConfig('SecondBot')))
      if (url.includes('/status')) return Promise.resolve(jsonResponse([]))
      return Promise.resolve(jsonResponse({}))
    })

    const bot = useBotStore()
    await bot.connect()
    const inFlight = bot.fetchCandles('BTC/USDT', '5m')
    expect(candleCalls).toBe(1)

    expect(await bot.switchBot(settings.bots[1].id)).toBe(true)
    releaseFirstCandle(jsonResponse(candles))
    expect(await inFlight).toBeNull()

    expect(candleCalls).toBe(1)
    expect(bot.candleCache['BTC/USDT|5m']).toBeUndefined()
    bot.cleanup()
  })

  it("restores each bot's candle cache when switching back to its snapshot", async () => {
    const settings = addTestBots()
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/pair_candles')) {
        const strategy = url.startsWith('https://first.example')
          ? 'FirstStrategy'
          : 'SecondStrategy'
        return Promise.resolve(jsonResponse({ ...candles, strategy }))
      }
      if (url.includes('/show_config')) {
        return Promise.resolve(
          jsonResponse(
            url.startsWith('https://first.example')
              ? showConfig('FirstBot')
              : showConfig('SecondBot'),
          ),
        )
      }
      return Promise.resolve(jsonResponse({}))
    })

    const bot = useBotStore()
    await bot.connect()
    await bot.fetchCandles('BTC/USDT', '5m')
    expect(bot.candleCache['BTC/USDT|5m']?.strategy).toBe('FirstStrategy')

    await bot.switchBot(settings.bots[1].id)
    await bot.fetchCandles('BTC/USDT', '5m')
    expect(bot.candleCache['BTC/USDT|5m']?.strategy).toBe('SecondStrategy')

    await bot.switchBot(settings.bots[0].id)
    expect(bot.candleCache['BTC/USDT|5m']?.strategy).toBe('FirstStrategy')
    bot.cleanup()
  })

  it('does not let an old connect overwrite the selected bot', async () => {
    const settings = addTestBots()

    let releaseFirstConfig: (value: Response) => void = () => {}
    const firstConfig = new Promise<Response>((resolve) => {
      releaseFirstConfig = resolve
    })
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('https://first.example')) {
        if (url.includes('/show_config')) return firstConfig
        return Promise.resolve(
          jsonResponse(url.includes('/show_config') ? showConfig('FirstBot') : {}),
        )
      }
      if (url.includes('/show_config'))
        return Promise.resolve(jsonResponse(showConfig('SecondBot')))
      return Promise.resolve(jsonResponse({}))
    })

    const bot = useBotStore()
    const oldConnect = bot.connect()
    expect(await bot.switchBot(settings.bots[1].id)).toBe(true)
    expect(bot.showConfig?.bot_name).toBe('SecondBot')

    releaseFirstConfig(jsonResponse(showConfig('FirstBot')))
    expect(await oldConnect).toBe(false)
    expect(bot.showConfig?.bot_name).toBe('SecondBot')
    expect(bot.connection).toBe('online')
    bot.cleanup()
  })

  it('isolates a pending poll and its latch across a bot switch', async () => {
    vi.useFakeTimers()
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    const settings = addTestBots()
    let firstStatusCalls = 0
    let secondStatusCalls = 0
    let secondTradesCalls = 0
    let releaseFirstPoll: (value: Response) => void = () => {}
    let releaseSecondPoll: (value: Response) => void = () => {}
    const firstPoll = new Promise<Response>((resolve) => {
      releaseFirstPoll = resolve
    })
    const secondPoll = new Promise<Response>((resolve) => {
      releaseSecondPoll = resolve
    })

    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('https://first.example')) {
        if (url.includes('/status')) {
          firstStatusCalls += 1
          return firstStatusCalls === 5 ? firstPoll : Promise.resolve(jsonResponse([]))
        }
        return Promise.resolve(
          jsonResponse(url.includes('/show_config') ? showConfig('FirstBot') : {}),
        )
      }
      if (url.startsWith('https://second.example')) {
        if (url.includes('/status')) {
          secondStatusCalls += 1
          return secondStatusCalls === 1 ? Promise.resolve(jsonResponse([])) : secondPoll
        }
        if (url.includes('/trades')) secondTradesCalls += 1
        return Promise.resolve(
          jsonResponse(url.includes('/show_config') ? showConfig('SecondBot') : {}),
        )
      }
      return Promise.resolve(jsonResponse({}))
    })

    const bot = useBotStore()
    await bot.connect()
    bot.stopPolling()
    bot.startPolling()

    // Warm three completed ticks so the fourth tick would enter its heavier branch.
    await vi.advanceTimersByTimeAsync(3000)
    expect(firstStatusCalls).toBe(4)

    // The fourth tick is left in flight while the selected bot changes.
    await vi.advanceTimersByTimeAsync(1000)
    expect(firstStatusCalls).toBe(5)
    await bot.switchBot(settings.bots[1].id)

    // The new bot starts its own poll even though the old request is unresolved.
    await vi.advanceTimersByTimeAsync(1000)
    expect(secondStatusCalls).toBe(2)

    // Finishing the old poll must not run its heavy branch against the new client.
    releaseFirstPoll(jsonResponse([]))
    await vi.advanceTimersByTimeAsync(0)
    expect(secondTradesCalls).toBe(1)

    // Nor may the old finally clear the new poll's latch while its request is pending.
    await vi.advanceTimersByTimeAsync(1000)
    expect(secondStatusCalls).toBe(2)

    releaseSecondPoll(jsonResponse([]))
    await vi.advanceTimersByTimeAsync(0)
    bot.cleanup()
  })

  it('starts polling and the stream before optional health and analytics finish', async () => {
    vi.useFakeTimers()
    const settings = addTestBots()
    settings.websocket = true
    FakeWebSocket.reset()
    vi.stubGlobal('WebSocket', FakeWebSocket)
    let release!: () => void
    const optional = new Promise<void>((resolve) => {
      release = resolve
    })
    let statusCalls = 0
    let healthCalls = 0
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/token/login'))
        return Promise.resolve(jsonResponse({ access_token: 'tok' }))
      if (url.includes('/show_config')) return Promise.resolve(jsonResponse(showConfig('FirstBot')))
      const path = new URL(url).pathname.replace(/^.*\/api\/v1/, '')
      if (path === '/status') statusCalls++
      if (path === '/health') healthCalls++
      if (path === '/health' || path === '/daily')
        return optional.then(() => jsonResponse(corePayloads[path] ?? {}))
      if (path === '/trades')
        return Promise.resolve(jsonResponse({ trades: [], trades_count: 0, total_trades: 0 }))
      return Promise.resolve(jsonResponse(corePayloads[path] ?? {}))
    })
    const bot = useBotStore()
    try {
      await expect(bot.connect()).resolves.toBe(true)
      await vi.advanceTimersByTimeAsync(0)
      expect(FakeWebSocket.instances).toHaveLength(1)
      expect(statusCalls).toBe(1)
      expect(healthCalls).toBe(1)
      await vi.advanceTimersByTimeAsync(1_000)
      expect(statusCalls).toBe(2)
      expect(healthCalls).toBe(1)
    } finally {
      release()
      bot.cleanup()
      await vi.advanceTimersByTimeAsync(0)
      vi.useRealTimers()
    }
  })

  it('revives the live stream after the bot was unreachable', async () => {
    vi.useFakeTimers()
    const settings = addTestBots()
    settings.websocket = true
    let botUp = true
    FakeWebSocket.reset()
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/token/login'))
        return Promise.resolve(jsonResponse({ access_token: 'tok' }))
      if (url.includes('/show_config')) return Promise.resolve(jsonResponse(showConfig('FirstBot')))
      if (!botUp) return Promise.reject(new TypeError('Failed to fetch'))
      // The core group has to parse, or a successful poll could never clear `unreachable`.
      const path = new URL(url).pathname.replace(/^.*\/api\/v1/, '')
      return Promise.resolve(jsonResponse(corePayloads[path] ?? {}))
    })

    const bot = useBotStore()
    await bot.connect()
    await vi.advanceTimersByTimeAsync(0)
    expect(FakeWebSocket.instances).toHaveLength(1)
    const socket = FakeWebSocket.instances[0]
    socket.emit('open')

    // The bot goes away, so polling marks the connection unreachable.
    botUp = false
    await vi.advanceTimersByTimeAsync(1_000)
    expect(bot.connection).toBe('unreachable')

    // The socket dies while the bot is away: no reconnect can be scheduled against an offline
    // bot, so the stream has to be revived by the connection coming back.
    socket.emit('close')
    await vi.advanceTimersByTimeAsync(5_000)
    expect(FakeWebSocket.instances).toHaveLength(1)

    botUp = true
    await vi.advanceTimersByTimeAsync(1_000)
    expect(bot.connection).toBe('online')
    await vi.advanceTimersByTimeAsync(5_000)
    expect(FakeWebSocket.instances).toHaveLength(2)
    bot.cleanup()
  })

  it('retries a rejected handshake on its own, on a slow beat', async () => {
    vi.useFakeTimers()
    const settings = addTestBots()
    settings.websocket = true
    settings.streamAuth = 'ws_token'
    settings.wsToken = 'token'
    FakeWebSocket.reset()
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/show_config')) return Promise.resolve(jsonResponse(showConfig('FirstBot')))
      return Promise.resolve(jsonResponse({}))
    })

    const bot = useBotStore()
    await bot.connect()
    await vi.advanceTimersByTimeAsync(0)
    expect(FakeWebSocket.instances).toHaveLength(1)

    // Three handshakes rejected in a row: the fast loop gives up, the slow one takes over.
    // The backoff doubles (3s, 6s, 12s), so each rejection is followed by enough time for the
    // next attempt to be made.
    for (const wait of [4_000, 7_000, 13_000]) {
      FakeWebSocket.instances.at(-1)!.emit('close')
      await vi.advanceTimersByTimeAsync(wait)
    }

    const blocked = FakeWebSocket.instances.length
    expect(bot.streamBlocked).toBe(true)

    // No button exists any more, so the next attempt has to come from the timer itself.
    await vi.advanceTimersByTimeAsync(61_000)
    expect(FakeWebSocket.instances.length).toBeGreaterThan(blocked)
    bot.cleanup()
    vi.useRealTimers()
  })
})

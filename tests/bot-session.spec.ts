import { describe, expect, it, vi } from 'vitest'
import { ApiError, type FreqtradeApiClient } from '@/data/freqtrade'
import { BotSessionController } from '@/data/freqtrade/session'

const credentials = {
  baseUrl: 'https://bot.example.com/api/v1',
  username: 'trader',
  password: 'secret',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle
    reject = fail
  })
  return { promise, resolve, reject }
}

function fakeClient(overrides: Record<string, unknown> = {}): FreqtradeApiClient {
  return {
    ping: vi.fn().mockResolvedValue({ status: 'pong' }),
    showConfig: vi.fn().mockResolvedValue({}),
    status: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue({}),
    balance: vi.fn().mockResolvedValue({}),
    profit: vi.fn().mockResolvedValue({}),
    health: vi.fn().mockResolvedValue({}),
    sysinfo: vi.fn().mockResolvedValue({}),
    trades: vi.fn().mockResolvedValue({ trades: [] }),
    tradeStats: vi.fn().mockResolvedValue({}),
    performance: vi.fn().mockResolvedValue([]),
    daily: vi.fn().mockResolvedValue({}),
    weekly: vi.fn().mockResolvedValue({}),
    monthly: vi.fn().mockResolvedValue({}),
    historicBalance: vi.fn().mockResolvedValue({
      columns: ['date', '__date_ts', 'total_quote'],
      data: [],
      length: 0,
      capture_start_ts: 0,
    }),
    whitelist: vi.fn().mockResolvedValue({}),
    blacklist: vi.fn().mockResolvedValue({}),
    locks: vi.fn().mockResolvedValue({}),
    logs: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as FreqtradeApiClient
}

function sessionFor(
  client: FreqtradeApiClient,
  clients: Record<string, FreqtradeApiClient> = {},
): BotSessionController {
  return new BotSessionController({
    botId: 'first',
    credentials,
    clientFactory: (nextCredentials) => clients[nextCredentials.baseUrl] ?? client,
  })
}

describe('BotSessionController', () => {
  it('connects with required data while health, sysinfo and analytics are pending', async () => {
    const slow = deferred<never>()
    const client = fakeClient({
      ping: vi.fn().mockReturnValue(slow.promise),
      health: vi.fn().mockReturnValue(slow.promise),
      sysinfo: vi.fn().mockReturnValue(slow.promise),
      daily: vi.fn().mockReturnValue(slow.promise),
    })
    const session = sessionFor(client)
    const connected = vi.fn()
    void session.connect().then(connected)
    await vi.waitFor(() => expect(connected).toHaveBeenCalledWith(true))
    expect(session.state.connection).toBe('online')
    expect(session.state.coreReady).toBe(true)
    expect(session.state.tradesReady).toBe(true)
    expect(session.state.refreshing).toBe(false)
    expect(client.health).toHaveBeenCalledOnce()
    expect(client.sysinfo).toHaveBeenCalledOnce()
    session.cleanup()
  })

  it('refreshes completed resources again while coalescing slow health and analytics', async () => {
    const health = deferred<unknown>()
    const daily = deferred<unknown>()
    const client = fakeClient({
      health: vi.fn().mockReturnValue(health.promise),
      daily: vi.fn().mockReturnValue(daily.promise),
    })
    const session = sessionFor(client)
    const first = session.refreshAll()
    await vi.waitFor(() => expect(session.state.refreshing).toBe(false))
    expect(session.state.coreReady).toBe(true)
    const second = session.refreshAll()
    await vi.waitFor(() => expect(client.status).toHaveBeenCalledTimes(2))
    expect(client.health).toHaveBeenCalledOnce()
    expect(client.daily).toHaveBeenCalledOnce()
    health.resolve({})
    daily.resolve({})
    await Promise.all([first, second])
    expect(session.state.refreshing).toBe(false)
  })

  it('retries fast optional resources even while required data is still pending', async () => {
    const status = deferred<unknown>()
    const client = fakeClient({ status: vi.fn().mockReturnValue(status.promise) })
    const session = sessionFor(client)
    const first = session.refreshAll()
    await session.refreshMarket()
    expect(client.whitelist).toHaveBeenCalledOnce()
    const second = session.refreshAll()
    await vi.waitFor(() => expect(client.whitelist).toHaveBeenCalledTimes(2))
    expect(client.status).toHaveBeenCalledOnce()
    expect(session.state.refreshing).toBe(true)
    status.resolve([])
    await Promise.all([first, second])
  })

  it('does not let an old optional completion clear a newer required refresh', async () => {
    const health = deferred<unknown>()
    const status = deferred<unknown>()
    const client = fakeClient({
      health: vi.fn().mockReturnValueOnce(health.promise).mockResolvedValue({}),
    })
    const session = sessionFor(client)
    const first = session.refreshAll()
    await vi.waitFor(() => expect(session.state.refreshing).toBe(false))
    vi.mocked(client.status).mockReturnValueOnce(status.promise as never)
    const second = session.refreshAll()
    expect(session.state.refreshing).toBe(true)
    health.resolve({})
    await first
    expect(session.state.refreshing).toBe(true)
    status.resolve([])
    await second
    expect(session.state.refreshing).toBe(false)
  })

  it('keeps late health authentication failure after required data connected', async () => {
    const health = deferred<unknown>()
    const client = fakeClient({ health: vi.fn().mockReturnValue(health.promise) })
    const session = sessionFor(client)
    const connected = vi.fn()
    void session.connect().then(connected)
    await vi.waitFor(() => expect(connected).toHaveBeenCalledWith(true))
    health.reject(new ApiError('auth', 'Unauthorized', { status: 401 }))
    await vi.waitFor(() => expect(session.state.connection).toBe('unauthorized'))
    await session.refreshCore()
    expect(session.state.connection).toBe('unauthorized')
    session.cleanup()
  })

  it('publishes independent resources while health is pending and reports its failure', async () => {
    const health = deferred<unknown>()
    const client = fakeClient({ health: vi.fn().mockReturnValue(health.promise) })
    const session = sessionFor(client)
    const pending = session.refreshAll()
    await vi.waitFor(() => expect(session.state.tradesReady).toBe(true))
    expect(client.tradeStats).toHaveBeenCalledOnce()
    expect(client.whitelist).toHaveBeenCalledOnce()
    expect(client.logs).toHaveBeenCalledOnce()
    expect(session.state.data.daily).not.toBeNull()
    expect(session.state.data.whitelist).not.toBeNull()
    expect(session.state.coreReady).toBe(true)
    expect(session.state.refreshing).toBe(false)
    health.reject(new ApiError('cors', 'health unavailable'))
    const result = await pending
    expect(result.failed).toEqual(['health'])
    expect(result.succeeded).toEqual(['core', 'trades', 'analytics', 'market', 'system'])
    expect(session.state.refreshing).toBe(false)
  })

  it('preserves authentication failure when another core request also fails and trades succeed', async () => {
    const trades = deferred<unknown>()
    const session = sessionFor(
      fakeClient({
        status: vi.fn().mockRejectedValue(new ApiError('cors', 'unreachable')),
        health: vi.fn().mockRejectedValue(new ApiError('auth', 'Unauthorized', { status: 401 })),
        trades: vi.fn().mockReturnValue(trades.promise),
      }),
    )
    session.state.connection = 'online'
    const pending = session.refreshAll()
    await vi.waitFor(() => expect(session.state.connection).toBe('unauthorized'))
    trades.resolve({ trades: [] })
    await pending
    expect(session.state.connection).toBe('unauthorized')
    expect(session.state.errorKey?.key).toBe('errors.auth')
  })

  it('keeps a trades authentication error ahead of a core network error when connecting', async () => {
    const session = sessionFor(
      fakeClient({
        status: vi.fn().mockRejectedValue(new ApiError('cors', 'unreachable')),
        trades: vi.fn().mockRejectedValue(new ApiError('auth', 'Unauthorized', { status: 401 })),
      }),
    )
    await expect(session.connect()).resolves.toBe(false)
    expect(session.state.connection).toBe('unauthorized')
    expect(session.state.errorKey?.key).toBe('errors.auth')
  })

  it('loads historic equity on demand, shares pending requests, and keeps data after errors', async () => {
    const response = { columns: ['__date_ts', 'total_quote'], data: [[1, 42]] }
    const pending = deferred<typeof response>()
    const historicBalance = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockRejectedValueOnce(new ApiError('auth', 'Unauthorized', { status: 401 }))
    const session = sessionFor(fakeClient({ historicBalance }))

    await expect(session.connect()).resolves.toBe(true)
    expect(historicBalance).not.toHaveBeenCalled()
    const first = session.refreshHistoricBalance()
    const second = session.refreshHistoricBalance()
    expect(historicBalance).toHaveBeenCalledOnce()
    pending.resolve(response)
    await Promise.all([first, second])
    await session.refreshHistoricBalance()
    expect(session.state.data.historicBalance).toEqual(response)
    expect(session.state.connection).toBe('online')
    expect(session.state.resourceErrors.historicBalance?.key).toBe('errors.auth')
    await session.refreshCore()
    expect(session.state.connection).toBe('online')
  })

  it('polls every group each tick without repeating a pending health group', async () => {
    vi.useFakeTimers()
    const health = deferred<unknown>()
    const client = fakeClient({ health: vi.fn().mockReturnValue(health.promise) })
    const session = sessionFor(client)
    try {
      session.startPolling()
      await vi.advanceTimersByTimeAsync(2_000)
      expect(client.health).toHaveBeenCalledOnce()
      expect(client.status).toHaveBeenCalledTimes(2)
      expect(client.trades).toHaveBeenCalledTimes(2)
      expect(client.whitelist).toHaveBeenCalledTimes(2)
      expect(client.tradeStats).toHaveBeenCalledTimes(2)
      expect(client.logs).toHaveBeenCalledTimes(2)
      health.resolve({})
      await vi.advanceTimersByTimeAsync(1_000)
      expect(client.health).toHaveBeenCalledTimes(2)
    } finally {
      session.cleanup()
      vi.useRealTimers()
    }
  })

  it('refreshes an old cached heartbeat before judging a resumed bot unhealthy', async () => {
    vi.useFakeTimers()
    const alert = vi.fn()
    const session = new BotSessionController({
      botId: 'first',
      credentials,
      clientFactory: () =>
        fakeClient({
          health: vi.fn().mockImplementation(async () => ({ last_process_ts: Date.now() })),
        }),
      onHeartbeatAlert: alert,
    })
    session.state.data.health = { last_process_ts: Date.now() - 60_000 } as never
    try {
      session.startPolling()
      await vi.advanceTimersByTimeAsync(1_000)
      expect(alert).not.toHaveBeenCalled()
    } finally {
      session.cleanup()
      vi.useRealTimers()
    }
  })

  it('keeps ten-second hidden health probes with a sixty-second foreground interval', async () => {
    vi.useFakeTimers()
    const originalVisibility = document.visibilityState
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    const client = fakeClient()
    const session = new BotSessionController({
      botId: 'first',
      credentials,
      clientFactory: () => client,
      pollIntervalSeconds: 60,
      backgroundCheckEnabled: () => true,
    })
    try {
      session.startPolling()
      await vi.advanceTimersByTimeAsync(1_000)
      expect(client.health).toHaveBeenCalledTimes(1)
      session.setPollingInterval(50)
      await vi.advanceTimersByTimeAsync(10_000)
      expect(client.health).toHaveBeenCalledTimes(2)
      expect(client.status).not.toHaveBeenCalled()
    } finally {
      session.cleanup()
      Object.defineProperty(document, 'visibilityState', {
        value: originalVisibility,
        configurable: true,
      })
      vi.useRealTimers()
    }
  })

  it('drops cached locks when an existing backend ID gets a new connection identity', async () => {
    const locks = { lock_count: 1, locks: [{ id: 1, pair: 'BTC/USDT', active: true }] }
    const session = sessionFor(fakeClient({ locks: vi.fn().mockResolvedValue(locks) }))
    await session.refreshMarket()
    const snapshot = session.captureSnapshot()
    expect(session.state.locksReady).toBe(true)

    const replacement = { ...credentials, baseUrl: 'https://replacement.example/api/v1' }
    session.updateCredentials(replacement)
    expect(session.state.data.locks).toBeNull()
    expect(session.state.locksReady).toBe(false)

    session.setBot('first', replacement, snapshot)
    expect(session.state.data.locks).toBeNull()
    session.cleanup()
  })

  it('alerts once during failed background health checks and rearms after recovery', async () => {
    vi.useFakeTimers()
    const originalVisibility = document.visibilityState
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    const health = vi.fn().mockRejectedValue(new ApiError('cors', 'down'))
    const alert = vi.fn()
    const session = new BotSessionController({
      botId: 'first',
      credentials,
      clientFactory: () => fakeClient({ health }),
      backgroundCheckEnabled: () => true,
      onHeartbeatAlert: alert,
    })
    session.state.data.health = { last_process_ts: Date.now() } as never
    try {
      session.startPolling()
      await vi.advanceTimersByTimeAsync(65_000)
      expect(alert).toHaveBeenCalledOnce()
      health.mockImplementation(async () => ({ last_process_ts: Date.now() }))
      await vi.advanceTimersByTimeAsync(12_000)
      health.mockRejectedValue(new ApiError('cors', 'down again'))
      await vi.advanceTimersByTimeAsync(45_000)
      expect(alert).toHaveBeenCalledTimes(2)
    } finally {
      session.cleanup()
      Object.defineProperty(document, 'visibilityState', {
        value: originalVisibility,
        configurable: true,
      })
      vi.useRealTimers()
    }
  })

  it('keeps a snapshot stale until core and trades are both fresh', async () => {
    const session = sessionFor(fakeClient())
    session.setSnapshotStale(true)

    await session.refreshCore()
    expect(session.state.coreReady).toBe(true)
    expect(session.state.snapshotStale).toBe(true)

    await session.refreshTrades()
    expect(session.state.tradesReady).toBe(true)
    expect(session.state.snapshotStale).toBe(false)
  })

  it('drops an old resource success after a session switch', async () => {
    const firstStatus = deferred<unknown>()
    const first = fakeClient({ status: vi.fn().mockReturnValue(firstStatus.promise) })
    const second = fakeClient({ status: vi.fn().mockResolvedValue([{ trade_id: 2 }]) })
    const session = sessionFor(first, {
      'https://second.example.com/api/v1': second,
    })

    const pending = session.refreshCore()
    session.setBot('second', { ...credentials, baseUrl: 'https://second.example.com/api/v1' })
    firstStatus.resolve([{ trade_id: 1 }])
    await pending

    expect(session.state.data.openTrades).toEqual([])
  })

  it('drops an old resource failure after a session switch', async () => {
    const firstStatus = deferred<unknown>()
    const first = fakeClient({ status: vi.fn().mockReturnValue(firstStatus.promise) })
    const second = fakeClient()
    const session = sessionFor(first, {
      'https://second.example.com/api/v1': second,
    })

    const pending = session.refreshCore()
    session.setBot('second', { ...credentials, baseUrl: 'https://second.example.com/api/v1' })
    firstStatus.reject(new Error('stale failure'))
    await pending

    expect(session.state.resourceErrors.core).toBeNull()
  })

  it('does not let one successful resource clear another resource error', async () => {
    const session = sessionFor(
      fakeClient({
        tradeStats: vi.fn().mockRejectedValue(new Error('stats unavailable')),
      }),
    )

    await session.refreshAnalytics()
    expect(session.state.resourceErrors.analytics).not.toBeNull()

    await session.refreshMarket()
    expect(session.state.resourceErrors.analytics).not.toBeNull()
    expect(session.state.resourceErrors.market).toBeNull()
  })

  it('rebuilds the client with updated credentials', () => {
    const created: (typeof credentials)[] = []
    const session = new BotSessionController({
      botId: 'first',
      credentials,
      clientFactory: (nextCredentials) => {
        created.push({ ...nextCredentials })
        return fakeClient()
      },
    })

    session.ensureClient()
    session.updateCredentials({ ...credentials, password: 'rotated' })
    session.ensureClient()

    expect(created.map((entry) => entry.password)).toEqual(['secret', 'rotated'])
  })

  it('coalesces a pending resource without marking it ready early', async () => {
    const firstStatus = deferred<unknown>()
    const status = vi.fn().mockReturnValueOnce(firstStatus.promise).mockResolvedValue([])
    const session = sessionFor(fakeClient({ status }))
    const first = session.refreshCore()
    const second = session.refreshCore()
    expect(status).toHaveBeenCalledOnce()
    expect(session.state.coreReady).toBe(false)
    firstStatus.resolve([])
    await Promise.all([first, second])
    expect(session.state.coreReady).toBe(true)
    await session.refreshCore()
    expect(status).toHaveBeenCalledTimes(2)
  })

  it('serializes actions and old finally cannot clear the next action', async () => {
    const gate = deferred<string>()
    const session = sessionFor(fakeClient())
    const first = session.runAction('first', async () => gate.promise)

    expect(session.state.actionPending).toBe('first')
    await expect(session.runAction('second', async () => 'second')).resolves.toBeNull()
    // The second action is refused outright; nothing is queued behind the first one.
    expect(session.state.actionPending).toBe('first')

    gate.resolve('first')
    await expect(first).resolves.toBe('first')
    expect(session.state.actionPending).toBeNull()
  })

  it('drops config that arrives after a connect was superseded', async () => {
    const config = deferred<Record<string, unknown>>()
    const showConfig = vi.fn().mockReturnValue(config.promise)
    const session = sessionFor(fakeClient({ showConfig }))
    const connecting = session.connect()
    await Promise.resolve()
    await Promise.resolve()
    expect(showConfig).toHaveBeenCalledOnce()
    session.setBot('second', { ...credentials, baseUrl: 'https://second.example.com/api/v1' })
    config.resolve({ version: '2099.1', api_version: 99 })
    await expect(connecting).resolves.toBe(false)
    expect(session.state.data.showConfig).toBeNull()
  })

  it('does not report a successful connect after a transport failure', async () => {
    const client = fakeClient({
      status: vi.fn().mockRejectedValue(new ApiError('cors', 'host unreachable')),
    })
    const session = sessionFor(client)

    await expect(session.connect()).resolves.toBe(false)
    expect(session.state.connection).toBe('unreachable')
    expect(session.state.errorKey?.key).toBe('errors.cors')
  })

  it('marks a failed core poll unavailable and recovers after the next successful poll', async () => {
    const status = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('cors', 'host unreachable'))
      .mockResolvedValue([])
    const session = sessionFor(fakeClient({ status }))
    session.state.connection = 'online'

    await session.refreshCore()
    expect(session.state.connection).toBe('unreachable')
    expect(session.state.errorKey?.key).toBe('errors.cors')

    await session.refreshCore()
    expect(session.state.connection).toBe('online')
    expect(session.state.errorKey).toBeNull()
  })

  it('stops polling once the bot rejects the session', async () => {
    vi.useFakeTimers()
    const rejected = () => Promise.reject(new ApiError('auth', 'Unauthorized', { status: 401 }))
    const status = vi.fn(rejected)
    const session = sessionFor(fakeClient({ status }))
    session.state.connection = 'online'

    session.startPolling()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(session.state.connection).toBe('unauthorized')
    const callsWhenRejected = status.mock.calls.length

    // Wrong credentials never fix themselves: six 401s a second is a log flood, not a retry.
    await vi.advanceTimersByTimeAsync(5_000)
    expect(status.mock.calls.length).toBe(callsWhenRejected)
    vi.useRealTimers()
  })

  it('keeps polling an unreachable bot, because that one does recover', async () => {
    vi.useFakeTimers()
    const status = vi.fn().mockRejectedValue(new ApiError('cors', 'host unreachable'))
    const session = sessionFor(fakeClient({ status }))
    session.state.connection = 'online'

    session.startPolling()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(session.state.connection).toBe('unreachable')
    const firstRound = status.mock.calls.length

    await vi.advanceTimersByTimeAsync(5_000)
    expect(status.mock.calls.length).toBeGreaterThan(firstRound)
    vi.useRealTimers()
  })

  it('does not retry candle requests for server errors', async () => {
    const pairCandles = vi.fn().mockRejectedValue(
      new ApiError('http', 'server failed', {
        status: 500,
        detail: 'Column enter_long not found',
      }),
    )
    const session = sessionFor(fakeClient({ pairCandles }))

    await expect(
      session.fetchCandles('BTC/USDT', '5m', 180, [
        'date',
        'open',
        'high',
        'low',
        'close',
        'volume',
      ]),
    ).resolves.toBeNull()
    expect(pairCandles).toHaveBeenCalledTimes(1)
    expect(session.state.resourceErrors.candles).toEqual({
      key: 'errors.http',
      params: { status: 500, detail: 'Column enter_long not found' },
    })
  })
})

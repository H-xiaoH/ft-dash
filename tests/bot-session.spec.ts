import { describe, expect, it, vi } from 'vitest'
import { ApiError, type FreqtradeApiClient } from '@/data/freqtrade'
import { BotSessionController } from '@/data/freqtrade/session'
import type { PairCandlesResponse } from '@/lib/types'

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
    profitAll: vi.fn().mockResolvedValue({}),
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

function candleResponse(): PairCandlesResponse {
  return {
    strategy: 'TestStrategy',
    pair: 'BTC/USDT',
    timeframe: '5m',
    timeframe_ms: 300_000,
    columns: ['date', 'open', 'high', 'low', 'close', 'volume'],
    data: [['2026-10-24 12:00:00', 1, 1.1, 0.9, 1.05, 10]],
    length: 1,
  }
}

describe('BotSessionController', () => {
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
    expect(session.state.coreReady).toBe(false)
    expect(session.state.refreshing).toBe(true)
    health.reject(new ApiError('cors', 'health unavailable'))
    const result = await pending
    expect(result.failed).toEqual(['core'])
    expect(result.succeeded).toEqual(['trades', 'analytics', 'market', 'system'])
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

  it('polls other groups on schedule without repeating a pending core group', async () => {
    vi.useFakeTimers()
    const health = deferred<unknown>()
    const client = fakeClient({ health: vi.fn().mockReturnValue(health.promise) })
    const session = sessionFor(client)
    try {
      session.startPolling()
      await vi.advanceTimersByTimeAsync(12_000)
      expect(client.health).toHaveBeenCalledOnce()
      expect(client.trades).toHaveBeenCalledTimes(3)
      expect(client.whitelist).toHaveBeenCalledTimes(3)
      expect(client.tradeStats).toHaveBeenCalledOnce()
      expect(client.logs).toHaveBeenCalledOnce()
      health.resolve({})
      await vi.advanceTimersByTimeAsync(1_000)
      expect(client.health).toHaveBeenCalledTimes(2)
    } finally {
      session.cleanup()
      vi.useRealTimers()
    }
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

  it('does not let an older resource refresh clear newer readiness', async () => {
    const firstStatus = deferred<unknown>()
    const status = vi.fn().mockReturnValueOnce(firstStatus.promise).mockResolvedValue([])
    const session = sessionFor(fakeClient({ status }))

    const older = session.refreshCore()
    const newer = session.refreshCore()
    await newer
    firstStatus.resolve([])
    await older

    expect(session.state.coreReady).toBe(true)
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

  it.each([400, 422])(
    'retries candles without signal columns for a %s signal-column response',
    async (status) => {
      const pairCandles = vi
        .fn()
        .mockRejectedValueOnce(
          new ApiError('http', 'signal column is not available', {
            status,
            detail: 'Column enter_long not found',
          }),
        )
        .mockResolvedValueOnce(candleResponse())
      const session = sessionFor(fakeClient({ pairCandles }))

      await expect(
        session.fetchCandles('BTC/USDT', '5m', 180, [
          'date',
          'open',
          'high',
          'low',
          'close',
          'volume',
          'enter_long',
        ]),
      ).resolves.toEqual(candleResponse())

      expect(pairCandles).toHaveBeenNthCalledWith(
        1,
        'BTC/USDT',
        '5m',
        180,
        ['date', 'open', 'high', 'low', 'close', 'volume', 'enter_long'],
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      )
      expect(pairCandles).toHaveBeenNthCalledWith(
        2,
        'BTC/USDT',
        '5m',
        180,
        undefined,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      )
    },
  )

  it('does not retry candle requests for server errors', async () => {
    const pairCandles = vi.fn().mockRejectedValue(
      new ApiError('http', 'server failed', {
        status: 500,
        detail: 'Column enter_long not found',
      }),
    )
    const session = sessionFor(fakeClient({ pairCandles }))

    await expect(
      session.fetchCandles('BTC/USDT', '5m', 180, ['date', 'enter_long']),
    ).resolves.toBeNull()
    expect(pairCandles).toHaveBeenCalledTimes(1)
    expect(session.state.resourceErrors.candles).toEqual({
      key: 'errors.http',
      params: { status: 500, detail: 'Column enter_long not found' },
    })
  })
})

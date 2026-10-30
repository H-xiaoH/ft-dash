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
    inspectCompatibility: vi.fn().mockResolvedValue({
      status: 'compatible',
      detectedVersion: '2026.9',
      apiVersion: 2.5,
      referenceContract: 'freqtrade-2026.9-api-v2.5',
    }),
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

  it('allows a mismatched version while publishing a warning', async () => {
    const client = fakeClient({
      inspectCompatibility: vi.fn().mockResolvedValue({
        status: 'warning',
        detectedVersion: '2025.12',
        apiVersion: 2.5,
        referenceContract: 'freqtrade-2026.9-api-v2.5',
        warningKey: 'compatibility.versionMismatch',
      }),
    })
    const session = sessionFor(client)

    await expect(session.connect()).resolves.toBe(true)
    expect(session.state.compatibility?.status).toBe('warning')
    expect(session.state.connection).toBe('online')
  })

  it('drops a stale compatibility result after switching bots', async () => {
    const compatibility = deferred<{
      status: 'warning'
      detectedVersion: string
      apiVersion: number
      referenceContract: 'freqtrade-2026.9-api-v2.5'
      warningKey: 'compatibility.versionMismatch'
    }>()
    const inspectCompatibility = vi.fn().mockReturnValue(compatibility.promise)
    const session = sessionFor(fakeClient({ inspectCompatibility }))
    const connecting = session.connect()

    await Promise.resolve()
    await Promise.resolve()
    expect(inspectCompatibility).toHaveBeenCalledOnce()

    session.setBot('second', { ...credentials, baseUrl: 'https://second.example.com/api/v1' })
    compatibility.resolve({
      status: 'warning',
      detectedVersion: '2025.12',
      apiVersion: 2.5,
      referenceContract: 'freqtrade-2026.9-api-v2.5',
      warningKey: 'compatibility.versionMismatch',
    })

    await expect(connecting).resolves.toBe(false)
    expect(session.state.compatibility).toBeNull()
  })

  it('stays connected when compatibility cannot be confirmed', async () => {
    const client = fakeClient({
      inspectCompatibility: vi.fn().mockResolvedValue({
        status: 'unknown',
        detectedVersion: null,
        apiVersion: null,
        referenceContract: 'freqtrade-2026.9-api-v2.5',
        warningKey: 'compatibility.versionUnknown',
      }),
    })
    const session = sessionFor(client)

    await expect(session.connect()).resolves.toBe(true)
    expect(session.state.connection).toBe('online')
    expect(session.state.compatibility?.warningKey).toBe('compatibility.versionUnknown')
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

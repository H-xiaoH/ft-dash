import { describe, expect, it, vi } from 'vitest'
import { BotSessionController } from '@/data/freqtrade/session'
import type { FreqtradeApiClient } from '@/data/freqtrade'

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
      detectedVersion: '2026.8',
      apiVersion: 2.5,
      referenceContract: 'freqtrade-2026.8-api-v2.5',
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

  it('serializes actions and old finally cannot clear the next action', async () => {
    const gate = deferred<string>()
    const session = sessionFor(fakeClient())
    const first = session.runAction('first', async () => gate.promise)

    expect(session.state.actionPending).toBe('first')
    await expect(session.runAction('second', async () => 'second')).resolves.toBeNull()
    expect(session.state.actionError).toBe('errors.actionBusy')

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
        referenceContract: 'freqtrade-2026.8-api-v2.5',
        warningKey: 'compatibility.versionMismatch',
      }),
    })
    const session = sessionFor(client)

    await expect(session.connect()).resolves.toBe(true)
    expect(session.state.compatibility?.status).toBe('warning')
    expect(session.state.connection).toBe('online')
  })
})

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBotStore } from '@/stores/bot'
import { useSettingsStore } from '@/stores/settings'

/**
 * Switching bots must not let the previous bot's answers land on the new one's screen.
 * The store keeps an epoch for exactly that, so this drives the real thing: a request is
 * left in flight, the bot is switched, and only then is the response released.
 */

const showConfig = (botName: string) => ({
  bot_name: botName,
  stake_currency: 'USDT',
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
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('switching bots', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    setActivePinia(createPinia())
    vi.restoreAllMocks()
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

    // The old bot finally answers: that payload must be discarded, not painted on top.
    releaseFirst(jsonResponse({ trade_id: 1, pair: 'STALE/USDT' }))
    await inFlight
    expect(bot.openTrades).toEqual([])
    expect(bot.showConfig?.bot_name).toBe('SecondBot')

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

  it('does not let an old connect overwrite the selected bot', async () => {
    const settings = addTestBots()

    let releaseFirstPing: (value: Response) => void = () => {}
    const firstPing = new Promise<Response>((resolve) => {
      releaseFirstPing = resolve
    })
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('https://first.example')) {
        if (url.includes('/ping')) return firstPing
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

    releaseFirstPing(jsonResponse({ status: 'pong' }))
    expect(await oldConnect).toBe(false)
    expect(bot.showConfig?.bot_name).toBe('SecondBot')
    expect(bot.connection).toBe('online')
    bot.cleanup()
  })
})

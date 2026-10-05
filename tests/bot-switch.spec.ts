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

describe('switching bots', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('drops a reply that arrives after the dashboard moved to another bot', async () => {
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

    /** The first bot's `/status` hangs until we release it. */
    let hangFirstStatus = false
    let releaseFirst: (value: Response) => void = () => {}
    const firstReply = new Promise<Response>((resolve) => {
      releaseFirst = resolve
    })

    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })

    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('https://first.example')) {
        if (url.includes('/status')) {
          return hangFirstStatus ? firstReply : Promise.resolve(json([]))
        }
        return Promise.resolve(json(url.includes('/show_config') ? showConfig('FirstBot') : {}))
      }
      if (url.includes('/show_config')) return Promise.resolve(json(showConfig('SecondBot')))
      if (url.includes('/status')) return Promise.resolve(json([]))
      return Promise.resolve(json({}))
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
    releaseFirst(json({ trade_id: 1, pair: 'STALE/USDT' }))
    await inFlight
    expect(bot.openTrades).toEqual([])
    expect(bot.showConfig?.bot_name).toBe('SecondBot')

    bot.cleanup()
  })
})

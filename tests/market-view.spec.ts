import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick, reactive } from 'vue'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import type { PairCandlesResponse } from '@/lib/types'

const { rawBot } = vi.hoisted(() => ({
  rawBot: {
    showConfig: { timeframe: '5m' },
    openTrades: [{ pair: 'AAA/USDT' }],
    whitelist: { whitelist: ['AAA/USDT', 'BBB/USDT'] },
    blacklist: { blacklist: [], errors: {} },
    locks: { lock_count: 0, locks: [] },
    performance: [],
    trades: [],
    candleCache: {} as Record<string, PairCandlesResponse>,
    writesAllowed: false,
    actionPending: null as string | null,
    stakeCurrency: 'USDT',
    fetchCandles: (pair: string): Promise<PairCandlesResponse | null> => {
      void pair
      return Promise.resolve(null)
    },
    addBlacklist: () => Promise.resolve(null),
    deleteBlacklist: () => Promise.resolve(null),
    deleteLock: () => Promise.resolve(null),
    labelWithBot: (label: string) => label,
    connection: 'online',
    refreshing: false,
  },
}))

const bot = reactive(rawBot)
let MarketView: typeof import('@/views/MarketView.vue').default

vi.mock('@/stores/bot', () => ({ useBotStore: () => bot }))

interface PendingRequest {
  pair: string
  resolve: (value: PairCandlesResponse | null) => void
}

function response(pair: string): PairCandlesResponse {
  return {
    strategy: 'TestStrategy',
    pair,
    timeframe: '5m',
    timeframe_ms: 300_000,
    columns: ['date', 'open', 'high', 'low', 'close', 'volume'],
    data: [['2026-10-24 12:00:00', 1, 1.1, 0.9, 1.05, 10]],
    length: 1,
  }
}

async function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/market', name: 'market', component: { template: '<div />' } }],
  })
  await router.push('/market')
  await router.isReady()
  return router
}

describe('MarketView', () => {
  let pending: PendingRequest[]

  beforeAll(async () => {
    MarketView = (await import('@/views/MarketView.vue')).default
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    // The chart only appears once candles land, and jsdom ships no ResizeObserver.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    pending = []
    Object.assign(bot, {
      showConfig: { timeframe: '5m' },
      openTrades: [{ pair: 'AAA/USDT' }],
      whitelist: { whitelist: ['AAA/USDT', 'BBB/USDT'] },
      candleCache: {},
      candleError: false,
    })
    // The real store writes the answer into `candleCache` before resolving, so the harness does too.
    bot.fetchCandles = vi.fn(
      (pair: string) =>
        new Promise<PairCandlesResponse | null>((resolve) =>
          pending.push({
            pair,
            resolve: (value) => {
              if (value) bot.candleCache[`${pair}|5m`] = value
              resolve(value)
            },
          }),
        ),
    )
  })

  it('requests the initially selected pair only once', async () => {
    const router = await makeRouter()
    const wrapper = mount(MarketView, { global: { plugins: [i18n, router] } })

    await nextTick()
    expect(bot.fetchCandles).toHaveBeenCalledTimes(1)
    expect(pending[0]?.pair).toBe('AAA/USDT')
    wrapper.unmount()
  })

  it('selects a pair when bot data arrives after the page mounted', async () => {
    const router = await makeRouter()
    Object.assign(bot, {
      openTrades: [],
      whitelist: { whitelist: [] },
    })
    const wrapper = mount(MarketView, { global: { plugins: [i18n, router] } })

    await nextTick()
    expect(bot.fetchCandles).not.toHaveBeenCalled()

    bot.openTrades = [{ pair: 'AAA/USDT' }]
    await nextTick()

    expect(bot.fetchCandles).toHaveBeenCalledTimes(1)
    expect(pending[0]?.pair).toBe('AAA/USDT')
    wrapper.unmount()
  })

  it('does not let an old pair response clear the current loading state', async () => {
    const router = await makeRouter()
    const wrapper = mount(MarketView, { global: { plugins: [i18n, router] } })
    await nextTick()

    await wrapper.find('.filter-menu__button').trigger('click')
    const option = [...document.querySelectorAll<HTMLButtonElement>('.filter-menu__item')].find(
      (item) => item.textContent?.includes('BBB/USDT'),
    )
    expect(option).toBeDefined()
    option?.click()
    await nextTick()
    expect(bot.fetchCandles).toHaveBeenCalledTimes(2)
    expect(pending[1]?.pair).toBe('BBB/USDT')

    pending[0]?.resolve(null)
    await flushPromises()
    expect(wrapper.find('.skeleton').exists()).toBe(true)

    pending[1]?.resolve(response('BBB/USDT'))
    await flushPromises()
    wrapper.unmount()
  })

  it('retries a failed candle request on its own, ten seconds later', async () => {
    vi.useFakeTimers()
    const router = await makeRouter()
    const wrapper = mount(MarketView, { global: { plugins: [i18n, router] } })
    await nextTick()
    expect(bot.fetchCandles).toHaveBeenCalledTimes(1)

    // The bot is restarting: the request fails, and there is no button to press.
    pending[0]?.resolve(null)
    await flushPromises()
    expect(wrapper.find('.empty').exists()).toBe(true)
    expect(wrapper.find('.empty button').exists()).toBe(false)

    await vi.advanceTimersByTimeAsync(9_000)
    expect(bot.fetchCandles).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1_500)
    expect(bot.fetchCandles).toHaveBeenCalledTimes(2)
    expect(pending[1]?.pair).toBe('AAA/USDT')

    // Success stops the loop.
    pending[1]?.resolve(response('AAA/USDT'))
    await flushPromises()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(bot.fetchCandles).toHaveBeenCalledTimes(2)

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('reuses a fresh cache when the page is walked back to', async () => {
    const router = await makeRouter()
    const wrapper = mount(MarketView, { global: { plugins: [i18n, router] } })
    await nextTick()
    pending[0]?.resolve(response('AAA/USDT'))
    await flushPromises()
    expect(bot.fetchCandles).toHaveBeenCalledTimes(1)

    // Leave the page and come back: the candles are seconds old, so no new request.
    await router.push('/elsewhere')
    await nextTick()
    await router.push('/market')
    await nextTick()
    expect(bot.fetchCandles).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('refetches candles that have gone stale while the page was elsewhere', async () => {
    vi.useFakeTimers()
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/market', name: 'market', component: { template: '<div />' } },
        { path: '/elsewhere', name: 'elsewhere', component: { template: '<div />' } },
      ],
    })
    await router.push('/market')
    await router.isReady()
    const wrapper = mount(MarketView, { global: { plugins: [i18n, router] } })
    await nextTick()
    pending[0]?.resolve(response('AAA/USDT'))
    await flushPromises()
    expect(bot.fetchCandles).toHaveBeenCalledTimes(1)

    // Twenty minutes on another page: the chart in the cache is no longer worth showing.
    vi.setSystemTime(Date.now() + 20 * 60_000)
    await router.push('/elsewhere')
    await nextTick()
    await router.push('/market')
    await nextTick()
    expect(bot.fetchCandles).toHaveBeenCalledTimes(2)
    wrapper.unmount()
    vi.useRealTimers()
  })
})

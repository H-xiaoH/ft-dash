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
    pending = []
    Object.assign(bot, {
      showConfig: { timeframe: '5m' },
      openTrades: [{ pair: 'AAA/USDT' }],
      whitelist: { whitelist: ['AAA/USDT', 'BBB/USDT'] },
      candleCache: {},
      candleError: false,
    })
    bot.fetchCandles = vi.fn(
      (pair: string) =>
        new Promise<PairCandlesResponse | null>((resolve) => pending.push({ pair, resolve })),
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
})

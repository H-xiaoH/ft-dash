import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

const { bot } = vi.hoisted(() => ({
  bot: {
    connection: 'online',
    showConfig: null as { state?: string; dry_run?: boolean } | null,
    get isLiveAccount() {
      return this.showConfig?.dry_run === false
    },
    balance: null,
    profit: null,
    count: null,
    openTrades: [],
    stakeCurrency: 'USDT',
    heartbeatAgeMs: null,
    latencyMs: null,
    refreshing: false,
  },
}))
vi.mock('@/stores/bot', () => ({ useBotStore: () => bot, HEARTBEAT_STALE_MS: 30_000 }))
vi.mock('@/composables/useFormat', () => ({
  useFormat: () => ({
    money: () => '—',
    signedMoney: () => '—',
    ratio: () => '—',
    duration: () => '—',
    toneClass: () => '',
  }),
}))
const StatusStrip = (await import('@/components/StatusStrip.vue')).default
const render = () => mount(StatusStrip, { global: { plugins: [i18n] } })
beforeEach(() => {
  i18n.global.locale.value = 'zh-CN'
  bot.connection = 'online'
  bot.showConfig = null
})

describe('status strip', () => {
  it.each([
    ['connecting', 'running', '连接中', 'warn'],
    ['unreachable', 'running', '未连通', 'bad'],
    ['unauthorized', 'running', '未授权', 'bad'],
    ['idle', 'running', '未连接', 'muted'],
    ['online', 'running', '运行中', 'good'],
    ['online', 'paused', '已暂停', 'warn'],
    ['online', 'stopped', '已停止', 'bad'],
    ['online', 'other', '未知', 'muted'],
    ['online', undefined, '未知', 'muted'],
  ] as const)('shows %s / %s as %s with the correct lamp', (connection, state, text, tone) => {
    bot.connection = connection!
    bot.showConfig = { state }
    const wrapper = render()
    expect(wrapper.get('.strip__state-label').text()).toBe(text)
    expect(wrapper.get('.strip__pulse').attributes('data-tone')).toBe(tone)
    wrapper.unmount()
  })

  it.each([
    [false, '实盘'],
    [true, '模拟盘'],
    [undefined, ''],
  ] as const)('only shows an account mode when explicitly reported: %s', (dry_run, text) => {
    bot.showConfig = { dry_run }
    const wrapper = render()
    expect(
      wrapper
        .findAll('.chip')
        .map((chip) => chip.text())
        .join(''),
    ).toBe(text)
    wrapper.unmount()
  })
})

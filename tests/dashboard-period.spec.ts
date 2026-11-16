import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DashboardPeriod from '@/components/dashboard/DashboardPeriod.vue'
import { i18n } from '@/i18n'

vi.mock('@/components/PeriodChart.vue', () => ({
  default: { props: ['entries', 'stake', 'height'], template: '<div data-chart />' },
}))
afterEach(() => {
  i18n.global.locale.value = 'en'
})

describe('dashboard period panel', () => {
  it('emits period changes and renders refreshed entries without mutating input', async () => {
    i18n.global.locale.value = 'zh-CN'
    const wrapper = mount(DashboardPeriod, {
      props: { period: 'daily', periodRows: [], stake: 'USDT' },
      global: { plugins: [createPinia(), i18n] },
    })
    const weekly = wrapper.findAll('button').find((button) => button.text() === '每周')!
    await weekly.trigger('click')
    expect(wrapper.emitted('update:period')?.at(-1)).toEqual(['weekly'])
    expect(wrapper.props('period')).toBe('daily')
    expect(wrapper.find('[data-chart]').exists()).toBe(false)
    await wrapper.setProps({
      periodRows: [
        {
          date: '2026-11-16',
          abs_profit: 2,
          rel_profit: 0.02,
          trade_count: 1,
          starting_balance: 100,
          equity: 102,
          fiat_value: null,
        },
      ],
    })
    expect(wrapper.find('[data-chart]').exists()).toBe(true)
    const toggle = wrapper
      .findAll('button')
      .find((button) => button.attributes('aria-expanded') !== undefined)!
    await toggle.trigger('click')
    expect(wrapper.text()).toContain('2026年11月16日')
  })
})

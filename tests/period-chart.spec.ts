import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PeriodChart from '@/components/PeriodChart.vue'
import type { DailyEntry } from '@/lib/types'
import { i18n } from '@/i18n'

vi.mock('vue-echarts', () => ({
  default: { name: 'Chart', props: { option: Object }, template: '<div />' },
}))
const timestamp = (date: string) => Date.parse(date + 'Z')
const entry = (date: string): DailyEntry => ({
  date,
  abs_profit: 5,
  rel_profit: 0.05,
  starting_balance: 100,
  fiat_value: null,
  trade_count: 2,
})
function render(
  period: 'daily' | 'weekly' | 'monthly',
  dates: string[],
  samples: [string, number][],
  capture = 0,
) {
  const wrapper = mount(PeriodChart, {
    props: {
      entries: dates.map(entry),
      period,
      currentEquity: 999,
      stake: 'USDT',
      height: 220,
      history: {
        columns: ['__date_ts', 'total_quote'],
        data: samples.map(([date, value]) => [timestamp(date), value]),
        length: samples.length,
        capture_start_ts: capture,
      },
    },
    global: { plugins: [i18n, createPinia()] },
  })
  return wrapper.findComponent({ name: 'Chart' }).props('option')
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime('2026-03-15T12:00:00Z')
})
afterEach(() => vi.useRealTimers())
describe('period equity samples', () => {
  it('uses the last UTC daily sample, filters capture history, keeps gaps and uses live equity for today', () => {
    const option = render(
      'daily',
      ['2026-03-15', '2026-03-14', '2026-03-13', '2026-03-12'],
      [
        ['2026-03-14T23:59:59', 120],
        ['2026-03-12T18:00:00', 110],
        ['2026-03-14T00:00:00', 115],
        ['2026-03-12T09:00:00', 90],
        ['2026-03-15T00:00:00', 130],
      ],
      timestamp('2026-03-12T12:00:00'),
    )
    expect(option.series[0].data).toEqual([110, null, 120, 999])
    expect(option.series[0].z).toBeGreaterThan(option.series[1].z)
    expect(option.tooltip.formatter([{ dataIndex: 2 }])).toContain('120.00 USDT')
  })
  it.each([
    ['weekly', ['2026-03-09', '2026-03-02'], '2026-03-08T23:59:59', '2026-03-09T00:00:00'],
    ['monthly', ['2026-03-01', '2026-02-01'], '2026-02-28T23:59:59', '2026-03-01T00:00:00'],
  ] as const)('keeps %s end boundaries exclusive', (period, dates, last, next) => {
    const option = render(
      period,
      [...dates],
      [
        [next, 300],
        [last, 220],
      ],
    )
    expect(option.series[0].data).toEqual([220, 999])
  })
})

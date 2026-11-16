import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TradeTable from '@/components/trades/TradeTable.vue'
import { i18n } from '@/i18n'

describe('trade table rendering modes', () => {
  it('returns to page one when entering all-records mode', async () => {
    const wrapper = mount(TradeTable, {
      props: {
        rows: [],
        headers: [],
        sortBy: [],
        pageSize: 20,
        page: 2,
        filter: 'all',
        resetKey: '',
        stake: 'USDT',
        durationOf: () => null,
      },
      global: { plugins: [i18n], stubs: { VDataTable: true, VDataTableVirtual: true } },
    })
    expect(wrapper.emitted('update:page')).toBeUndefined()
    await wrapper.setProps({ pageSize: 0 })
    expect(wrapper.emitted('update:page')?.at(-1)).toEqual([1])
  })
})

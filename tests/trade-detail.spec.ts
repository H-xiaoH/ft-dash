import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'
import TradeDetail from '@/components/TradeDetail.vue'
import { i18n } from '@/i18n'
import type { Trade } from '@/lib/types'

const Dialog = defineComponent({
  props: { modelValue: Boolean },
  emits: ['afterLeave'],
  template: '<div><slot /></div>',
})

describe('trade detail departure', () => {
  it('retains the trade until the dialog finishes leaving', async () => {
    const trade = { trade_id: 1, pair: 'BTC/USDT', is_open: true, orders: [] } as unknown as Trade
    const wrapper = mount(TradeDetail, {
      props: { trade },
      global: { plugins: [i18n, createPinia()], stubs: { VDialog: Dialog } },
    })
    await wrapper.setProps({ trade: null })
    expect(wrapper.findComponent(Dialog).props('modelValue')).toBe(false)
    expect(wrapper.find('.trade-detail').text()).toContain('BTC/USDT')
    wrapper.findComponent(Dialog).vm.$emit('afterLeave')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.trade-detail').exists()).toBe(false)
  })
})

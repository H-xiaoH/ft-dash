import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VVirtualScroll } from 'vuetify/components/VVirtualScroll'
import { i18n } from '@/i18n'
import FilterMenu from '@/components/FilterMenu.vue'
const bot = reactive({
  logs: { log_count: 1, logs: [['2026-10-24 12:00:00', 1, 'worker', 'INFO', 'first']] },
  refreshing: false,
})
vi.mock('@/stores/bot', () => ({ useBotStore: () => bot }))
const LogsView = (await import('@/views/LogsView.vue')).default
beforeEach(() => {
  setActivePinia(createPinia())
  bot.logs = { log_count: 1, logs: [['2026-10-24 12:00:00', 1, 'worker', 'INFO', 'first']] }
})
const render = () => mount(LogsView, { global: { plugins: [i18n] } })
describe('virtual log following', () => {
  it('asks the virtual scroller to show the newest row when follow is enabled', async () => {
    const wrapper = render()
    const scroll = vi.spyOn(wrapper.findComponent(VVirtualScroll).vm, 'scrollToIndex')
    bot.logs.logs.push(['2026-10-24 12:01:00', 2, 'worker', 'ERROR', 'second'])
    await flushPromises()
    expect(scroll).toHaveBeenCalledWith(0)
  })
  it('leaves the viewport alone when follow is disabled', async () => {
    const wrapper = render()
    await wrapper.get('input[type="checkbox"]').setValue(false)
    const scroll = vi.spyOn(wrapper.findComponent(VVirtualScroll).vm, 'scrollToIndex')
    bot.logs.logs.push(['2026-10-24 12:01:00', 2, 'worker', 'ERROR', 'second'])
    await flushPromises()
    expect(scroll).not.toHaveBeenCalled()
  })
  it('renders an empty state for filtered logs and restores the newest row when visible again', async () => {
    const wrapper = render()
    wrapper.findComponent(FilterMenu).vm.$emit('update:modelValue', 'CRITICAL')
    await flushPromises()
    expect(wrapper.findComponent(VVirtualScroll).exists()).toBe(false)
    expect(wrapper.find('.v-empty-state').exists()).toBe(true)
    wrapper.findComponent(FilterMenu).vm.$emit('update:modelValue', 'INFO')
    await flushPromises()
    expect(wrapper.findComponent(VVirtualScroll).props('items')).toHaveLength(1)
  })
})

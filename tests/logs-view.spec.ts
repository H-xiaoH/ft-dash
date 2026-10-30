import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick, reactive } from 'vue'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

const { rawBot } = vi.hoisted(() => ({
  rawBot: {
    logs: { log_count: 1, logs: [['2026-10-24 12:00:00', 1, 'worker', 'INFO', 'first']] },
    refreshing: false,
  },
}))

const bot = reactive(rawBot)
let LogsView: typeof import('@/views/LogsView.vue').default

vi.mock('@/stores/bot', () => ({ useBotStore: () => bot }))

function logs(count: number) {
  return {
    log_count: count,
    logs: Array.from({ length: count }, (_, index) => [
      `2026-10-24 12:${String(index).padStart(2, '0')}:00`,
      index + 1,
      'worker',
      'INFO',
      `line ${index + 1}`,
    ]),
  }
}

function sizeScrollElement(element: HTMLElement, scrollTop: number) {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: 400 })
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: 100 })
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    writable: true,
    value: scrollTop,
  })
}

describe('LogsView', () => {
  beforeAll(async () => {
    LogsView = (await import('@/views/LogsView.vue')).default
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    bot.logs = logs(1)
  })

  it('scrolls the actual log container to the top when follow is on', async () => {
    const wrapper = mount(LogsView, { global: { plugins: [i18n] } })
    const element = wrapper.find('.logs').element as HTMLElement
    sizeScrollElement(element, 10)

    bot.logs = logs(2)
    await nextTick()
    await nextTick()

    expect(element.scrollTop).toBe(0)
    wrapper.unmount()
  })

  it('keeps the operator scroll position when follow is off', async () => {
    const wrapper = mount(LogsView, { global: { plugins: [i18n] } })
    const element = wrapper.find('.logs').element as HTMLElement
    sizeScrollElement(element, 22)
    const follow = wrapper.find('input[type="checkbox"]')
    await follow.setValue(false)

    bot.logs = logs(2)
    await nextTick()
    await nextTick()

    expect(element.scrollTop).toBe(22)
    wrapper.unmount()
  })

  it('returns to the top when a filtered log list becomes visible again', async () => {
    const wrapper = mount(LogsView, { global: { plugins: [i18n] } })
    const scrollTop = vi.spyOn(Element.prototype, 'scrollTop', 'set')

    try {
      await wrapper.find('.filter-menu__button').trigger('click')
      const critical = [...document.querySelectorAll<HTMLButtonElement>('.filter-menu__item')].find(
        (item) => item.textContent?.trim() === 'CRITICAL',
      )
      critical?.click()
      await nextTick()
      await nextTick()
      expect(wrapper.find('.logs').exists()).toBe(false)

      await wrapper.find('.filter-menu__button').trigger('click')
      const info = [...document.querySelectorAll<HTMLButtonElement>('.filter-menu__item')].find(
        (item) => item.textContent?.trim() === 'INFO',
      )
      info?.click()
      await nextTick()
      await nextTick()

      expect(scrollTop).toHaveBeenCalledWith(0)
    } finally {
      scrollTop.mockRestore()
      wrapper.unmount()
    }
  })
})

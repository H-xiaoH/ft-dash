import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BotList from '@/components/BotList.vue'
import { i18n } from '@/i18n'
import type { Bot } from '@/lib/bots'

const bots: Bot[] = ['first', 'second', 'third'].map((id) => ({
  id,
  name: id,
  baseUrl: `https://${id}.example`,
  username: id,
  password: '',
  wsToken: '',
  lastUsedAt: null,
}))
const setup = (onReorder?: (ids: string[]) => void) =>
  mount(BotList, {
    props: { bots, activeBotId: 'first', testing: null, testResult: {}, onReorder },
    attachTo: document.body,
    global: { plugins: [i18n] },
  })
const pointer = (el: Element, type: string, y = 0) => {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, { pointerId: 1, button: 0, clientX: 0, clientY: y })
  el.dispatchEvent(event)
}

describe('backend reorder handle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('previews only after a long press, commits once on release, and supports keyboard ordering', async () => {
    const wrapper = setup()
    try {
      const handle = wrapper.get('.bots__drag').element
      const container = wrapper.get('ul').element
      Object.assign(container, {
        setPointerCapture: vi.fn(),
        hasPointerCapture: () => true,
        releasePointerCapture: vi.fn(),
      })
      const target = wrapper.get('[data-bot-id="third"]').element
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: vi.fn(() => target),
      })
      pointer(handle, 'pointerdown')
      expect(container.setPointerCapture).toHaveBeenCalledWith(1)
      await vi.advanceTimersByTimeAsync(349)
      expect(wrapper.find('.is-dragging').exists()).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(wrapper.find('.is-dragging').exists()).toBe(true)
      pointer(handle, 'pointermove', 100)
      await wrapper.vm.$nextTick()
      expect(wrapper.findAll('.bots__name').map((el) => el.text())).toEqual([
        'second',
        'third',
        'first',
      ])
      expect(wrapper.emitted('reorder')).toBeUndefined()
      expect(wrapper.get('ul').element).toBe(container)
      pointer(handle, 'pointerup', 100)
      pointer(container, 'lostpointercapture')
      await wrapper.vm.$nextTick()
      expect(wrapper.emitted('reorder')).toEqual([[['second', 'third', 'first']]])
      await wrapper.get('.bots__drag').trigger('keydown', { key: 'ArrowDown' })
      expect(wrapper.emitted('reorder')?.at(-1)).toEqual([['second', 'first', 'third']])
    } finally {
      wrapper.unmount()
    }
  })

  it('keeps focus on the same backend handle after keyboard movement', async () => {
    const wrapper = setup((ids) => {
      void wrapper.setProps({ bots: ids.map((id) => bots.find((bot) => bot.id === id)!) })
    })
    try {
      const handle = wrapper.get('[data-bot-id="third"] .bots__drag')
      ;(handle.element as HTMLButtonElement).focus()
      await handle.trigger('keydown', { key: 'ArrowUp' })
      await wrapper.vm.$nextTick()
      expect(document.activeElement).toBe(handle.element)
      await handle.trigger('keydown', { key: 'ArrowUp' })
      await wrapper.vm.$nextTick()
      expect(document.activeElement).toBe(handle.element)
      expect(wrapper.findAll('.bots__name').map((el) => el.text())).toEqual([
        'third',
        'first',
        'second',
      ])
    } finally {
      wrapper.unmount()
    }
  })

  it('cancels a short or scrolling gesture and discards a cancelled drag', async () => {
    const wrapper = setup()
    try {
      const handle = wrapper.get('.bots__drag').element
      pointer(handle, 'pointerdown')
      pointer(handle, 'pointermove', 12)
      await vi.advanceTimersByTimeAsync(400)
      expect(wrapper.find('.is-dragging').exists()).toBe(false)
      pointer(handle, 'pointerup')
      pointer(handle, 'pointerdown')
      await vi.advanceTimersByTimeAsync(350)
      pointer(handle, 'pointercancel')
      expect(wrapper.emitted('reorder')).toBeUndefined()
      pointer(handle, 'pointerdown')
      wrapper.unmount()
      await vi.advanceTimersByTimeAsync(350)
      expect(wrapper.emitted('reorder')).toBeUndefined()
    } finally {
      if (wrapper.exists()) wrapper.unmount()
    }
  })
})

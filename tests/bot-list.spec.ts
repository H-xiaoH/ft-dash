import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BotList from '@/components/BotList.vue'
import { i18n } from '@/i18n'
import Sortable from 'sortablejs'
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

  it('delegates long-press drag to Sortable and commits the resulting order once', async () => {
    const wrapper = setup()
    const sortable = Sortable.get(wrapper.get('ul').element)!
    expect(sortable.option('forceFallback')).toBe(true)
    expect(sortable.option('delay')).toBe(350)
    expect(sortable.option('touchStartThreshold')).toBeGreaterThanOrEqual(1)
    expect(sortable.option('handle')).toBe('.bots__drag')
    const item = wrapper.get('[data-bot-id="first"]').element as HTMLElement
    sortable.sort(['second', 'third', 'first'])
    expect(wrapper.emitted('reorder')).toBeUndefined()
    const onEnd = sortable.option('onEnd')!
    onEnd.call(sortable, { item } as import('sortablejs').SortableEvent)
    expect(wrapper.emitted('reorder')).toEqual([[['second', 'third', 'first']]])
    expect(sortable.toArray()).toEqual(['first', 'second', 'third'])
    await wrapper.get('.bots__drag').trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.emitted('reorder')?.at(-1)).toEqual([['second', 'first', 'third']])
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

import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSegBlock } from '@/composables/useSegBlock'

const Harness = defineComponent({
  setup() {
    const container = ref<HTMLElement | null>(null)
    const active = ref('first')
    return { container, active, ...useSegBlock(container, () => active.value) }
  },
  template: `<div ref="container">
    <button class="seg__item" :aria-pressed="active === 'first'" data-width="80" data-left="2" @click="active = 'first'">First</button>
    <button class="seg__item" :aria-pressed="active === 'second'" data-width="100" data-left="84" @click="active = 'second'">Second</button>
    <span class="seg__block" :class="{ 'is-ready': blockReady }" :style="blockStyle" />
  </div>`,
})

describe('segmented control initial placement', () => {
  let frames: Map<number, FrameRequestCallback>
  let resize: ResizeObserverCallback
  let hidden: boolean
  beforeEach(() => {
    frames = new Map()
    hidden = false
    let id = 0
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        frames.set(++id, callback)
        return id
      }),
    )
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((key: number) => frames.delete(key)),
    )
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback
        }
        observe() {}
        disconnect() {}
      },
    )
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return hidden ? 0 : Number(this.dataset.width ?? 0)
    })
    vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return Number(this.dataset.left ?? 0)
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
  const frame = async () => {
    const pending = [...frames.values()]
    frames.clear()
    for (const callback of pending) callback(0)
    await nextTick()
  }

  it('places the block before enabling animation, then animates user selection', async () => {
    const wrapper = mount(Harness)
    try {
      await nextTick()
      const block = wrapper.get('.seg__block')
      expect(block.attributes('style')).toContain('width: 80px')
      expect(block.classes()).not.toContain('is-ready')
      await frame()
      expect(block.classes()).not.toContain('is-ready')
      await frame()
      expect(block.classes()).toContain('is-ready')
      await wrapper.get('button:nth-child(2)').trigger('click')
      await nextTick()
      expect(block.attributes('style')).toContain('translateX(84px)')
      expect(block.classes()).toContain('is-ready')
    } finally {
      wrapper.unmount()
    }
  })

  it('waits for a measurable item and cancels pending activation on unmount', async () => {
    hidden = true
    const wrapper = mount(Harness)
    await nextTick()
    expect(wrapper.get('.seg__block').classes()).not.toContain('is-ready')
    expect(frames.size).toBe(0)
    hidden = false
    resize([], {} as ResizeObserver)
    await nextTick()
    expect(frames.size).toBe(1)
    wrapper.unmount()
    expect(frames.size).toBe(0)
  })
})

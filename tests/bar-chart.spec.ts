import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BarChart from '@/components/BarChart.vue'
import type { BarItem } from '@/components/charts'

const PLOT_WIDTH = 300

/**
 * jsdom ships no PointerEvent, and the test-utils fallback builds a MouseEvent whose
 * clientX is read-only. Dispatch a real-shaped event instead.
 */
class FakePointerEvent extends MouseEvent {
  readonly pointerId: number
  readonly pointerType: string

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
    this.pointerType = init.pointerType ?? 'mouse'
  }
}

async function fire(
  wrapper: ReturnType<typeof mount>,
  type: string,
  init: PointerEventInit = {},
): Promise<void> {
  wrapper.find('.chart__plot').element.dispatchEvent(new FakePointerEvent(type, init))
  await nextTick()
}

function items(values: number[]): BarItem[] {
  return values.map((value, index) => ({
    label: `d${index}`,
    value,
    display: `${value > 0 ? '+' : ''}${value.toFixed(2)} USDT`,
    sub: '1 trade',
    tooltip: `Sep ${index + 1}, 2026`,
  }))
}

function stylePercent(
  element: { attributes: (name: string) => string | undefined },
  prop: string,
): number {
  const match = (element.attributes('style') ?? '').match(new RegExp(`${prop}: ([\\d.]+)%`))
  return match ? Number.parseFloat(match[1]) : Number.NaN
}

function activeBarIndex(wrapper: ReturnType<typeof mount>): number {
  return wrapper.findAll('.chart__bar').findIndex((bar) => bar.classes().includes('is-active'))
}

beforeEach(() => {
  // jsdom has no layout: give every element a plot-sized box, left edge at 0.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: PLOT_WIDTH,
    height: 176,
    left: 0,
    right: PLOT_WIDTH,
    top: 0,
    bottom: 176,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect)
  // Pointer capture is a browser API; record it so scrubbing state is exercised.
  HTMLElement.prototype.setPointerCapture = vi.fn()
  HTMLElement.prototype.releasePointerCapture = vi.fn()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('BarChart axis', () => {
  it('renders a gridline per tick, including the zero line', () => {
    const wrapper = mount(BarChart, { props: { items: items([1, -0.5, 0.25]) } })
    expect(wrapper.findAll('.chart__tick').length).toBeGreaterThan(2)
    expect(wrapper.findAll('.chart__tick--zero').length).toBe(1)
  })

  it('gives a profitable-only series the full plot height', () => {
    const wrapper = mount(BarChart, { props: { items: items([0.5, 1.2]) } })
    // The baseline sits at the bottom of the frame instead of the middle.
    expect(stylePercent(wrapper.find('.chart__tick--zero'), 'top')).toBeGreaterThan(85)
    const barTops = wrapper.findAll('.chart__bar').map((bar) => stylePercent(bar, 'top'))
    expect(Math.max(...barTops)).toBeLessThan(90)
    expect(Math.min(...barTops)).toBeLessThan(12)
  })

  it('draws a nub for a day with no trades', () => {
    const wrapper = mount(BarChart, { props: { items: items([0, 0.5]) } })
    expect(stylePercent(wrapper.findAll('.chart__bar')[0], 'height')).toBeLessThan(2)
  })

  it('formats the axis through the provided formatter and shows the unit', () => {
    const wrapper = mount(BarChart, {
      props: {
        items: items([2]),
        unit: 'USDT',
        axisFormat: (value: number) => `${value.toFixed(2)} U`,
      },
    })
    expect(wrapper.find('.chart__unit').text()).toBe('USDT')
    expect(wrapper.findAll('.chart__tick-label').map((node) => node.text())).toContain('2.00 U')
  })
})

describe('BarChart touch scrubbing', () => {
  it('selects the bar under the finger on touch down', async () => {
    const wrapper = mount(BarChart, { props: { items: items([1, -0.5, 0.25]) } })
    expect(wrapper.find('.chart__tooltip').exists()).toBe(false)

    await fire(wrapper, 'pointerdown', { pointerId: 7, pointerType: 'touch', clientX: 150 })

    expect(activeBarIndex(wrapper)).toBe(1)
    expect(wrapper.find('.chart__tooltip').text()).toContain('Sep 2, 2026')
    expect(wrapper.find('.chart__tooltip').text()).toContain('-0.50 USDT')
  })

  it('follows the finger while dragging across the bars', async () => {
    const wrapper = mount(BarChart, { props: { items: items([1, -0.5, 0.25]) } })

    await fire(wrapper, 'pointerdown', { pointerId: 3, pointerType: 'touch', clientX: 10 })
    expect(activeBarIndex(wrapper)).toBe(0)
    expect(wrapper.find('.chart__tooltip').text()).toContain('Sep 1, 2026')

    await fire(wrapper, 'pointermove', { pointerId: 3, pointerType: 'touch', clientX: 150 })
    expect(activeBarIndex(wrapper)).toBe(1)
    expect(wrapper.find('.chart__tooltip').text()).toContain('Sep 2, 2026')

    await fire(wrapper, 'pointermove', { pointerId: 3, pointerType: 'touch', clientX: 290 })
    expect(activeBarIndex(wrapper)).toBe(2)
    expect(wrapper.find('.chart__tooltip').text()).toContain('Sep 3, 2026')

    // Released finger keeps the last reading visible.
    await fire(wrapper, 'pointerup', { pointerId: 3, pointerType: 'touch', clientX: 290 })
    expect(activeBarIndex(wrapper)).toBe(2)
  })

  it('keeps the edge bar selected when the finger slides past the end', async () => {
    const wrapper = mount(BarChart, { props: { items: items([1, 2, 3]) } })
    await fire(wrapper, 'pointerdown', { pointerId: 5, pointerType: 'touch', clientX: 250 })
    expect(activeBarIndex(wrapper)).toBe(2)

    await fire(wrapper, 'pointermove', { pointerId: 5, pointerType: 'touch', clientX: 900 })
    expect(activeBarIndex(wrapper)).toBe(2)
  })

  it('ignores movement from a pointer it never captured', async () => {
    const wrapper = mount(BarChart, { props: { items: items([1, 2, 3]) } })
    await fire(wrapper, 'pointermove', { pointerId: 9, pointerType: 'touch', clientX: 150 })
    expect(wrapper.find('.chart__tooltip').exists()).toBe(false)
  })

  it('dismisses on a tap in the axis gutter and on pointer cancel', async () => {
    const wrapper = mount(BarChart, { props: { items: items([1, 2, 3]) } })

    await fire(wrapper, 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 150 })
    expect(wrapper.find('.chart__tooltip').exists()).toBe(true)

    await fire(wrapper, 'pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 340 })
    expect(wrapper.find('.chart__tooltip').exists()).toBe(false)

    await fire(wrapper, 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 150 })
    await fire(wrapper, 'pointercancel', { pointerId: 1, pointerType: 'touch', clientX: 150 })
    expect(wrapper.find('.chart__tooltip').exists()).toBe(false)
  })
})

describe('BarChart mouse and keyboard', () => {
  it('follows the mouse without a press', async () => {
    const wrapper = mount(BarChart, { props: { items: items([1, 2, 3]) } })
    await fire(wrapper, 'pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 250 })
    expect(activeBarIndex(wrapper)).toBe(2)
    await fire(wrapper, 'pointerleave', { pointerId: 1, pointerType: 'mouse' })
    expect(wrapper.find('.chart__tooltip').exists()).toBe(false)
  })

  it('keeps the tooltip open when a touch pointer leaves the plot', async () => {
    const wrapper = mount(BarChart, { props: { items: items([1, 2, 3]) } })
    await fire(wrapper, 'pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 150 })
    await fire(wrapper, 'pointerleave', { pointerId: 2, pointerType: 'touch' })
    expect(wrapper.find('.chart__tooltip').exists()).toBe(true)
  })

  it('moves the active bar with the arrow keys and closes on Escape', async () => {
    const wrapper = mount(BarChart, { props: { items: items([1, 2, 3]) } })
    const plot = wrapper.find('.chart__plot')
    await plot.trigger('keydown', { key: 'ArrowRight' })
    expect(activeBarIndex(wrapper)).toBe(0)
    await plot.trigger('keydown', { key: 'ArrowRight' })
    expect(activeBarIndex(wrapper)).toBe(1)
    await plot.trigger('keydown', { key: 'ArrowLeft' })
    expect(activeBarIndex(wrapper)).toBe(0)
    await plot.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('.chart__tooltip').exists()).toBe(false)
  })
})

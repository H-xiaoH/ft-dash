import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BarChart from '@/components/BarChart.vue'
import type { BarItem } from '@/components/charts'

function items(values: number[]): BarItem[] {
  return values.map((value, index) => ({
    label: `d${index}`,
    value,
    display: `${value > 0 ? '+' : ''}${value.toFixed(2)} USDT`,
    sub: '1 trade',
    tooltip: `Sep ${index + 1}, 2026`,
  }))
}

/** Reads `top: 12.34%` style values off a rendered element. */
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

describe('BarChart', () => {
  it('renders a gridline per tick, including the zero line', () => {
    const wrapper = mount(BarChart, { props: { items: items([1, -0.5, 0.25]) } })
    const ticks = wrapper.findAll('.chart__tick')
    expect(ticks.length).toBeGreaterThan(2)
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

  it('opens a tooltip on tap (touch-friendly) and closes it on Escape', async () => {
    const wrapper = mount(BarChart, { props: { items: items([1, -0.5]) } })
    expect(wrapper.find('.chart__tooltip').exists()).toBe(false)

    await wrapper.findAll('.chart__hit')[1].trigger('pointerdown')
    expect(wrapper.find('.chart__tooltip').text()).toContain('Sep 2, 2026')
    expect(wrapper.find('.chart__tooltip').text()).toContain('-0.50 USDT')
    expect(wrapper.findAll('.chart__bar')[1].classes()).toContain('is-active')

    await wrapper.find('.chart__plot').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('.chart__tooltip').exists()).toBe(false)
  })

  it('moves the active bar with the arrow keys', async () => {
    const wrapper = mount(BarChart, { props: { items: items([1, 2, 3]) } })
    const plot = wrapper.find('.chart__plot')
    await plot.trigger('keydown', { key: 'ArrowRight' })
    expect(activeBarIndex(wrapper)).toBe(0)
    await plot.trigger('keydown', { key: 'ArrowRight' })
    expect(activeBarIndex(wrapper)).toBe(1)
    await plot.trigger('keydown', { key: 'ArrowLeft' })
    expect(activeBarIndex(wrapper)).toBe(0)
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

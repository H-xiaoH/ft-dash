import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CandleChart from '@/components/CandleChart.vue'
import type { Candle, CandleEntry, CandleFormatters } from '@/components/charts'
import { i18n } from '@/i18n'

const formatters: CandleFormatters = { price: (value) => value.toFixed(4) }
const global = { plugins: [i18n] }

// jsdom ships no ResizeObserver; the chart only uses it to track its own width.
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

/** A flat series around `base`, so the entry line lands relative to a known range. */
function candles(base = 1, count = 40): Candle[] {
  return Array.from({ length: count }, (_, index) => ({
    open: base,
    high: base * 1.001,
    low: base * 0.999,
    close: base * (1 + (index % 2 ? 0.0005 : -0.0005)),
    time: null,
  }))
}

const mountChart = (entry: CandleEntry | null, height = 260) =>
  mount(CandleChart, {
    props: { candles: candles(), height, formatters, entry },
    global,
  })

const line = (wrapper: ReturnType<typeof mountChart>) => {
  const node = wrapper.find('.candles__entry line').element as SVGLineElement
  return {
    x1: Number(node.getAttribute('x1')),
    x2: Number(node.getAttribute('x2')),
    y1: Number(node.getAttribute('y1')),
    y2: Number(node.getAttribute('y2')),
    stroke: node.getAttribute('stroke'),
  }
}

describe('candle chart entry line', () => {
  it('draws a horizontal line tagged with the floating P&L', () => {
    const wrapper = mountChart({ price: 1, label: '+1.23', tone: 'good' })

    // Horizontal: the whole point is a price level, not a marker.
    expect(line(wrapper).y1).toBe(line(wrapper).y2)
    expect(line(wrapper).x1).toBeLessThan(line(wrapper).x2)
    expect(wrapper.find('.candles__entry-label').text()).toBe('+1.23')
  })

  it('colours the line and the tag by profit and loss', () => {
    const up = mountChart({ price: 1, label: '+1.23', tone: 'good' })
    expect(line(up).stroke).toBe('var(--long)')
    expect(up.find('.candles__entry-label').attributes('fill')).toBe('var(--long)')

    const down = mountChart({ price: 1, label: '-0.45', tone: 'bad' })
    expect(line(down).stroke).toBe('var(--short)')
    expect(down.find('.candles__entry-label').attributes('fill')).toBe('var(--short)')

    const unknown = mountChart({ price: 1, label: '', tone: 'flat' })
    expect(line(unknown).stroke).toBe('var(--text-3)')
    // No number to show, so no tag.
    expect(unknown.find('.candles__entry-label').exists()).toBe(false)
  })

  it('stays out of the way when the pair has no position', () => {
    const wrapper = mountChart(null)
    expect(wrapper.find('.candles__entry').exists()).toBe(false)
  })

  it('widens the price range so an entry far from the candles is still visible', () => {
    const height = 260
    const wrapper = mountChart({ price: 1.5, label: '+1.00', tone: 'good' }, height)

    // Inside the plot area rather than clamped to an edge or drawn off-canvas.
    expect(line(wrapper).y1).toBeGreaterThan(12)
    expect(line(wrapper).y1).toBeLessThan(height - 8)
  })
})

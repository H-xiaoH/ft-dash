import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CandleChart from '@/components/CandleChart.vue'
import type { Candle, CandleFormatters } from '@/components/charts'
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

/** A flat series around `base`; the entry line has to land relative to this range. */
function candles(base = 1, count = 40): Candle[] {
  return Array.from({ length: count }, (_, index) => ({
    open: base,
    high: base * 1.001,
    low: base * 0.999,
    close: base * (1 + (index % 2 ? 0.0005 : -0.0005)),
    time: null,
  }))
}

interface Line {
  x1: number
  x2: number
  y1: number
  y2: number
}

const entryLines = (wrapper: ReturnType<typeof mount>): Line[] =>
  wrapper
    .findAll('.candles__entry line')
    .map((node) => node.element as unknown as SVGLineElement)
    .map((line) => ({
      x1: Number(line.getAttribute('x1')),
      x2: Number(line.getAttribute('x2')),
      y1: Number(line.getAttribute('y1')),
      y2: Number(line.getAttribute('y2')),
    }))

describe('candle chart entry lines', () => {
  it('draws a horizontal line and a labelled tag for an open position', () => {
    const wrapper = mount(CandleChart, {
      props: { candles: candles(), height: 260, formatters, entries: [{ price: 1 }] },
      global,
    })

    const lines = entryLines(wrapper)
    expect(lines).toHaveLength(1)
    // Horizontal: the whole point is a price level, not a marker.
    expect(lines[0].y1).toBe(lines[0].y2)
    expect(lines[0].x1).toBeLessThan(lines[0].x2)

    // Locale-proof: the prefix comes from the same key the component uses.
    expect(wrapper.find('.candles__entry-label').text()).toContain('1.0000')
    expect(wrapper.find('.candles__entry-label').text()).toContain(i18n.global.t('chart.entry'))
  })

  it('stays out of the way when the pair has no position', () => {
    const wrapper = mount(CandleChart, {
      props: { candles: candles(), height: 260, formatters },
      global,
    })
    expect(entryLines(wrapper)).toHaveLength(0)
    expect(wrapper.find('.candles__entry-label').exists()).toBe(false)
  })

  it('widens the price range so an entry far from the candles is still visible', () => {
    const height = 260
    const wrapper = mount(CandleChart, {
      props: { candles: candles(), height, formatters, entries: [{ price: 1.5 }] },
      global,
    })

    const [line] = entryLines(wrapper)
    // Inside the plot area rather than clamped to an edge or drawn off-canvas.
    expect(line.y1).toBeGreaterThan(12)
    expect(line.y1).toBeLessThan(height - 8)
  })

  it('draws one line per open position and sizes the tag by side', () => {
    const wrapper = mount(CandleChart, {
      props: {
        candles: candles(),
        height: 260,
        formatters,
        entries: [
          { price: 1.0, isShort: false },
          { price: 1.01, isShort: true },
        ],
      },
      global,
    })

    expect(entryLines(wrapper)).toHaveLength(2)
    expect(wrapper.findAll('.candles__entry-label--long')).toHaveLength(1)
    expect(wrapper.findAll('.candles__entry-label--short')).toHaveLength(1)
  })
})

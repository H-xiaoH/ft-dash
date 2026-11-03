import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CandleChart from '@/components/CandleChart.vue'
import type { Candle, CandleEntry, CandleFormatters } from '@/components/charts'
import { i18n } from '@/i18n'
import type { CandleMark } from '@/lib/candles'

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
    // The tag paints its tone through a CSS class: an SVG fill attribute loses to the
    // shared axis rule, which is exactly the bug this replaced.
    expect(up.find('.candles__entry-label').classes()).toContain('candles__entry-label--good')
    expect(up.find('.candles__entry-label').attributes('fill')).toBeUndefined()

    const down = mountChart({ price: 1, label: '-0.45', tone: 'bad' })
    expect(line(down).stroke).toBe('var(--short)')
    expect(down.find('.candles__entry-label').classes()).toContain('candles__entry-label--bad')

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

  it('keeps axis numbers from printing underneath the P&L tag', () => {
    /*
     * The tag shares the right gutter with the axis, so a label within its height has to go.
     * A range of 1.0–2.0 puts the 25% gridline at 1.22; an entry filled exactly there would
     * otherwise print a tick number inside the tag.
     */
    const wrapper = mount(CandleChart, {
      props: {
        candles: Array.from({ length: 40 }, () => ({
          open: 1.5,
          high: 2,
          low: 1,
          close: 1.5,
          time: null,
        })),
        height: 260,
        formatters,
        entry: { price: 1.22, label: '+1.23', tone: 'good' },
      },
      global,
    })

    const tagBaseline = Number(
      (wrapper.find('.candles__entry-label').element as SVGTextElement).getAttribute('y'),
    )
    const labels = wrapper
      .findAll('.candles__axis')
      .map((node) => Number((node.element as SVGTextElement).getAttribute('y')))

    expect(labels.length).toBeGreaterThan(0)
    for (const y of labels) {
      expect(Math.abs(y - tagBaseline), `axis label at y=${y}`).toBeGreaterThan(11)
    }
  })
})

/** The wick of one candle: its centre line, from the high down to the low. */
const wick = (wrapper: ReturnType<typeof mountChart>, index: number) => {
  const node = wrapper.findAll('.candles__candle line')[index].element
  return {
    x: Number(node.getAttribute('x1')),
    top: Number(node.getAttribute('y1')),
    bottom: Number(node.getAttribute('y2')),
  }
}

const triangles = (wrapper: ReturnType<typeof mountChart>) =>
  wrapper.findAll('.candles__marks polygon').map((node) => {
    const [apex, left, right] = (node.attributes('points') ?? '')
      .split(' ')
      .map((pair) => pair.split(',').map(Number))
    return {
      kind: node.attributes('data-kind'),
      side: node.attributes('data-side'),
      fill: node.attributes('fill'),
      apex,
      left,
      right,
    }
  })

const mountWithMarks = (marks: CandleMark[], height = 260) =>
  mount(CandleChart, { props: { candles: candles(), height, formatters, marks }, global })

describe('candle chart marks', () => {
  it('hangs a buy signal under its candle and a sell signal over it', () => {
    const wrapper = mountWithMarks([
      { index: 10, side: 'buy', kind: 'signal' },
      { index: 20, side: 'sell', kind: 'signal' },
    ])
    const [buy, sell] = triangles(wrapper)

    expect(buy.kind).toBe('signal')
    expect(buy.side).toBe('buy')
    expect(buy.fill).toBe('var(--long)')
    expect(sell.side).toBe('sell')
    expect(sell.fill).toBe('var(--short)')

    // Buy: centred under the low, wings below the point, so the triangle points up at it.
    expect(buy.apex[0]).toBeCloseTo(wick(wrapper, 10).x, 1)
    expect(buy.apex[1]).toBeGreaterThan(wick(wrapper, 10).bottom)
    expect(buy.left[1]).toBeGreaterThan(buy.apex[1])
    expect(buy.right[1]).toBeGreaterThan(buy.apex[1])

    // Sell: centred over the high, wings above the point, so it points down at it.
    expect(sell.apex[0]).toBeCloseTo(wick(wrapper, 20).x, 1)
    expect(sell.apex[1]).toBeLessThan(wick(wrapper, 20).top)
    expect(sell.left[1]).toBeLessThan(sell.apex[1])
    expect(sell.right[1]).toBeLessThan(sell.apex[1])
  })

  it('points a fill right, at its price, to the left of its candle', () => {
    const wrapper = mountWithMarks([
      { index: 5, side: 'buy', kind: 'fill', price: 0.999 },
      { index: 6, side: 'sell', kind: 'fill', price: 1.02 },
    ])
    const [cheap, dear] = triangles(wrapper)

    expect(cheap.kind).toBe('fill')
    expect(cheap.apex[0]).toBeLessThan(wick(wrapper, 5).x)
    expect(cheap.left[0]).toBeLessThan(cheap.apex[0])
    expect(cheap.right[0]).toBeLessThan(cheap.apex[0])
    // Priced, not pinned to the candle: the dearer fill sits higher up the plot.
    expect(dear.apex[1]).toBeLessThan(cheap.apex[1])
  })

  it('widens the price range so a fill away from the candles is still on the chart', () => {
    const height = 260
    const wrapper = mountWithMarks([{ index: 3, side: 'buy', kind: 'fill', price: 3 }], height)
    const [fill] = triangles(wrapper)

    expect(fill.apex[1]).toBeGreaterThan(0)
    expect(fill.apex[1]).toBeLessThan(height)
  })

  it('draws nothing for a mark with no candle, or a fill with no price', () => {
    const wrapper = mountWithMarks([
      { index: 999, side: 'buy', kind: 'signal' },
      { index: 0, side: 'sell', kind: 'fill', price: null },
    ])

    expect(triangles(wrapper)).toEqual([])
  })
})

it('zooms around the pointer, keeps marks aligned and resets to the full range', async () => {
  const wrapper = mountWithMarks([
    { index: 0, side: 'buy', kind: 'signal' },
    { index: 38, side: 'sell', kind: 'signal' },
  ])
  vi.spyOn(wrapper.get('.candles').element, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    width: 600,
  } as DOMRect)
  const plot = wrapper.get('svg')
  plot.element.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 530 }))
  await wrapper.vm.$nextTick()
  const count = wrapper.findAll('.candles__candle').length
  expect(count).toBeLessThan(40)
  const [sell] = triangles(wrapper)
  expect(sell.side).toBe('sell')
  expect(sell.apex[0]).toBeCloseTo(wick(wrapper, count - 2).x, 1)

  const range = wrapper.get('input[type=range]')
  await range.setValue('0')
  expect(wrapper.findAll('.candles__candle')).toHaveLength(count)
  expect(triangles(wrapper).map((mark) => mark.side)).toEqual(['buy'])

  await plot.trigger('dblclick')
  expect(range.attributes('disabled')).toBeDefined()
  expect(wrapper.findAll('.candles__candle')).toHaveLength(40)
  expect(triangles(wrapper)).toHaveLength(2)
})

it('pinches around two fingers and pans across the loaded candles', async () => {
  const wrapper = mountWithMarks([{ index: 5, side: 'buy', kind: 'signal' }])
  vi.spyOn(wrapper.get('.candles').element, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    width: 600,
  } as DOMRect)
  const svg = wrapper.get('svg').element
  function pointer(type: string, pointerId: number, clientX: number) {
    const event = new MouseEvent(type, { clientX })
    Object.defineProperties(event, {
      pointerId: { value: pointerId },
      pointerType: { value: 'touch' },
    })
    svg.dispatchEvent(event)
  }

  pointer('pointerdown', 1, 200)
  pointer('pointerdown', 2, 350)
  pointer('pointermove', 2, 500)
  pointer('pointerup', 2, 500)
  await wrapper.vm.$nextTick()
  expect(wrapper.findAll('.candles__candle')).toHaveLength(20)
  expect(triangles(wrapper)).toHaveLength(0)

  pointer('pointermove', 1, 470)
  pointer('pointerup', 1, 470)
  await wrapper.vm.$nextTick()
  expect(wrapper.findAll('.candles__candle')).toHaveLength(20)
  expect(triangles(wrapper)).toHaveLength(1)
})

it('rescales prices by dragging the axis and restores autoscale on double click', async () => {
  const wrapper = mountChart(null)
  const axis = wrapper.get('.candles__price-axis')
  await wrapper.vm.$nextTick()

  const before = wick(wrapper, 0)
  function pointer(type: string, clientY: number) {
    const event = new MouseEvent(type, { clientY })
    Object.defineProperty(event, 'pointerId', { value: 1 })
    axis.element.dispatchEvent(event)
  }
  pointer('pointerdown', 150)
  pointer('pointermove', 95)
  pointer('pointerup', 95)
  await wrapper.vm.$nextTick()
  const after = wick(wrapper, 0)
  expect(after.bottom - after.top).toBeGreaterThan(before.bottom - before.top)
  expect(after.x).toBe(before.x)

  await axis.trigger('dblclick')
  expect(wick(wrapper, 0)).toEqual(before)

  await axis.trigger('keydown', { key: 'ArrowUp' })
  expect(wick(wrapper, 0)).not.toEqual(before)
  axis.element.dispatchEvent(new MouseEvent('click', { detail: 0 }))
  await wrapper.vm.$nextTick()
  expect(wick(wrapper, 0)).toEqual(before)
})

it('anchors historical candles across refreshes and follows updates at the right edge', async () => {
  const series = candles().map((candle, index) => ({ ...candle, time: index + 1 }))
  const wrapper = mountChart(null)
  await wrapper.setProps({ candles: series })
  await wrapper.get('svg').trigger('keydown', { key: '+' })
  const slider = wrapper.get('input[type=range]')
  await slider.setValue('4')
  const refresh = (offset: number) =>
    series.map((candle) => ({ ...candle, time: candle.time + offset }))
  await wrapper.setProps({ candles: refresh(1) })
  expect((slider.element as HTMLInputElement).value).toBe('3')

  await slider.setValue(slider.attributes('max'))
  await wrapper.setProps({ candles: refresh(2) })
  expect((slider.element as HTMLInputElement).value).toBe(slider.attributes('max'))
})

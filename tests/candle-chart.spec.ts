import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createChart, createSeriesMarkers } from 'lightweight-charts'
import { chartApi } from './support/chart'
import CandleChart from '@/components/CandleChart.vue'
import { i18n } from '@/i18n'

const candles = Array.from({ length: 40 }, (_, index) => ({
  open: 1,
  high: 1.001,
  low: 0.999,
  close: 1 + index / 10000,
  time: null,
}))
const render = () =>
  mount(CandleChart, {
    props: { candles, height: 260, formatters: { price: (n) => n.toFixed(4) } },
    global: { plugins: [i18n] },
  })
beforeEach(() => {
  vi.clearAllMocks()
  chartApi.timeScale.setVisibleLogicalRange({ from: 0, to: 39 })
})
describe('Lightweight Charts adapter', () => {
  it('passes OHLC in time order and enables exchange-style gestures', () => {
    render()
    expect(chartApi.series.setData).toHaveBeenCalledWith(
      candles.map((c, i) => ({
        time: i + 1,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    )
    expect(createChart).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        height: 260,
        handleScroll: {
          mouseWheel: false,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: false,
        },
        trackingMode: { exitMode: 0 },
        handleScale: expect.objectContaining({
          pinch: true,
          mouseWheel: true,
          axisPressedMouseMove: { price: true, time: true },
        }),
      }),
    )
    expect(createSeriesMarkers).not.toHaveBeenCalled()
  })
  it('replaces the cost price line without changing the candle range', async () => {
    const wrapper = render()
    chartApi.timeScale.setVisibleLogicalRange.mockClear()
    await wrapper.setProps({ entry: { price: 100, label: '+1.23', tone: 'good' } })
    expect(chartApi.series.createPriceLine).toHaveBeenLastCalledWith(
      expect.objectContaining({ price: 100, title: '+1.23', color: '#81D5AA' }),
    )
    await wrapper.setProps({ entry: { price: 0.1, label: '-1.23', tone: 'bad' } })
    expect(chartApi.series.removePriceLine).toHaveBeenCalledTimes(1)
    expect(chartApi.series.createPriceLine).toHaveBeenLastCalledWith(
      expect.objectContaining({ color: '#F2B8B5' }),
    )
    expect(chartApi.timeScale.setVisibleLogicalRange).not.toHaveBeenCalled()
    await wrapper.setProps({ entry: null })
    expect(chartApi.series.removePriceLine).toHaveBeenCalledTimes(2)
  })
  it('ignores invalid cost prices', async () => {
    const wrapper = render()
    for (const price of [NaN, Infinity, 0, -1])
      await wrapper.setProps({ entry: { price, label: '', tone: 'good' } })
    expect(chartApi.series.createPriceLine).not.toHaveBeenCalled()
  })
  it('refreshes formatted axis labels without resetting the visible candle range', async () => {
    const wrapper = render()
    chartApi.timeScale.setVisibleLogicalRange.mockClear()
    const tickTime = vi.fn(() => '08:00')
    await wrapper.setProps({
      formatters: {
        price: String,
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai',
        tickTime,
      },
    })
    const options = chartApi.chart.applyOptions.mock.lastCall![0]
    expect(options.localization.locale).toBe('zh-CN')
    expect(options.timeScale.tickMarkFormatter(1_800_000_000, 3)).toBe('08:00')
    expect(tickTime).toHaveBeenCalledWith(1_800_000_000_000, 'time')
    expect(chartApi.timeScale.setVisibleLogicalRange).not.toHaveBeenCalled()
  })
  it('selects candles with arrow keys and restores the latest readout with Escape', async () => {
    const wrapper = render()
    const plot = wrapper.get('.candles__plot')
    await plot.trigger('keydown', { key: 'ArrowLeft' })
    expect(chartApi.chart.setCrosshairPosition).toHaveBeenLastCalledWith(
      candles[38]!.close,
      39,
      chartApi.series,
    )
    await plot.trigger('keydown', { key: 'ArrowRight' })
    expect(chartApi.chart.setCrosshairPosition).toHaveBeenLastCalledWith(
      candles[39]!.close,
      40,
      chartApi.series,
    )
    await plot.trigger('keydown', { key: 'Escape' })
    expect(chartApi.chart.clearCrosshairPosition).toHaveBeenCalled()
  })
  it('zooms horizontally from the keyboard and restores both scales', async () => {
    const wrapper = render()
    await wrapper.get('.candles__plot').trigger('keydown', { key: '+' })
    expect(chartApi.timeScale.setVisibleLogicalRange).toHaveBeenLastCalledWith({
      from: 2.9250000000000007,
      to: 36.075,
    })
    await wrapper.get('.candles__plot').trigger('keydown', { key: 'Home' })
    expect(chartApi.priceScale.applyOptions).toHaveBeenCalledWith({ autoScale: true })
    expect(chartApi.timeScale.fitContent).toHaveBeenCalled()
  })
  it('zooms prices around the candle range, independently of cost lines', async () => {
    const wrapper = render()
    await wrapper.get('.candles__plot').trigger('keydown', { key: 'ArrowUp' })
    expect(chartApi.priceScale.setAutoScale).toHaveBeenCalledWith(false)
    const range = chartApi.priceScale.setVisibleRange.mock.lastCall?.[0]
    expect(range?.from).toBeCloseTo(0.915)
    expect(range?.to).toBeCloseTo(1.085)
  })
  it('scales prices only for single-finger drags started on the price axis', async () => {
    const wrapper = render()
    const plot = wrapper.get('.candles__plot')
    vi.spyOn(plot.element, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({
        x: 10,
        y: 20,
        width: 400,
        height: 260,
      }),
    )
    const drag = async (clientX: number, startY: number, endY: number) => {
      await plot.trigger('touchstart', { touches: [{ clientX, clientY: startY }] })
      await plot.trigger('touchmove', { touches: [{ clientX, clientY: endY }] })
      await plot.trigger('touchend')
    }
    await drag(200, 100, 160)
    await drag(390, 270, 300)
    expect(chartApi.priceScale.setVisibleRange).not.toHaveBeenCalled()
    chartApi.timeScale.setVisibleLogicalRange.mockClear()
    await drag(390, 100, 160)
    const zoomIn = chartApi.priceScale.setVisibleRange.mock.lastCall?.[0]
    expect(zoomIn?.from).toBeGreaterThan(0.9)
    expect(zoomIn?.from + zoomIn?.to).toBeCloseTo(2)
    await drag(390, 160, 100)
    expect(chartApi.priceScale.setVisibleRange.mock.lastCall?.[0]?.from).toBeLessThan(0.9)
    expect(chartApi.timeScale.setVisibleLogicalRange).not.toHaveBeenCalled()
  })
  it('preserves a historical viewport on refresh and follows the latest bars at the edge', async () => {
    const wrapper = render()
    chartApi.timeScale.setVisibleLogicalRange({ from: 2, to: 12 })
    await wrapper.setProps({ candles: [...candles, candles[0]] })
    expect(chartApi.timeScale.setVisibleLogicalRange).toHaveBeenLastCalledWith({ from: 2, to: 12 })
    chartApi.timeScale.setVisibleLogicalRange({ from: 20, to: 40 })
    await wrapper.setProps({ candles: [...candles, candles[0], candles[0]] })
    expect(chartApi.timeScale.setVisibleLogicalRange).toHaveBeenLastCalledWith({ from: 21, to: 41 })
  })
  it('resizes and releases the chart on unmount', async () => {
    const wrapper = render()
    await wrapper.setProps({ height: 320 })
    expect(wrapper.get('.candles').attributes('style')).toContain('height: 416px')
    wrapper.unmount()
    expect(chartApi.chart.remove).toHaveBeenCalledTimes(1)
  })
  it('shows the latest candle above the plot and follows the crosshair until it leaves', async () => {
    const wrapper = mount(CandleChart, {
      props: {
        candles: [
          { time: 1_800_000_000, open: 10, high: 12, low: 8, close: 9, volume: 1 },
          { time: 1_800_000_300, open: 10, high: 13, low: 9, close: 12, volume: 2 },
        ],
        formatters: {
          price: String,
          volume: String,
          change: (ratio) => `${Math.round(ratio * 100)}%`,
        },
      },
      global: { plugins: [i18n] },
    })
    const summary = wrapper.get('.candles__summary')
    expect(summary.text()).toContain('20%')
    expect(wrapper.get('.candles').element.firstElementChild).toBe(summary.element)
    const move = chartApi.chart.subscribeCrosshairMove.mock.lastCall![0] as (event: {
      time?: number
    }) => void
    move({ time: 1_800_000_000 })
    await wrapper.vm.$nextTick()
    expect(summary.text()).toContain('-10%')
    expect(wrapper.get('.candles__change').classes()).toContain('candles__down')
    move({})
    await wrapper.vm.$nextTick()
    expect(summary.text()).toContain('20%')
  })
})

it('anchors a fixed-length rolling candle window by time and still follows the latest bars', async () => {
  const timed = (shift: number) =>
    Array.from({ length: 180 }, (_, i) => ({
      open: 1,
      high: 1.1,
      low: 0.9,
      close: 1,
      time: 1_800_000_000_000 + (i + shift) * 300_000,
    }))
  const wrapper = mount(CandleChart, {
    props: { candles: timed(0), formatters: { price: (n) => n.toFixed(4) } },
    global: { plugins: [i18n] },
  })
  chartApi.timeScale.setVisibleLogicalRange({ from: 20.25, to: 40.25 })
  await wrapper.setProps({ candles: timed(1) })
  expect(chartApi.timeScale.setVisibleLogicalRange).toHaveBeenLastCalledWith({
    from: 19.25,
    to: 39.25,
  })
  chartApi.timeScale.setVisibleLogicalRange({ from: 150, to: 179 })
  await wrapper.setProps({ candles: timed(2) })
  expect(chartApi.timeScale.setVisibleLogicalRange).toHaveBeenLastCalledWith({ from: 150, to: 179 })
})

it('uses the first surviving candle when the leftmost visible candle expires', async () => {
  const timed = Array.from({ length: 180 }, (_, i) => ({
    open: 1,
    high: 1.1,
    low: 0.9,
    close: 1,
    time: 1_800_000_000_000 + i * 300_000,
  }))
  const wrapper = mount(CandleChart, {
    props: { candles: timed, formatters: { price: (n) => n.toFixed(4) } },
    global: { plugins: [i18n] },
  })
  chartApi.timeScale.setVisibleLogicalRange({ from: 0, to: 20 })
  await wrapper.setProps({
    candles: [...timed.slice(1), { ...timed[179], time: timed[179].time + 300_000 }],
  })
  expect(chartApi.timeScale.setVisibleLogicalRange).toHaveBeenLastCalledWith({ from: -1, to: 19 })
})

import { vi } from 'vitest'

const chartApi = vi.hoisted(() => {
  let range = { from: 0, to: 39 }
  const timeScale = {
    getVisibleLogicalRange: vi.fn(() => range),
    setVisibleLogicalRange: vi.fn((next: typeof range) => {
      range = next
    }),
    fitContent: vi.fn(),
    subscribeVisibleLogicalRangeChange: vi.fn(),
  }
  const priceScale = {
    width: () => 48,
    getVisibleRange: vi.fn(() => ({ from: 0.9, to: 1.1 })),
    setVisibleRange: vi.fn(),
    setAutoScale: vi.fn(),
    applyOptions: vi.fn(),
  }
  const series = { setData: vi.fn(), createPriceLine: vi.fn(() => ({})), removePriceLine: vi.fn() }
  const chart = {
    paneSize: () => ({ width: 352, height: 240 }),
    timeScale: () => timeScale,
    priceScale: () => priceScale,
    addSeries: vi.fn(() => series),
    subscribeCrosshairMove: vi.fn(),
    setCrosshairPosition: vi.fn(),
    clearCrosshairPosition: vi.fn(),
    remove: vi.fn(),
    resize: vi.fn(),
    applyOptions: vi.fn(),
  }
  return { chart, series, timeScale, priceScale }
})
vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => chartApi.chart),
  createSeriesMarkers: vi.fn(),
  CandlestickSeries: {},
  ColorType: { Solid: 'solid' },
  CrosshairMode: { Magnet: 1 },
  TickMarkType: { Year: 0, Month: 1, DayOfMonth: 2, Time: 3, TimeWithSeconds: 4 },
  TrackingModeExitMode: { OnTouchEnd: 0 },
  LineStyle: { Dashed: 2 },
}))

export { chartApi }

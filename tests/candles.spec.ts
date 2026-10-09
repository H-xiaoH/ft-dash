import { describe, expect, it } from 'vitest'
import type { Candle } from '@/components/charts'
import { collectCandleMarks } from '@/lib/candles'
import type { PairCandlesResponse, Trade } from '@/lib/types'

// Five candles, one every five minutes, as Freqtrade hands them over: UTC, no zone.
const times = [
  '2026-10-09 09:00:00',
  '2026-10-09 09:05:00',
  '2026-10-09 09:10:00',
  '2026-10-09 09:15:00',
  '2026-10-09 09:20:00',
]

const candles: Candle[] = times.map((time, index) => ({
  time,
  open: 1 + index / 100,
  high: 1.01 + index / 100,
  low: 0.99 + index / 100,
  close: 1 + index / 100,
}))

const meta = (columns: string[], data: (number | string | null)[][]): PairCandlesResponse => ({
  strategy: 'TestStrategy',
  pair: 'AAA/USDT',
  timeframe: '5m',
  timeframe_ms: 300_000,
  columns,
  data,
  length: data.length,
})

const trade = (over: Partial<Trade>): Trade =>
  ({ pair: 'AAA/USDT', open_date: times[0], open_rate: 1, ...over }) as Trade

describe('collectCandleMarks', () => {
  it('marks the candles the strategy signalled, both ways', () => {
    const marks = collectCandleMarks({
      meta: meta(
        ['date', 'close', 'enter_long', 'exit_long'],
        [
          [times[0], 1, 0, 0],
          [times[1], 1, 1, 0],
          [times[2], 1, 0, 1],
          [times[3], 1, 0, 0],
        ],
      ),
      candles,
      trades: [],
      pair: 'AAA/USDT',
    })

    expect(marks).toEqual([
      { index: 1, side: 'buy', kind: 'signal' },
      { index: 2, side: 'sell', kind: 'signal' },
    ])
  })

  it('marks both legs of the trades on this pair, at the price they happened', () => {
    const marks = collectCandleMarks({
      meta: null,
      candles,
      trades: [
        trade({ open_date: times[0], open_rate: 1.02, close_date: times[3], close_rate: 1.05 }),
        trade({ pair: 'BBB/USDT', open_date: times[1], open_rate: 9 }),
      ],
      pair: 'AAA/USDT',
    })

    expect(marks).toEqual([
      { index: 0, side: 'buy', kind: 'fill', price: 1.02 },
      { index: 3, side: 'sell', kind: 'fill', price: 1.05 },
    ])
  })

  it('leaves a position that is still open without an exit mark', () => {
    const marks = collectCandleMarks({
      meta: null,
      candles,
      trades: [trade({ open_date: times[2], open_rate: 1.03, close_date: null, close_rate: null })],
      pair: 'AAA/USDT',
    })

    expect(marks).toEqual([{ index: 2, side: 'buy', kind: 'fill', price: 1.03 }])
  })

  it('drops marks that fall outside the window the chart is showing', () => {
    const marks = collectCandleMarks({
      meta: meta(['date', 'enter_long'], [['2026-10-01 09:00:00', 1]]),
      candles,
      trades: [trade({ open_date: '2026-10-01 09:00:00' })],
      pair: 'AAA/USDT',
    })

    expect(marks).toEqual([])
  })

  it('reads ISO timestamps and bare epoch numbers as the same moments', () => {
    const atNine = Date.parse('2026-10-09T09:00:00Z')
    const marks = collectCandleMarks({
      meta: meta(['date', 'enter_long'], [[atNine, 1]]),
      candles,
      trades: [trade({ open_date: new Date(atNine).toISOString() })],
      pair: 'AAA/USDT',
    })

    expect(marks).toEqual([
      { index: 0, side: 'buy', kind: 'signal' },
      { index: 0, side: 'buy', kind: 'fill', price: 1 },
    ])
  })

  it('stays quiet about a strategy that never exposed the signal columns', () => {
    const marks = collectCandleMarks({
      meta: meta(['date', 'close'], [[times[0], 1]]),
      candles,
      trades: [],
      pair: 'AAA/USDT',
    })

    expect(marks).toEqual([])
  })
})

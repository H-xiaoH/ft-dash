import type { Candle } from '@/components/charts'
import { parseTimestamp } from './format'
import type { PairCandlesResponse, Trade } from './types'

/** The candle columns the chart always asks for, and the two only some strategies expose. */
export const CANDLE_COLUMNS = ['date', 'open', 'high', 'low', 'close', 'volume']
export const SIGNAL_COLUMNS = ['enter_long', 'exit_long']

/**
 * Something worth marking on a candle: what the strategy signalled, or what the bot actually
 * did. Signals ride against the candle; fills sit at the price they traded at.
 */
export interface CandleMark {
  /** Which candle it belongs to, by index into the candles the chart was given. */
  index: number
  side: 'buy' | 'sell'
  kind: 'signal' | 'fill'
  /** Fills only: the price the trade happened at. */
  price?: number | null
}

/** The strategy's signal columns, as the 1/0 flags Freqtrade hands over. */
const SIGNALS = [
  { column: 'enter_long', side: 'buy' },
  { column: 'exit_long', side: 'sell' },
] as const

/**
 * Every mark the candles of one pair deserve: the entries and exits the strategy signalled,
 * plus the ones the bot actually did. A mark with no candle to sit on is dropped — an old
 * trade, or a signal column the strategy never exposed.
 */
export function collectCandleMarks(input: {
  meta: PairCandlesResponse | null
  candles: Candle[]
  trades: Trade[]
  pair: string
}): CandleMark[] {
  const { meta, candles, trades, pair } = input

  const indexAt = new Map<number, number>()
  candles.forEach((candle, index) => {
    const at = parseTimestamp(candle.time ?? null)
    if (at !== null) indexAt.set(at, index)
  })
  /** Which candle a moment belongs to, or nothing when it falls outside the window. */
  const indexOf = (time: number | string | null | undefined) => {
    const at = parseTimestamp(time ?? null)
    return at === null ? undefined : indexAt.get(at)
  }

  const marks: CandleMark[] = []
  if (meta) {
    const dateColumn = meta.columns.indexOf('date')
    for (const { column, side } of SIGNALS) {
      const flagColumn = meta.columns.indexOf(column)
      if (flagColumn === -1) continue
      for (const row of meta.data) {
        if (!Number(row[flagColumn])) continue
        const index = indexOf(row[dateColumn])
        if (index !== undefined) marks.push({ index, side, kind: 'signal' })
      }
    }
  }

  for (const trade of trades) {
    if (trade.pair !== pair) continue
    // Both legs of a trade: the entry it opened at, and the exit it closed at.
    const legs = [
      { side: 'buy', date: trade.open_date, price: trade.open_rate },
      { side: 'sell', date: trade.close_date, price: trade.close_rate },
    ] as const
    for (const leg of legs) {
      const index = indexOf(leg.date)
      const price = Number(leg.price)
      if (index === undefined || !Number.isFinite(price)) continue
      marks.push({ index, side: leg.side, kind: 'fill', price })
    }
  }

  return marks
}

import type { Trade } from './types'

export type EntryTone = 'good' | 'bad' | 'flat'

export interface EntryMarker {
  /** Quantity-weighted average entry price of the open positions. */
  price: number
  /** Floating P&L in the stake currency, or null when nothing can tell us. */
  profit: number | null
  tone: EntryTone
}

/**
 * Collapses a pair's open positions into one reference line: the quantity-weighted average
 * entry price, and the floating P&L the bot reports for those positions — taking the bot's
 * numbers when it sends them is what keeps the chart agreeing with the positions table.
 *
 * Weighting is by quantity, not by stake: two fills of 100 @ 1.0 and 50 @ 2.0 average to
 * 1.333, which is the price an exchange shows. Weighting the same fills by their stake
 * would give 1.5, which is not a price anything trades at.
 *
 * @param referencePrice latest close, used only when no position carried a P&L figure.
 */
export function buildEntryMarker(
  trades: Trade[],
  referencePrice: number | null,
): EntryMarker | null {
  const open = trades.filter((trade) => Number.isFinite(trade.open_rate) && trade.open_rate > 0)
  if (!open.length) return null

  const total = open.reduce((sum, trade) => sum + quantityOf(trade), 0)
  const price =
    total > 0
      ? open.reduce((sum, trade) => sum + trade.open_rate * quantityOf(trade), 0) / total
      : open.reduce((sum, trade) => sum + trade.open_rate, 0) / open.length

  const profit = profitOf(open, referencePrice)
  return { price, profit, tone: toneOf(profit) }
}

function quantityOf(trade: Trade): number {
  return Number.isFinite(trade.amount) && trade.amount > 0 ? trade.amount : 0
}

/** The bot's own P&L when every position reports one, otherwise the move since entry. */
function profitOf(trades: Trade[], referencePrice: number | null): number | null {
  const reported: number[] = []
  for (const trade of trades) {
    const value = trade.profit_abs
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return estimatedProfit(trades, referencePrice)
    }
    reported.push(value)
  }
  return reported.reduce((sum, value) => sum + value, 0)
}

/** Fallback for a payload without P&L: the move from entry against the reference price. */
function estimatedProfit(trades: Trade[], referencePrice: number | null): number | null {
  if (referencePrice === null || !Number.isFinite(referencePrice)) return null
  let total = 0
  for (const trade of trades) {
    const quantity = quantityOf(trade)
    if (!quantity) return null
    total += (referencePrice - trade.open_rate) * quantity * (trade.is_short ? -1 : 1)
  }
  return total
}

function toneOf(profit: number | null): EntryTone {
  if (profit === null || !Number.isFinite(profit) || profit === 0) return 'flat'
  return profit > 0 ? 'good' : 'bad'
}

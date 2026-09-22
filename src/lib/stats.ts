import type { PerformanceEntry, Trade } from './types'

export interface PairStats {
  pair: string
  /** Authoritative totals from `/performance`. */
  count: number
  profitAbs: number
  profitRatio: number
  /** Derived from the closed trades that are currently loaded. */
  wins: number
  losses: number
  winRate: number | null
  avgDuration: number | null
  fees: number
  volume: number
  lastTrade: number | null
}

/**
 * Merges `/performance` (totals for every pair ever traded) with the loaded
 * closed trades, so per-pair win rate, holding time, fees and volume need no
 * extra request. Pairs whose trades fall outside the loaded window keep nulls
 * instead of inventing numbers.
 */
export function buildPairStats(performance: PerformanceEntry[], trades: Trade[]): PairStats[] {
  const byPair = new Map<string, Trade[]>()
  for (const trade of trades) {
    if (trade.is_open) continue
    const list = byPair.get(trade.pair)
    if (list) list.push(trade)
    else byPair.set(trade.pair, [trade])
  }

  return performance.map((entry) => {
    const pairTrades = byPair.get(entry.pair) ?? []
    const wins = pairTrades.filter((trade) => (trade.profit_ratio ?? 0) > 0).length
    const losses = pairTrades.filter((trade) => (trade.profit_ratio ?? 0) < 0).length
    const decided = wins + losses
    const durations = pairTrades
      .map((trade) => (trade.close_timestamp ?? 0) - trade.open_timestamp)
      .filter((duration) => duration > 0)
    const closes = pairTrades
      .map((trade) => trade.close_timestamp ?? 0)
      .filter((timestamp) => timestamp > 0)

    return {
      pair: entry.pair,
      count: entry.count,
      profitAbs: entry.profit_abs,
      profitRatio: entry.profit_ratio,
      wins,
      losses,
      winRate: decided > 0 ? (wins / decided) * 100 : null,
      avgDuration: durations.length
        ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length
        : null,
      fees: pairTrades.reduce(
        (sum, trade) => sum + (trade.fee_open_cost ?? 0) + (trade.fee_close_cost ?? 0),
        0,
      ),
      volume: pairTrades.reduce((sum, trade) => sum + (trade.open_trade_value ?? 0), 0),
      lastTrade: closes.length ? Math.max(...closes) : null,
    }
  })
}

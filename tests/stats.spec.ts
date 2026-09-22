import { describe, expect, it } from 'vitest'
import { buildPairStats } from '@/lib/stats'
import type { PerformanceEntry, Trade } from '@/lib/types'

function performance(
  pair: string,
  count: number,
  profitAbs: number,
  ratio: number,
): PerformanceEntry {
  return {
    pair,
    count,
    profit_abs: profitAbs,
    profit_ratio: ratio,
    profit_pct: ratio * 100,
    profit: ratio * 100,
  }
}

function trade(overrides: Partial<Trade> & { pair: string }): Trade {
  return {
    trade_id: Math.floor(Math.random() * 10_000),
    base_currency: 'X',
    quote_currency: 'USDT',
    is_open: false,
    exchange: 'okx',
    amount: 1,
    stake_amount: 10,
    strategy: 's',
    fee_open: 0.0005,
    open_date: '2026-09-01 00:00:00',
    open_timestamp: 1_000_000,
    open_rate: 1,
    open_trade_value: 10,
    close_timestamp: 1_000_000 + 3_600_000,
    profit_ratio: 0.01,
    ...overrides,
  } as Trade
}

describe('buildPairStats', () => {
  it('keeps the authoritative totals from /performance', () => {
    const [row] = buildPairStats([performance('BTC/USDT', 3, 1.5, 0.05)], [])
    expect(row).toMatchObject({ pair: 'BTC/USDT', count: 3, profitAbs: 1.5, profitRatio: 0.05 })
  })

  it('derives win rate, fees, volume, holding time and last close from the trades', () => {
    const trades = [
      trade({ pair: 'BTC/USDT', profit_ratio: 0.02, fee_open_cost: 0.01, fee_close_cost: 0.02 }),
      trade({ pair: 'BTC/USDT', profit_ratio: -0.01, fee_open_cost: 0.01, fee_close_cost: 0.01 }),
      trade({ pair: 'BTC/USDT', profit_ratio: 0.03, fee_open_cost: 0.01, fee_close_cost: 0.01 }),
    ]
    const [row] = buildPairStats([performance('BTC/USDT', 3, 0.4, 0.013)], trades)

    expect(row.wins).toBe(2)
    expect(row.losses).toBe(1)
    expect(row.winRate).toBeCloseTo(66.666, 2)
    expect(row.fees).toBeCloseTo(0.07, 6)
    expect(row.volume).toBeCloseTo(30, 6)
    expect(row.avgDuration).toBe(3_600_000)
    expect(row.lastTrade).toBe(1_000_000 + 3_600_000)
  })

  it('ignores open trades, so live positions never pollute closed statistics', () => {
    const [row] = buildPairStats(
      [performance('BTC/USDT', 1, 0.2, 0.02)],
      [
        trade({ pair: 'BTC/USDT', profit_ratio: 0.02 }),
        trade({ pair: 'BTC/USDT', is_open: true, close_timestamp: null, profit_ratio: null }),
      ],
    )
    expect(row.wins).toBe(1)
    expect(row.losses).toBe(0)
    expect(row.volume).toBe(10)
  })

  it('reports nulls instead of guesses when a pair has no loaded trades', () => {
    const [row] = buildPairStats([performance('OLD/USDT', 12, 9.9, 0.3)], [])
    expect(row.winRate).toBeNull()
    expect(row.avgDuration).toBeNull()
    expect(row.lastTrade).toBeNull()
    expect(row.fees).toBe(0)
    expect(row.volume).toBe(0)
  })

  it('treats break-even trades as neither a win nor a loss', () => {
    const [row] = buildPairStats(
      [performance('BTC/USDT', 1, 0, 0)],
      [trade({ pair: 'BTC/USDT', profit_ratio: 0 })],
    )
    expect(row.wins).toBe(0)
    expect(row.losses).toBe(0)
    expect(row.winRate).toBeNull()
  })

  it('ignores missing or negative durations', () => {
    const [row] = buildPairStats(
      [performance('BTC/USDT', 1, 0.1, 0.01)],
      [
        trade({ pair: 'BTC/USDT', open_timestamp: 5_000_000, close_timestamp: 1_000_000 }),
        trade({ pair: 'BTC/USDT', close_timestamp: null }),
      ],
    )
    expect(row.avgDuration).toBeNull()
    // The second trade has no close time, the first still provides the latest one.
    expect(row.lastTrade).toBe(1_000_000)
  })
})

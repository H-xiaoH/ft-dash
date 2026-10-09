import { describe, expect, it } from 'vitest'
import { bucketTrades, zoneToday } from '@/lib/periods'
import type { Trade } from '@/lib/types'

/** A closed trade at a given instant, with the fields the bucketing reads. */
const closed = (at: string, profit = 1): Trade =>
  ({
    pair: 'AAA/USDT',
    is_open: false,
    close_timestamp: Date.parse(at),
    profit_abs: profit,
  }) as Trade

const SHANGHAI = 'Asia/Shanghai'

describe('bucketTrades', () => {
  it('files a trade under the operator’s day, not the UTC one', () => {
    const rows = bucketTrades(
      [
        // 17:30 UTC is already tomorrow in Shanghai — the boundary this whole thing is about.
        closed('2026-10-08T17:30:00Z', 2),
        closed('2026-10-09T07:00:00Z', 3),
        // 16:30 UTC is past midnight there, so it lands on the day after.
        closed('2026-10-09T16:30:00Z', 4),
      ],
      SHANGHAI,
      'daily',
    )

    expect(rows).toEqual([
      { date: '2026-10-09', abs_profit: 5, trade_count: 2 },
      { date: '2026-10-10', abs_profit: 4, trade_count: 1 },
    ])
  })

  it('keeps UTC days when UTC is the zone', () => {
    const rows = bucketTrades([closed('2026-10-08T17:30:00Z', 2)], 'UTC', 'daily')

    expect(rows).toEqual([{ date: '2026-10-08', abs_profit: 2, trade_count: 1 }])
  })

  it('starts ISO weeks on Monday and months on the first', () => {
    const sunday = closed('2026-10-11T10:00:00Z', 1)
    const monday = closed('2026-10-12T10:00:00Z', 2)
    const nextMonth = closed('2026-11-02T10:00:00Z', 4)

    // A Sunday closes the week that started six days before it; the Monday opens the next.
    expect(bucketTrades([sunday, monday, nextMonth], SHANGHAI, 'weekly')).toEqual([
      { date: '2026-10-05', abs_profit: 1, trade_count: 1 },
      { date: '2026-10-12', abs_profit: 2, trade_count: 1 },
      { date: '2026-11-02', abs_profit: 4, trade_count: 1 },
    ])
    // Both October trades are one month, though, whatever week they fell in.
    expect(bucketTrades([sunday, monday, nextMonth], SHANGHAI, 'monthly')).toEqual([
      { date: '2026-10-01', abs_profit: 3, trade_count: 2 },
      { date: '2026-11-01', abs_profit: 4, trade_count: 1 },
    ])
  })

  it('ignores positions that are still open, and trades with no close time', () => {
    const open = {
      is_open: true,
      close_timestamp: Date.parse('2026-10-09T10:00:00Z'),
      profit_abs: 9,
    }
    const noClose = { is_open: false, close_timestamp: null, profit_abs: 9 }

    expect(bucketTrades([open as Trade, noClose as Trade], SHANGHAI, 'daily')).toEqual([])
  })

  it('carries the opening balances forward from the capital the account started with', () => {
    const rows = bucketTrades(
      [closed('2026-10-08T10:00:00Z', 10), closed('2026-10-09T10:00:00Z', 5)],
      SHANGHAI,
      'daily',
      100,
    )

    // The first day opened on the starting capital; the second on that, plus the first result.
    expect(rows.map((row) => row.starting_balance)).toEqual([100, 110])
    expect(rows.map((row) => row.rel_profit)).toEqual([0.1, 5 / 110])
  })

  it('leaves the balances out when the bot has not reported a starting capital', () => {
    const [row] = bucketTrades([closed('2026-10-09T10:00:00Z')], SHANGHAI, 'daily')

    expect(row.starting_balance).toBeUndefined()
    expect(row.rel_profit).toBeUndefined()
  })
})

describe('zoneToday', () => {
  it('is the operator’s today, not UTC’s', () => {
    const justAfterMidnightInShanghai = Date.parse('2026-10-08T17:30:00Z')

    expect(zoneToday(SHANGHAI, justAfterMidnightInShanghai)).toBe('2026-10-09')
    expect(zoneToday('UTC', justAfterMidnightInShanghai)).toBe('2026-10-08')
  })
})

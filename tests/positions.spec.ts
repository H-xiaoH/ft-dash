import { describe, expect, it } from 'vitest'
import { buildEntryMarker } from '@/lib/positions'
import type { Trade } from '@/lib/types'

/** Only the fields the marker reads; the rest of a freqtrade trade is noise here. */
function position(over: Partial<Trade> & { open_rate: number; amount: number }): Trade {
  return {
    trade_id: 1,
    pair: 'AAA/USDT',
    open_timestamp: 0,
    ...over,
  } as Trade
}

describe('buildEntryMarker', () => {
  it('uses the fill price itself when a pair has one position', () => {
    const marker = buildEntryMarker(
      [position({ open_rate: 0.10676, amount: 250, profit_abs: 1.23 })],
      null,
    )
    expect(marker?.price).toBeCloseTo(0.10676, 10)
    expect(marker?.profit).toBe(1.23)
    expect(marker?.tone).toBe('good')
  })

  it('weights several fills by quantity, not by stake', () => {
    // 100 @ 1.0 plus 50 @ 2.0 is 1.333…, the price an exchange shows. Weighting the same
    // fills by their stake (100 and 100) would give 1.5, which no fill ever traded at.
    const marker = buildEntryMarker(
      [
        position({ open_rate: 1, amount: 100, profit_abs: 0 }),
        position({ open_rate: 2, amount: 50, profit_abs: 0 }),
      ],
      null,
    )
    expect(marker?.price).toBeCloseTo(4 / 3, 10)
  })

  it('falls back to a plain mean when quantities are unusable', () => {
    const marker = buildEntryMarker(
      [
        position({ open_rate: 1, amount: 0, profit_abs: 0 }),
        position({ open_rate: 2, amount: 0, profit_abs: 0 }),
      ],
      null,
    )
    expect(marker?.price).toBe(1.5)
  })

  it('reads down as profit for a short', () => {
    const marker = buildEntryMarker(
      [position({ open_rate: 2, amount: 10, is_short: true, profit_abs: 4 })],
      null,
    )
    expect(marker?.tone).toBe('good')
  })

  it('sums the P&L the bot reports for the pair', () => {
    const marker = buildEntryMarker(
      [
        position({ open_rate: 1, amount: 10, profit_abs: 0.5 }),
        position({ open_rate: 1, amount: 10, profit_abs: -0.2 }),
      ],
      null,
    )
    expect(marker?.profit).toBeCloseTo(0.3, 10)
    expect(marker?.tone).toBe('good')
  })

  it('estimates from the latest close when the payload carries no P&L', () => {
    const marker = buildEntryMarker([position({ open_rate: 1, amount: 10 })], 1.1)
    expect(marker?.profit).toBeCloseTo(1, 10)
    expect(marker?.tone).toBe('good')
  })

  it('leaves the tone neutral when there is neither P&L nor a reference price', () => {
    const marker = buildEntryMarker([position({ open_rate: 1, amount: 10, profit_abs: 0 })], null)
    expect(marker?.tone).toBe('flat')
  })

  it('has nothing to draw for a pair with no open position', () => {
    expect(buildEntryMarker([], 1)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { toCsv } from '@/lib/csv'

describe('toCsv', () => {
  it('joins rows with commas and newlines', () => {
    expect(
      toCsv([
        ['pair', 'profit'],
        ['BTC/USDT', 1.5],
      ]),
    ).toBe('pair,profit\nBTC/USDT,1.5')
  })

  it('quotes cells containing separators, quotes and newlines', () => {
    expect(toCsv([['a,b', 'say "hi"', 'line\nbreak']])).toBe('"a,b","say ""hi""","line\nbreak"')
  })

  it('renders empty cells for null and undefined', () => {
    expect(toCsv([[null, undefined, 'x']])).toBe(',,x')
  })
})

import { describe, expect, it } from 'vitest'
import {
  direction,
  formatCompact,
  formatDuration,
  formatMoney,
  formatNumber,
  formatPercent,
  formatPrice,
  formatRatio,
  formatSignedMoney,
  parseTimestamp,
  toNumber,
} from '@/lib/format'

describe('format helpers', () => {
  it('treats nullish and non-numeric values as missing', () => {
    expect(toNumber(null)).toBeNull()
    expect(toNumber(undefined)).toBeNull()
    expect(toNumber('')).toBeNull()
    expect(toNumber('abc')).toBeNull()
    expect(toNumber('12.5')).toBe(12.5)
    expect(formatNumber(null)).toBe('—')
  })

  it('formats numbers and money with a locale', () => {
    expect(formatNumber(1234.5, 'en', 2)).toBe('1,234.50')
    expect(formatNumber(1234.5, 'zh-CN', 0)).toBe('1,235')
    expect(formatMoney(105.3237, 'USDT', 'en', 2)).toBe('105.32 USDT')
    // Sub-unit values keep four decimals so small positions stay readable.
    expect(formatMoney(0.123456, 'USDT', 'en', 2)).toBe('0.1235 USDT')
    expect(formatSignedMoney(4.769, 'USDT', 'en')).toBe('+4.77 USDT')
    expect(formatSignedMoney(-4.769, 'USDT', 'en')).toBe('-4.77 USDT')
  })

  it('formats ratios and percentages separately', () => {
    expect(formatRatio(0.0706)).toBe('+7.06%')
    expect(formatRatio(-0.0106)).toBe('-1.06%')
    expect(formatRatio(null)).toBe('—')
    expect(formatPercent(4.6)).toBe('4.60%')
    expect(formatPercent(4.6, 'en', 2, '—', true)).toBe('+4.60%')
  })

  it('scales price precision to the magnitude', () => {
    expect(formatPrice(1234.5678, 'en')).toBe('1,234.57')
    expect(formatPrice(0.04221, 'en')).toBe('0.04221')
    expect(formatPrice(0.00000123, 'en')).toBe('0.00000123')
  })

  it('formats compact volumes', () => {
    expect(formatCompact(445.2)).toBe('445.2')
    expect(formatCompact(15400)).toBe('15.4K')
  })

  it('parses epoch seconds, milliseconds and Freqtrade UTC strings', () => {
    expect(parseTimestamp(1_700_000_000)).toBe(1_700_000_000_000)
    expect(parseTimestamp(1_700_000_000_000)).toBe(1_700_000_000_000)
    expect(parseTimestamp('2026-09-21 19:28:22')).toBe(Date.parse('2026-09-21T19:28:22Z'))
    expect(parseTimestamp('2026-09-21T19:28:22Z')).toBe(Date.parse('2026-09-21T19:28:22Z'))
    expect(parseTimestamp('nonsense')).toBeNull()
  })

  it('renders durations with a locale-specific unit set', () => {
    const ms = 3 * 86_400_000 + 2 * 3_600_000
    expect(formatDuration(ms)).toBe('3d 2h')
    expect(formatDuration(ms, { day: '天', hour: '小时', minute: '分', second: '秒' })).toBe(
      '3天 2小时',
    )
    expect(formatDuration(90_000, { day: 'd', hour: 'h', minute: 'm', second: 's' })).toBe('1m 30s')
    expect(formatDuration(-5_000)).toBe('0s')
  })

  it('reports direction for tone helpers', () => {
    expect(direction(1)).toBe(1)
    expect(direction(-1)).toBe(-1)
    expect(direction(0)).toBe(0)
    expect(direction(null)).toBe(0)
  })
})

import { describe, expect, it } from 'vitest'
import en from '@/i18n/locales/en'
import zhCN from '@/i18n/locales/zh-CN'

/**
 * Leaf paths of a vue-i18n catalogue, e.g. `trades.columns.pnl`. Arrays count as leaves:
 * the catalogues only ever hold strings, and a list on one side against a string on the
 * other is exactly the drift this test exists to catch.
 */
function keyPaths(messages: unknown, prefix = ''): string[] {
  if (typeof messages !== 'object' || messages === null || Array.isArray(messages)) {
    return prefix ? [prefix] : []
  }
  return Object.entries(messages as Record<string, unknown>)
    .flatMap(([key, value]) => keyPaths(value, prefix ? `${prefix}.${key}` : key))
    .sort()
}

describe('locale catalogues', () => {
  it('keeps zh-CN and en identical key for key', () => {
    expect(keyPaths(zhCN)).toEqual(keyPaths(en))
  })

  it('has a non-trivial catalogue', () => {
    expect(keyPaths(en).length).toBeGreaterThan(100)
  })
})

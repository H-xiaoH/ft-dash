import { describe, expect, it } from 'vitest'
import { RATIO_BANDS, ratioTone } from '@/lib/ratios'

/**
 * The tiles colour by these bands and the explanation quotes the same numbers, so this
 * test is what keeps the two in step.
 */
describe('ratio bands', () => {
  it('colours the unit-based ratios red below zero, amber below 1, green from 1', () => {
    for (const key of ['sharpe', 'sortino', 'calmar'] as const) {
      expect(ratioTone(-0.2, RATIO_BANDS[key])).toBe('u-neg')
      expect(ratioTone(0, RATIO_BANDS[key])).toBe('u-warn')
      expect(ratioTone(0.9, RATIO_BANDS[key])).toBe('u-warn')
      expect(ratioTone(1, RATIO_BANDS[key])).toBe('u-pos')
    }
  })

  it('gives SQN its own lines, 1.6 and 2.5', () => {
    expect(ratioTone(1.1, RATIO_BANDS.sqn)).toBe('u-neg')
    expect(ratioTone(1.6, RATIO_BANDS.sqn)).toBe('u-warn')
    expect(ratioTone(2.4, RATIO_BANDS.sqn)).toBe('u-warn')
    expect(ratioTone(2.5, RATIO_BANDS.sqn)).toBe('u-pos')
  })

  it('leaves a missing value uncoloured', () => {
    expect(ratioTone(null, RATIO_BANDS.sharpe)).toBe('')
    expect(ratioTone(undefined, RATIO_BANDS.sharpe)).toBe('')
  })
})

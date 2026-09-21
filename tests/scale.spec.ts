import { describe, expect, it } from 'vitest'
import { niceStep, niceTicks, signedDomain, valueToPercent } from '@/lib/scale'

describe('niceStep', () => {
  it('rounds up to 1/2/2.5/5/10 multiples of the magnitude', () => {
    expect(niceStep(0.09)).toBeCloseTo(0.1, 10)
    expect(niceStep(0.3)).toBeCloseTo(0.5, 10)
    expect(niceStep(1.2)).toBeCloseTo(2, 10)
    expect(niceStep(2.4)).toBeCloseTo(2.5, 10)
    expect(niceStep(4)).toBeCloseTo(5, 10)
    expect(niceStep(60)).toBeCloseTo(100, 10)
  })

  it('never returns zero or a negative step', () => {
    expect(niceStep(0)).toBe(1)
    expect(niceStep(-5)).toBe(1)
    expect(niceStep(Number.NaN)).toBe(1)
  })
})

describe('niceTicks', () => {
  it('covers the range with round values', () => {
    expect(niceTicks(0, 4)).toEqual([0, 1, 2, 3, 4])
    expect(niceTicks(0, 1)).toEqual([0, 0.25, 0.5, 0.75, 1])
  })

  it('always includes zero when the range spans it', () => {
    const ticks = niceTicks(-1.2, 0.8)
    expect(ticks).toContain(0)
    expect(ticks[0]).toBeLessThan(0)
    expect(ticks[ticks.length - 1]).toBeGreaterThan(0)
  })

  it('handles a degenerate range and garbage input', () => {
    expect(niceTicks(0, 0)).toEqual([0])
    expect(niceTicks(Number.NaN, 1)).toEqual([])
    expect(niceTicks(1, Number.POSITIVE_INFINITY)).toEqual([])
  })
})

describe('signedDomain', () => {
  it('keeps a profitable-only series filling the frame', () => {
    const { min, max } = signedDomain([0.5, 1.2, 0])
    expect(min).toBeLessThan(0)
    expect(min).toBeGreaterThan(-0.1) // just the padding, not a second half
    expect(max).toBeGreaterThan(1.2)
  })

  it('keeps a losing-only series filling the frame the other way round', () => {
    const { min, max } = signedDomain([-1.2, -0.5])
    expect(max).toBeGreaterThan(0)
    expect(max).toBeLessThan(0.1)
    expect(min).toBeLessThan(-1.2)
  })

  it('straddles zero for mixed results', () => {
    const { min, max } = signedDomain([-1, 3])
    expect(min).toBeLessThan(-1)
    expect(max).toBeGreaterThan(3)
  })

  it('survives an all-zero series', () => {
    expect(signedDomain([0, 0])).toEqual({ min: -1, max: 1 })
    expect(signedDomain([])).toEqual({ min: -1, max: 1 })
  })
})

describe('valueToPercent', () => {
  it('measures from the top of the plot', () => {
    expect(valueToPercent(10, 0, 10)).toBe(0)
    expect(valueToPercent(0, 0, 10)).toBe(100)
    expect(valueToPercent(5, 0, 10)).toBe(50)
    expect(valueToPercent(0, -10, 10)).toBe(50)
  })

  it('returns 0 for a degenerate domain', () => {
    expect(valueToPercent(5, 5, 5)).toBe(0)
  })
})

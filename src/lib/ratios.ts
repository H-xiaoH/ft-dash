import { toNumber, type Numberish } from '@/lib/format'

export type RatioKey = 'sharpe' | 'sqn' | 'sortino' | 'calmar'

/** The two lines that decide the colour of a ratio tile. */
export interface RatioBands {
  /** Under this the number is red. */
  weak: number
  /** From this up it is green; in between it is amber. */
  good: number
}

/** Sharpe, Sortino and Calmar are all read against 1; a negative ratio is outright bad. */
const UNIT_BANDS: RatioBands = { weak: 0, good: 1 }

/**
 * The reading bands, in one place: the tiles colour by these and the explanation quotes the
 * same numbers, so the colour and the text cannot drift apart.
 */
export const RATIO_BANDS: Record<RatioKey, RatioBands> = {
  sharpe: UNIT_BANDS,
  sortino: UNIT_BANDS,
  calmar: UNIT_BANDS,
  // Van Tharp's System Quality Number: below 1.6 is poor, 2.5 and up is good.
  sqn: { weak: 1.6, good: 2.5 },
}

/** The tile colour for a ratio: `u-neg`, `u-warn`, `u-pos`, or nothing when there is no value. */
export function ratioTone(value: Numberish, bands: RatioBands): string {
  const ratio = toNumber(value)
  if (ratio === null) return ''
  if (ratio < bands.weak) return 'u-neg'
  return ratio < bands.good ? 'u-warn' : 'u-pos'
}

/** Axis helpers for the hand-rolled charts. Pure functions, unit tested. */

/**
 * Rounds a raw step up to the nearest 1 / 2 / 2.5 / 5 / 10 × 10ⁿ value so tick
 * labels read as round numbers (0.5, 1, 2.5, 10 …) instead of 0.437.
 */
export function niceStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const normalized = rawStep / magnitude
  // Round *up* so a tick is never finer than the raw step.
  const factor =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10
  return factor * magnitude
}

/**
 * Tick values covering [min, max], always including zero when the range spans it.
 * Returned ascending, with at most `count + 2` entries.
 */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return []
  if (min === max) return [min]
  const [low, high] = min < max ? [min, max] : [max, min]
  const step = niceStep((high - low) / Math.max(1, count))
  const ticks: number[] = []
  const start = Math.ceil(low / step - 1e-9) * step
  for (let value = start; value <= high + step * 1e-9; value += step) {
    ticks.push(Number(value.toPrecision(12)))
  }
  // The grid is anchored on multiples of `step`, so a range spanning zero always
  // contains a zero tick without special casing.
  return ticks
}

/**
 * Maps a value in [min, max] to a percentage measured from the top of the plot,
 * which is how the bar chart positions bars and the zero baseline.
 */
export function valueToPercent(value: number, min: number, max: number): number {
  if (max === min) return 0
  return ((max - value) / (max - min)) * 100
}

/**
 * Plot domain for a signed series: always contains zero plus a small margin, so a
 * series with only wins fills the frame instead of leaving half of it empty.
 */
export function signedDomain(values: number[], padRatio = 0.06): { min: number; max: number } {
  const finite = values.filter((value) => Number.isFinite(value))
  const rawMax = Math.max(0, ...finite)
  const rawMin = Math.min(0, ...finite)
  const span = rawMax - rawMin
  if (span === 0) return { min: -1, max: 1 }
  return { min: rawMin - span * padRatio, max: rawMax + span * padRatio }
}

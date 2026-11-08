/** Shared chart data contracts (kept out of SFCs: `<script setup>` cannot export). */

export interface Candle {
  open: number
  high: number
  low: number
  close: number
  /** Candle timestamp; optional so the chart also works without one. */
  time?: number | string | null
  volume?: number | null
}

/** Number/time formatting is injected so the chart matches the app's locale. */
export interface CandleFormatters {
  locale?: string
  timezone?: string
  price: (value: number) => string
  time?: (value: number | string | null | undefined) => string
  tickTime?: (value: number, unit: 'year' | 'month' | 'day' | 'time') => string
  volume?: (value: number) => string
  change?: (ratio: number) => string
}

/**
 * The open position's cost basis, drawn as a reference line on the candle chart. The tag is
 * pre-formatted by the view: the chart stays out of money semantics.
 */
export interface CandleEntry {
  price: number
  label: string
  tone: 'good' | 'bad' | 'flat'
}

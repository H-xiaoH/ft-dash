/** Shared chart data contracts (kept out of SFCs: `<script setup>` cannot export). */

export interface BarItem {
  label: string
  value: number
  /** Pre-formatted value for the tooltip/label. */
  display: string
  sub?: string
}

export interface Candle {
  open: number
  high: number
  low: number
  close: number
}

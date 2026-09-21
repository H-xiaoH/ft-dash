/** Locale-aware formatting helpers. All functions are pure; locale is explicit. */

export type Numberish = number | string | null | undefined

export interface DurationLabels {
  day: string
  hour: string
  minute: string
  second: string
}

const DEFAULT_DURATION_LABELS: DurationLabels = { day: 'd', hour: 'h', minute: 'm', second: 's' }

export function toNumber(value: Numberish): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

export function formatNumber(
  value: Numberish,
  locale = 'en',
  digits = 2,
  fallback = '—',
): string {
  const n = toNumber(value)
  if (n === null) return fallback
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n)
}

/** Compact trading numbers: 1.23 / 12.3 / 123 / 1.2K / 3.4M */
export function formatCompact(value: Numberish, locale = 'en', fallback = '—'): string {
  const n = toNumber(value)
  if (n === null) return fallback
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

export function formatMoney(
  value: Numberish,
  currency = '',
  locale = 'en',
  digits = 2,
  fallback = '—',
): string {
  const n = toNumber(value)
  if (n === null) return fallback
  const abs = Math.abs(n)
  const useDigits = abs !== 0 && abs < 1 ? 4 : digits
  const formatted = formatNumber(n, locale, useDigits)
  return currency ? `${formatted} ${currency}` : formatted
}

export function formatSignedMoney(
  value: Numberish,
  currency = '',
  locale = 'en',
  digits = 2,
  fallback = '—',
): string {
  const n = toNumber(value)
  if (n === null) return fallback
  return `${n > 0 ? '+' : ''}${formatMoney(n, currency, locale, digits)}`
}

/** Freqtrade returns ratios (0.07) and percents (7.0) in separate fields. */
export function formatRatio(
  value: Numberish,
  locale = 'en',
  digits = 2,
  fallback = '—',
): string {
  const n = toNumber(value)
  if (n === null) return fallback
  return `${n > 0 ? '+' : ''}${formatNumber(n * 100, locale, digits)}%`
}

export function formatPercent(
  value: Numberish,
  locale = 'en',
  digits = 2,
  fallback = '—',
  signed = false,
): string {
  const n = toNumber(value)
  if (n === null) return fallback
  const sign = signed && n > 0 ? '+' : ''
  return `${sign}${formatNumber(n, locale, digits)}%`
}

export function formatPrice(value: Numberish, locale = 'en', fallback = '—'): string {
  const n = toNumber(value)
  if (n === null) return fallback
  const abs = Math.abs(n)
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 5 : 8
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(n)
}

/**
 * Distances between now and `value`. `value` may be an epoch (ms or s) or an
 * ISO-ish UTC string without a timezone marker, which Freqtrade emits.
 */
export function parseTimestamp(value: Numberish): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    // Heuristic: seconds vs milliseconds.
    return value < 1e11 ? value * 1000 : value
  }
  const trimmed = value.trim()
  if (/^\d+(\.\d+)?$/.test(trimmed)) return parseTimestamp(Number(trimmed))

  /*
   * Date-only values ("2026-09-07", used by /daily, /weekly and /monthly) are UTC
   * midnights. They are built with Date.UTC rather than string concatenation:
   * engines disagree on shortened forms — Safari returns NaN for "2026-09-07Z"
   * while Chrome accepts it, which silently replaced dates with fallback dashes.
   */
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (dateOnly) {
    const year = Number(dateOnly[1])
    const month = Number(dateOnly[2])
    const day = Number(dateOnly[3])
    const utc = Date.UTC(year, month - 1, day)
    const parsedDate = new Date(utc)
    // Reject impossible dates such as 2026-02-31, which Date.UTC would roll over.
    if (parsedDate.getUTCMonth() !== month - 1 || parsedDate.getUTCDate() !== day) return null
    return utc
  }

  const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T')
  const withZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`
  const parsed = Date.parse(withZone)
  return Number.isFinite(parsed) ? parsed : null
}

export function formatDuration(
  ms: Numberish,
  labels: DurationLabels = DEFAULT_DURATION_LABELS,
  fallback = '—',
): string {
  const total = toNumber(ms)
  if (total === null) return fallback
  const seconds = Math.max(0, Math.floor(total / 1000))
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (days > 0) {
    return hours > 0
      ? `${days}${labels.day} ${hours}${labels.hour}`
      : `${days}${labels.day}`
  }
  if (hours > 0) {
    return minutes > 0
      ? `${hours}${labels.hour} ${minutes}${labels.minute}`
      : `${hours}${labels.hour}`
  }
  if (minutes > 0) return `${minutes}${labels.minute} ${secs}${labels.second}`
  return `${secs}${labels.second}`
}

export function formatDateTime(value: Numberish, locale = 'en', fallback = '—'): string {
  const ts = parseTimestamp(value)
  if (ts === null) return fallback
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(ts))
}

export function formatClock(value: Numberish, locale = 'en', fallback = '—'): string {
  const ts = parseTimestamp(value)
  if (ts === null) return fallback
  return new Intl.DateTimeFormat(locale, { timeStyle: 'medium' }).format(new Date(ts))
}

export function formatDateShort(value: Numberish, locale = 'en', fallback = '—'): string {
  const ts = parseTimestamp(value)
  if (ts === null) return fallback
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date(ts))
}

/**
 * Formats a date-only value (Freqtrade's daily/weekly/monthly rows) in UTC, so a
 * day never shifts for visitors west of Greenwich.
 */
export function formatDay(value: Numberish, locale = 'en', fallback = '—'): string {
  const ts = parseTimestamp(value)
  if (ts === null) return fallback
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(ts),
  )
}

export function toIsoDate(value: Date = new Date()): string {
  return value.toISOString().slice(0, 10)
}

export function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0)
}

/** Direction of a value for colour coding: 1 up, -1 down, 0 flat/unknown. */
export function direction(value: Numberish): -1 | 0 | 1 {
  const n = toNumber(value)
  if (n === null || n === 0) return 0
  return n > 0 ? 1 : -1
}

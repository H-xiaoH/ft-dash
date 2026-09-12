/* ------------------------------------------------------------------ numbers */

export function toNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/** First argument that resolves to a finite number. */
export function firstNumber(...values) {
  for (const value of values) {
    const n = toNumber(value)
    if (n !== null) return n
  }
  return null
}

export function fmtNumber(value, digits = 2) {
  const n = toNumber(value)
  if (n === null) return '—'
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/** Compact money-ish formatting that stays readable for both 0.0001 and 1_000_000. */
export function fmtAmount(value, digits = 2) {
  const n = toNumber(value)
  if (n === null) return '—'
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (Math.abs(n) >= 100_000) return (n / 1000).toFixed(1) + 'K'
  return fmtNumber(n, digits)
}

/**
 * Position sizes arrive padded to the exchange precision ("8.00000000"), so a
 * quantity of 8 read as "8.000000" in the table. Drop the zeros that carry no
 * information; `digits` stays the ceiling for genuinely fractional sizes.
 */
export function fmtQuantity(value, digits = 8) {
  const n = toNumber(value)
  if (n === null) return '—'
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}

export function fmtSigned(value, digits = 2) {
  const n = toNumber(value)
  if (n === null) return '—'
  return (n > 0 ? '+' : '') + fmtNumber(n, digits)
}

/** `ratio` is a fraction (0.0523) and is rendered as a percentage. */
export function fmtPercentRatio(ratio, digits = 2) {
  const n = toNumber(ratio)
  if (n === null) return '—'
  return (n > 0 ? '+' : '') + (n * 100).toFixed(digits) + '%'
}

export function fmtPrice(value, decimals = 8) {
  const n = toNumber(value)
  if (n === null) return '—'
  const abs = Math.abs(n)
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 6 : decimals
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits })
}

/* -------------------------------------------------------------------- dates */

/** freqtrade timestamps are seconds; dates are ISO strings. */
function toDate(value) {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return value
  if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value))) {
    const n = Number(value)
    if (!Number.isFinite(n) || n <= 0) return null
    return new Date(n > 1e12 ? n : n * 1000)
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Normalises a freqtrade timestamp to epoch *seconds*.
 * Recent freqtrade versions return milliseconds while older ones return seconds,
 * so anything above 1e11 is treated as milliseconds.
 */
export function toEpochSeconds(value) {
  const n = toNumber(value)
  if (n === null || n <= 0) return null
  return n > 1e11 ? n / 1000 : n
}

/** Current time in epoch seconds, matching `toEpochSeconds`. */
export function nowSeconds() {
  return Date.now() / 1000
}

export function fmtDate(value, withTime = true) {
  const date = toDate(value)
  if (!date) return '—'
  const pad = (n) => String(n).padStart(2, '0')
  const base = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  if (!withTime) return base
  return `${base} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fmtTime(value) {
  const date = toDate(value)
  if (!date) return '—'
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function fromNow(value) {
  const date = toDate(value)
  if (!date) return '—'
  const seconds = Math.round((Date.now() - date.getTime()) / 1000)
  return durationFromSeconds(seconds)
}

function durationFromSeconds(totalSeconds) {
  const n = toNumber(totalSeconds)
  if (n === null) return '—'
  const seconds = Math.max(0, Math.round(n))
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} 分`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 时 ${minutes % 60} 分`
  const days = Math.floor(hours / 24)
  return `${days} 天 ${hours % 24} 时`
}

/** Parses freqtrade's "1 day, 2:03:04" / "2:03:04" duration strings. */
function durationFromString(value) {
  if (!value || typeof value !== 'string') return null
  let seconds = 0
  const dayMatch = value.match(/(\d+)\s*day/)
  if (dayMatch) seconds += Number(dayMatch[1]) * 86400
  const timeMatch = value.match(/(\d+):(\d+):(\d+)/)
  if (timeMatch) {
    seconds += Number(timeMatch[1]) * 3600 + Number(timeMatch[2]) * 60 + Number(timeMatch[3])
  }
  return seconds || null
}

export function fmtDuration(value) {
  if (typeof value === 'string' && /[:\-]/.test(value)) {
    const parsed = durationFromString(value)
    return parsed === null ? value : durationFromSeconds(parsed)
  }
  return durationFromSeconds(value)
}

/* -------------------------------------------------------------- trade model */

/**
 * freqtrade exposes profit under a few names depending on version and whether the
 * trade is open. Prefer explicit API fields and fall back to computing from rates.
 * Returned values are always *ratios* (0.052 == 5.2%).
 */
export function tradeProfitRatio(trade) {
  if (!trade) return null

  const explicit = firstNumber(
    trade.profit_ratio,
    trade.close_profit_ratio,
    trade.current_profit,
    trade.profit_pct !== undefined && trade.profit_pct !== null
      ? toNumber(trade.profit_pct) / 100
      : null,
    trade.close_profit_pct !== undefined && trade.close_profit_pct !== null
      ? toNumber(trade.close_profit_pct) / 100
      : null,
  )
  if (explicit !== null) return explicit

  // Derive from entry/current-or-exit price when the API gave us no profit field.
  const openRate = toNumber(trade.open_rate)
  const closeRate = firstNumber(trade.close_rate, trade.current_rate)
  const amount = firstNumber(trade.amount, trade.amount_requested)
  const stake = toNumber(trade.stake_amount)
  if (closeRate === null || openRate === null || !openRate) return null

  const direction = trade.is_short ? -1 : 1
  const leverage = firstNumber(trade.leverage, 1) || 1
  if (amount !== null && stake) {
    const abs = (closeRate - openRate) * amount * direction
    return (abs / stake) * (trade.is_short ? 1 : 1) || (leverage ? abs / stake : null)
  }
  return ((closeRate - openRate) / openRate) * direction * leverage
}

export function tradeProfitAbs(trade) {
  if (!trade) return null
  return firstNumber(trade.profit_abs, trade.close_profit_abs, trade.current_profit_abs)
}

export function isOpenTrade(trade) {
  if (!trade) return false
  if (typeof trade.is_open === 'boolean') return trade.is_open
  return !trade.close_date && trade.close_timestamp == null
}

/* ------------------------------------------------------------------ colours */

export function profitClass(value) {
  const n = toNumber(value)
  if (n === null || n === 0) return 'neutral'
  return n > 0 ? 'profit' : 'loss'
}

/* --------------------------------------------------------------------- misc */

export function pairBase(pair) {
  return String(pair || '').split('/')[0] || '—'
}

export function pairQuote(pair) {
  return String(pair || '').split('/')[1]?.split(':')[0] || ''
}

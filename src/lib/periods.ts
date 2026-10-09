import type { Trade } from '@/lib/types'

/**
 * Which clock the app reads by. Freqtrade works in UTC and says so, but a day of trading is a
 * local thing to whoever is watching — so the front end is where the bucket edges are drawn,
 * from the trades themselves, and the choice belongs to the operator.
 */
export type TimezonePreference = 'browser' | 'UTC'
export type Period = 'daily' | 'weekly' | 'monthly'

/** One row of a period report: the same shape Freqtrade's `/daily` and friends hand over. */
export interface PeriodRow {
  /** The period's first day, `YYYY-MM-DD`, in the chosen zone. */
  date: string
  abs_profit: number
  trade_count: number
  /** Set when the current equity is known: the return is measured against it. */
  rel_profit?: number | null
  starting_balance?: number | null
}

/** One formatter per zone: building them is the expensive half, and there is a handful. */
const dayFormats = new Map<string, Intl.DateTimeFormat>()

function dayFormat(zone: string): Intl.DateTimeFormat {
  const cached = dayFormats.get(zone)
  if (cached) return cached
  let format: Intl.DateTimeFormat
  try {
    // en-CA prints the ISO order, `YYYY-MM-DD`, which is what a bucket key wants to be.
    format = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  } catch {
    format = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }
  dayFormats.set(zone, format)
  return format
}

/** The IANA zone a preference resolves to. */
export function resolveZone(preference: TimezonePreference): string {
  if (preference === 'UTC') return 'UTC'
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return zone || 'UTC'
}

/** The calendar day a moment falls on, in the given zone: `YYYY-MM-DD`. */
export function zoneDay(moment: number, zone: string): string {
  return dayFormat(zone).format(new Date(moment))
}

/** The day it is now, where the operator is. */
export function zoneToday(zone: string, now = Date.now()): string {
  return zoneDay(now, zone)
}

/** The Monday that starts the week a day belongs to, as a plain day number. */
function weekStart(day: string): string {
  const at = Date.parse(`${day}T00:00:00Z`)
  const weekday = new Date(at).getUTCDay()
  // getUTCDay: 0 is Sunday, and an ISO week starts on Monday.
  const back = weekday === 0 ? 6 : weekday - 1
  return new Date(at - back * 86_400_000).toISOString().slice(0, 10)
}

/** The first of the month a day belongs to. */
function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`
}

/** Which period a day is filed under, for the granularity being asked about. */
function periodStart(day: string, period: Period): string {
  if (period === 'weekly') return weekStart(day)
  if (period === 'monthly') return monthStart(day)
  return day
}

/**
 * The bot's period reports, rebuilt from the trades in the zone the operator picked: a day
 * ends where their day ends, not at midnight UTC.
 *
 * Only closed trades count — a position still open has no realised profit to report — and the
 * bucket is the day the trade *closed* on, which is what the bot's own reports aggregate by.
 * Rows come back oldest first, ready to be charted.
 */
export function bucketTrades(
  trades: Trade[],
  zone: string,
  period: Period,
  /** Today's equity, when it is known: the balances are walked back from it. */
  equity?: number | null,
): PeriodRow[] {
  const byPeriod = new Map<string, PeriodRow>()
  for (const trade of trades) {
    if (trade.is_open) continue
    const closed = trade.close_timestamp ?? 0
    if (!closed) continue
    const key = periodStart(zoneDay(closed, zone), period)
    const row = byPeriod.get(key)
    if (row) {
      row.abs_profit += trade.profit_abs ?? 0
      row.trade_count += 1
    } else {
      byPeriod.set(key, { date: key, abs_profit: trade.profit_abs ?? 0, trade_count: 1 })
    }
  }
  const rows = [...byPeriod.values()].sort((a, b) => a.date.localeCompare(b.date))

  if (typeof equity === 'number' && Number.isFinite(equity) && equity > 0) {
    /*
     * The bot's own balance history is a UTC series the app no longer reads, so each period's
     * opening balance is worked back from today's equity instead: what was there when a period
     * started is what is there now, less everything earned since.
     */
    let balance = equity
    for (let at = rows.length - 1; at >= 0; at -= 1) {
      const row = rows[at]
      row.starting_balance = balance - row.abs_profit
      row.rel_profit = row.starting_balance ? row.abs_profit / row.starting_balance : null
      balance = row.starting_balance
    }
  }

  return rows
}

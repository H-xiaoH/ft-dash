/**
 * The clock the app *reads* by, which is not the clock the bot *buckets* by.
 *
 * Freqtrade aggregates its day, week and month reports in UTC and says so; those reports are
 * taken as they come, and this preference is what turns their instants into times the operator
 * recognises: a trade closed at 23:30 UTC reads as 07:30 the next morning in Shanghai. The
 * choice — the browser's own zone, or the exchanges' UTC — is the pair FreqUI offers.
 *
 * A *date* is not an instant and is not converted: `formatDay` keeps printing date-only values
 * in UTC, so a report's "2026-10-09" stays the day the bot meant.
 */
export type TimezonePreference = 'browser' | 'UTC'

/** The IANA zone a preference resolves to. */
export function resolveZone(preference: TimezonePreference): string {
  if (preference === 'UTC') return 'UTC'
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return zone || 'UTC'
}

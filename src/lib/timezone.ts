/**
 * The clock the app *reads* by, which is not the clock the bot *buckets* by.
 *
 * Freqtrade aggregates its day, week and month reports in UTC and says so; those reports are
 * taken as they come, and this preference is what turns their instants into times the operator
 * recognises: a trade closed at 23:30 UTC reads as 07:30 the next morning in Shanghai. The
 * default follows the browser; any IANA zone can be pinned instead — market hours differ, so
 * "UTC" is not the only answer worth offering.
 *
 * A *date* is not an instant and is not converted: `formatDay` keeps printing date-only values
 * in UTC, so a report's "2026-10-09" stays the day the bot meant.
 */
export type TimezonePreference = 'browser' | (string & {})

/** The zone "follow the browser" resolves to, falling back to UTC where Intl is unavailable. */
export function browserZone(): string {
  if (typeof Intl === 'undefined') return 'UTC'
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

/** Whether a string names a zone this runtime can actually format in. */
export function isZone(zone: string): boolean {
  if (!zone) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/** The IANA zone a preference resolves to. */
export function resolveZone(preference: TimezonePreference): string {
  if (preference === 'browser') return browserZone()
  return isZone(preference) ? preference : browserZone()
}

/**
 * Every zone the runtime knows, `UTC` first. `Intl.supportedValuesOf` deliberately leaves
 * `UTC` out of its list (it is a fixed offset, not a region), so it is put back by hand.
 */
let zones: string[] | null = null
export function listZones(): string[] {
  if (zones) return zones
  const supported =
    typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl
      ? Intl.supportedValuesOf('timeZone')
      : []
  zones = ['UTC', ...supported.filter((zone) => zone !== 'UTC')]
  return zones
}

/**
 * A short right-aligned note for a zone, e.g. `UTC+08:00`. It is decoration on top of the
 * zone name, never the thing searched for: every offset string contains "UTC", so matching
 * on it would make a search for UTC return the whole list.
 */
export function zoneOffsetLabel(zone: string, locale = 'en-US'): string {
  if (!isZone(zone)) return ''
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    timeZoneName: 'longOffset',
  }).formatToParts(new Date())
  const name = parts.find((part) => part.type === 'timeZoneName')?.value ?? ''
  /*
   * `longOffset` spells the zero offset "GMT" and every other one "GMT+08:00"; the app
   * says UTC, so the label does too. The zero case carries no colon, hence the bare form.
   */
  return name.replace(/^GMT(?!\d)/, 'UTC').replace(/^GMT/, 'UTC')
}

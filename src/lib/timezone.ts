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

/** Answers are kept: probing a zone again per render is what made the settings page build two
 * formatters for every one of ~420 listed zones. */
const knownZones = new Map<string, boolean>()

/** Whether a string names a zone this runtime can actually format in. */
export function isZone(zone: string): boolean {
  if (!zone) return false
  const cached = knownZones.get(zone)
  if (cached !== undefined) return cached
  let valid = true
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
  } catch {
    valid = false
  }
  knownZones.set(zone, valid)
  return valid
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
 *
 * Building one costs an `Intl.DateTimeFormat`, and the settings page asks for all ~420 of
 * them, so each answer is kept for the day it was computed on. A DST switch while the page
 * stays open therefore keeps yesterday's offset until the next load.
 */
const offsetLabels = new Map<string, { day: number; label: string }>()

export function zoneOffsetLabel(zone: string, locale = 'en-US'): string {
  if (!isZone(zone)) return ''
  const day = Math.floor(Date.now() / 86_400_000)
  const key = `${locale}|${zone}`
  const cached = offsetLabels.get(key)
  if (cached?.day === day) return cached.label
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    timeZoneName: 'longOffset',
  }).formatToParts(new Date())
  const name = parts.find((part) => part.type === 'timeZoneName')?.value ?? ''
  /*
   * `longOffset` spells the zero offset "GMT" and every other one "GMT+08:00"; the app
   * says UTC, so the label does too. The zero case carries no colon, hence the bare form.
   */
  const label = name.replace(/^GMT(?!\d)/, 'UTC').replace(/^GMT/, 'UTC')
  offsetLabels.set(key, { day, label })
  return label
}

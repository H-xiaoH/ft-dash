import { describe, expect, it } from 'vitest'
import { browserZone, isZone, listZones, resolveZone, zoneOffsetLabel } from '@/lib/timezone'

describe('resolveZone', () => {
  it('hands UTC back as UTC rather than as the browser zone', () => {
    expect(resolveZone('UTC')).toBe('UTC')
  })

  it('follows the browser for the default preference', () => {
    expect(resolveZone('browser')).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
  })

  it('keeps a pinned zone as itself', () => {
    expect(resolveZone('Asia/Tokyo')).toBe('Asia/Tokyo')
  })

  it('falls back to the browser zone when the pin is not a zone this runtime knows', () => {
    expect(resolveZone('Mars/Olympus_Mons')).toBe(browserZone())
  })
})

describe('isZone', () => {
  it('accepts IANA names and rejects everything else', () => {
    expect(isZone('Asia/Shanghai')).toBe(true)
    expect(isZone('UTC')).toBe(true)
    expect(isZone('not a zone')).toBe(false)
    expect(isZone('')).toBe(false)
    expect(isZone('Mars/Olympus_Mons')).toBe(false)
  })
})

describe('listZones', () => {
  it('offers every zone the runtime knows, with UTC in front', () => {
    const zones = listZones()
    expect(zones[0]).toBe('UTC')
    // `supportedValuesOf` leaves UTC out — it is a fixed offset, not a region — so the list
    // is not simply the raw catalogue; everything else in it must still be present.
    expect(zones).toContain('Asia/Shanghai')
    expect(zones).toContain('America/New_York')
    expect(zones.filter((zone) => zone === 'UTC')).toHaveLength(1)
    expect(zones.length).toBeGreaterThan(100)
  })

  it('returns the same array every call, so a long list is built once', () => {
    expect(listZones()).toBe(listZones())
  })
})

describe('zoneOffsetLabel', () => {
  it('reads as the app says it, not as Intl spells it', () => {
    // `longOffset` says "GMT"; the app says UTC.
    expect(zoneOffsetLabel('Asia/Shanghai')).toMatch(/^UTC\+08:00$/)
    expect(zoneOffsetLabel('UTC')).toBe('UTC+00:00')
  })

  it('is empty for a zone this runtime cannot format', () => {
    expect(zoneOffsetLabel('Mars/Olympus_Mons')).toBe('')
  })
})

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSettingsStore } from '@/stores/settings'

/** How many rows the overview and the trade list show — and what a bad stored value does. */
describe('interface limits', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    setActivePinia(createPinia())
  })

  it('starts from the defaults', () => {
    const settings = useSettingsStore()

    expect(settings.dashboardOpenLimit).toBe(6)
    expect(settings.dashboardClosedLimit).toBe(6)
    expect(settings.tradesPerPage).toBe(20)
    expect(settings.tradesPageSize).toBe(20)
    expect(settings.pairTablePerPage).toBe(10)
    expect(settings.pairTablePageSize).toBe(10)
  })

  it('keeps what the operator picked, across a reload', () => {
    const settings = useSettingsStore()
    settings.dashboardOpenLimit = 3
    settings.dashboardClosedLimit = 12
    settings.tradesPerPage = 50
    settings.pairTablePerPage = 25

    // A reload is a fresh store over the same storage.
    setActivePinia(createPinia())
    const reloaded = useSettingsStore()

    expect(reloaded.dashboardOpenLimit).toBe(3)
    expect(reloaded.dashboardClosedLimit).toBe(12)
    expect(reloaded.tradesPerPage).toBe(50)
    expect(reloaded.pairTablePageSize).toBe(25)
  })

  it('clamps what is set at the moment it is read', () => {
    const settings = useSettingsStore()
    settings.dashboardOpenLimit = 0
    settings.dashboardClosedLimit = 999

    expect(settings.overviewOpenLimit).toBe(1)
    expect(settings.overviewClosedLimit).toBe(50)

    settings.tradesPerPage = 3
    expect(settings.tradesPageSize).toBe(5)
    settings.tradesPerPage = 999
    expect(settings.tradesPageSize).toBe(300)

    settings.pairTablePerPage = 0
    expect(settings.pairTablePageSize).toBe(5)
    settings.pairTablePerPage = 999
    expect(settings.pairTablePageSize).toBe(300)
  })

  it('offers the whole loaded window as the largest page', () => {
    const settings = useSettingsStore()
    // 300 is what the app loads, so a 300-row page is "everything" without a second mode.
    settings.tradesPerPage = 300
    expect(settings.tradesPageSize).toBe(300)

    setActivePinia(createPinia())
    expect(useSettingsStore().tradesPageSize).toBe(300)

    // Nothing above that is accepted, and nothing below 5.
    useSettingsStore().tradesPerPage = 900
    expect(useSettingsStore().tradesPageSize).toBe(300)
  })

  it('clamps stored values instead of rendering an empty list', () => {
    localStorage.setItem(
      'ftdash.settings.v1',
      JSON.stringify({
        dashboardOpenLimit: 0,
        dashboardClosedLimit: 900,
        tradesPerPage: 'many',
        pairTablePerPage: 'many',
      }),
    )
    const settings = useSettingsStore()

    // 0 would hide every row with no way back; junk falls back to the default.
    expect(settings.dashboardOpenLimit).toBe(1)
    expect(settings.dashboardClosedLimit).toBe(50)
    expect(settings.tradesPerPage).toBe(20)
    expect(settings.pairTablePageSize).toBe(10)
  })

  it('rounds halves and drops fractions', () => {
    localStorage.setItem(
      'ftdash.settings.v1',
      JSON.stringify({ dashboardOpenLimit: 4.6, tradesPerPage: 25.4 }),
    )
    const settings = useSettingsStore()

    expect(settings.dashboardOpenLimit).toBe(5)
    expect(settings.tradesPerPage).toBe(25)
  })

  it('settles a bad entry when the field is left', () => {
    const settings = useSettingsStore()

    // Inside the range: kept, and remembered as the fallback.
    settings.tradesPerPage = 30
    expect(settings.commitCount('tradesPerPage')).toBe(30)

    // Below the minimum takes the minimum, above the maximum the maximum.
    settings.tradesPerPage = 0
    expect(settings.commitCount('tradesPerPage')).toBe(5)
    settings.tradesPerPage = 999
    expect(settings.commitCount('tradesPerPage')).toBe(300)

    // Anything that is not a whole number goes back to the last saved number.
    settings.tradesPerPage = '' as unknown as number
    expect(settings.commitCount('tradesPerPage')).toBe(300)
    settings.tradesPerPage = 12.7
    expect(settings.commitCount('tradesPerPage')).toBe(300)
    settings.tradesPerPage = Number.NaN
    expect(settings.commitCount('tradesPerPage')).toBe(300)

    // The same rules, on a field with a different range.
    settings.dashboardOpenLimit = 0
    expect(settings.commitCount('dashboardOpenLimit')).toBe(1)
    settings.pairTablePerPage = 7
    expect(settings.commitCount('pairTablePerPage')).toBe(7)
  })

  it('falls back to the number in effect, not one cleared away', () => {
    const settings = useSettingsStore()
    settings.tradesPerPage = 300
    settings.commitCount('tradesPerPage')

    // Clearing local data puts every count back to its default.
    settings.clearStoredData()
    expect(settings.tradesPerPage).toBe(20)

    // A bad entry goes back to that default, not to the 300 that was just wiped.
    settings.tradesPerPage = 12.7
    expect(settings.commitCount('tradesPerPage')).toBe(20)
  })
})

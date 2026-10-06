import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { isLocalePreference, resolveLocalePreference } from '@/i18n'
import { useSettingsStore } from '@/stores/settings'

/** Pretend the browser is set to this language list. */
function systemSays(languages: string[]) {
  vi.stubGlobal('navigator', { languages, language: languages[0] ?? '' })
}

describe('locale preference', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    setActivePinia(createPinia())
    vi.unstubAllGlobals()
  })

  it('accepts the follow-system value and rejects anything else', () => {
    expect(isLocalePreference('system')).toBe(true)
    expect(isLocalePreference('zh-CN')).toBe(true)
    expect(isLocalePreference('fr')).toBe(false)
    expect(isLocalePreference(null)).toBe(false)
  })

  it('resolves a concrete pick without consulting the browser', () => {
    systemSays(['zh-CN'])
    expect(resolveLocalePreference('en')).toBe('en')
  })

  it('follows the browser until the operator picks a language', () => {
    systemSays(['zh-CN'])
    const settings = useSettingsStore()
    expect(settings.localePreference).toBe('system')
    expect(settings.locale).toBe('zh-CN')

    settings.localePreference = 'en'
    expect(settings.locale).toBe('en')
  })

  it('stores the preference, not the language it resolved to', async () => {
    systemSays(['zh-CN'])
    const settings = useSettingsStore()
    settings.localePreference = 'en'
    await nextTick()

    const stored = JSON.parse(localStorage.getItem('ftdash.settings.v1') ?? '{}')
    expect(stored.locale).toBe('en')

    // Following the system again must not be pinned to whatever was showing at the time.
    settings.localePreference = 'system'
    await nextTick()
    expect(JSON.parse(localStorage.getItem('ftdash.settings.v1') ?? '{}').locale).toBe('system')
  })

  it('re-resolves when the system language changes while following it', () => {
    systemSays(['en-US'])
    const settings = useSettingsStore()
    expect(settings.locale).toBe('en')

    systemSays(['zh-CN'])
    window.dispatchEvent(new Event('languagechange'))
    expect(settings.locale).toBe('zh-CN')

    // An explicit pick ignores the system from then on.
    settings.localePreference = 'en'
    systemSays(['zh-CN'])
    window.dispatchEvent(new Event('languagechange'))
    expect(settings.locale).toBe('en')
  })
})

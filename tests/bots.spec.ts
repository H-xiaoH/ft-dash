import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import {
  ACTIVE_BOT_KEY,
  BOTS_KEY,
  BOTS_SESSION_KEY,
  botNameFromUrl,
  defaultBotName,
  parseBots,
  serializeBots,
  type Bot,
} from '@/lib/bots'
import { useSettingsStore } from '@/stores/settings'

const bot = (over: Partial<Bot> = {}): Bot => ({
  id: 'bot-1',
  name: 'main',
  baseUrl: 'https://ft.example/api/v1',
  username: 'trader',
  password: 'secret',
  wsToken: '',
  lastUsedAt: null,
  ...over,
})

describe('bot helpers', () => {
  it('derives a default name from the API host', () => {
    expect(botNameFromUrl('https://ft.example.com/hxiaoh/api/v1')).toBe('ft.example.com')
    expect(botNameFromUrl('ft.example.com')).toBe('ft.example.com')
    expect(botNameFromUrl('')).toBe('')
  })

  it('names an unnamed bot after its username, not after the host', () => {
    expect(defaultBotName('freqtrader', 'https://ft.example.com/api/v1')).toBe('freqtrader')
    expect(defaultBotName('  ricky  ', 'https://ft.example.com/api/v1')).toBe('ricky')
    // Only a record with no username at all falls back to the host.
    expect(defaultBotName('', 'https://ft.example.com/api/v1')).toBe('ft.example.com')
  })

  it('drops entries that carry no address or no username', () => {
    const parsed = parseBots([
      { baseUrl: 'https://a.example/api/v1', username: 'a' },
      { baseUrl: '', username: 'b' },
      { baseUrl: 'https://c.example/api/v1' },
      'nonsense',
    ])
    expect(parsed).toHaveLength(1)
    // A stored entry with no name is named after its username.
    expect(parsed[0].name).toBe('a')
  })

  it('writes passwords to storage only when asked to', () => {
    expect(serializeBots([bot()], false)[0].password).toBe('')
    expect(serializeBots([bot()], true)[0].password).toBe('secret')
  })

  it('does not write passwords or ws tokens to localStorage when remember is off', async () => {
    localStorage.clear()
    sessionStorage.clear()
    setActivePinia(createPinia())
    const settings = useSettingsStore()
    settings.addBot({
      name: 'main',
      baseUrl: 'https://a.example/api/v1',
      username: 'a',
      password: 'p',
      wsToken: 'stream-secret',
    })

    await nextTick()
    expect(localStorage.getItem(BOTS_KEY)).not.toContain('"password":"p"')
    expect(localStorage.getItem(BOTS_KEY)).not.toContain('"wsToken":"stream-secret"')
    expect(localStorage.getItem('ftdash.settings.v1')).not.toContain('stream-secret')
    expect(sessionStorage.getItem(BOTS_SESSION_KEY)).toContain('"password":"p"')
    expect(sessionStorage.getItem(BOTS_SESSION_KEY)).toContain('"wsToken":"stream-secret"')

    settings.remember = true
    await nextTick()
    expect(localStorage.getItem(BOTS_KEY)).toContain('"password":"p"')
    expect(localStorage.getItem(BOTS_KEY)).toContain('"wsToken":"stream-secret"')
  })
})

describe('bots store', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    setActivePinia(createPinia())
  })

  it('keeps the password out of localStorage until the operator asks for it', async () => {
    const settings = useSettingsStore()
    settings.addBot({
      name: 'main',
      baseUrl: 'https://a.example/api/v1',
      username: 'a',
      password: 'p',
    })

    expect(localStorage.getItem(BOTS_KEY)).not.toContain('"password":"p"')
    expect(sessionStorage.getItem(BOTS_SESSION_KEY)).toContain('"password":"p"')

    settings.remember = true
    await nextTick()
    expect(localStorage.getItem(BOTS_KEY)).toContain('"password":"p"')
  })

  it('makes the first bot active and keeps the live credentials in step', () => {
    const settings = useSettingsStore()
    const first = settings.addBot({
      name: 'main',
      baseUrl: 'https://a.example/api/v1',
      username: 'a',
      password: 'p',
    })
    expect(settings.activeBotId).toBe(first.id)
    expect(settings.baseUrl).toBe('https://a.example/api/v1')
    expect(settings.username).toBe('a')

    // A second bot does not steal the selection on its own.
    const second = settings.addBot({
      name: 'side',
      baseUrl: 'https://b.example/api/v1',
      username: 'b',
      password: 'q',
    })
    expect(settings.activeBotId).toBe(first.id)

    settings.setActiveBot(second.id)
    expect(settings.baseUrl).toBe('https://b.example/api/v1')
    expect(settings.password).toBe('q')
    expect(settings.activeBotName).toBe('side')
  })

  it('falls back to the next bot when the active one is removed', () => {
    const settings = useSettingsStore()
    const first = settings.addBot({
      baseUrl: 'https://a.example/api/v1',
      username: 'a',
      password: 'p',
    })
    const second = settings.addBot({
      baseUrl: 'https://b.example/api/v1',
      username: 'b',
      password: 'q',
    })
    settings.setActiveBot(second.id)

    settings.removeBot(second.id)
    expect(settings.activeBotId).toBe(first.id)
    expect(settings.baseUrl).toBe('https://a.example/api/v1')

    // Removing the last one leaves no connection behind.
    settings.removeBot(first.id)
    expect(settings.bots).toHaveLength(0)
    expect(settings.activeBotId).toBe('')
    expect(settings.hasCredentials).toBe(false)
  })

  it('restores the remembered bot on the next visit', () => {
    const settings = useSettingsStore()
    settings.remember = true
    const first = settings.addBot({
      name: 'main',
      baseUrl: 'https://a.example/api/v1',
      username: 'a',
      password: 'p',
    })
    settings.addBot({ baseUrl: 'https://b.example/api/v1', username: 'b', password: 'q' })
    expect(JSON.parse(localStorage.getItem(ACTIVE_BOT_KEY) as string)).toBe(first.id)

    setActivePinia(createPinia())
    const reopened = useSettingsStore()
    expect(reopened.bots).toHaveLength(2)
    expect(reopened.activeBotId).toBe(first.id)
    expect(reopened.password).toBe('p')
  })

  it('clears persisted data and resets in-memory controls and region preferences', async () => {
    const settings = useSettingsStore()
    settings.addBot({
      name: 'main',
      baseUrl: 'https://a.example/api/v1',
      username: 'a',
      password: 'p',
      wsToken: 'stream-secret',
    })
    settings.localePreference = 'en'
    settings.timezone = 'UTC'
    settings.websocket = false
    settings.streamAuth = 'ws_token'
    settings.wsToken = 'stream-secret'
    settings.allowControls = true
    settings.notifications = true
    settings.remember = true
    settings.controlsAcknowledged = true

    settings.clearStoredData()
    await nextTick()

    expect(settings.bots).toHaveLength(0)
    expect(settings.activeBotId).toBe('')
    expect(settings.baseUrl).toBe('')
    expect(settings.username).toBe('')
    expect(settings.password).toBe('')
    expect(settings.wsToken).toBe('')
    expect(settings.localePreference).toBe('system')
    expect(settings.timezone).toBe('browser')
    expect(settings.websocket).toBe(true)
    expect(settings.streamAuth).toBe('auto')
    expect(settings.allowControls).toBe(false)
    expect(settings.notifications).toBe(false)
    expect(settings.remember).toBe(false)
    expect(settings.controlsAcknowledged).toBe(false)
    expect(localStorage.getItem(BOTS_KEY)).toBeNull()
    expect(localStorage.getItem(ACTIVE_BOT_KEY)).toBeNull()
    expect(sessionStorage.getItem(BOTS_SESSION_KEY)).toBeNull()
  })

  it('does not let a new bot inherit the active bot ws token', () => {
    const settings = useSettingsStore()
    const first = settings.addBot({
      name: 'main',
      baseUrl: 'https://a.example/api/v1',
      username: 'a',
      password: 'p',
      wsToken: 'old-token',
    })
    const second = settings.addBot({
      name: 'side',
      baseUrl: 'https://b.example/api/v1',
      username: 'b',
      password: 'q',
    })

    expect(first.wsToken).toBe('old-token')
    expect(second.wsToken).toBe('')
  })
})

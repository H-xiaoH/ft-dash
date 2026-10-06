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
})

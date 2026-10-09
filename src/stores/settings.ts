import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import {
  detectLocale,
  isLocalePreference,
  resolveLocalePreference,
  type AppLocale,
  type LocalePreference,
} from '@/i18n'
import {
  ACTIVE_BOT_KEY,
  BOTS_KEY,
  BOTS_SESSION_KEY,
  defaultBotName,
  newBotId,
  parseBots,
  serializeBots,
  type Bot,
  type BotInput,
} from '@/lib/bots'
import { readJson, removeKey, safeSessionStorage, writeJson } from '@/lib/storage'
import type { StreamAuthPreference } from '@/lib/stream'
import type { TimezonePreference } from '@/lib/timezone'
import { isZone } from '@/lib/timezone'

const SETTINGS_KEY = 'ftdash.settings.v1'

interface StoredSettings {
  locale: LocalePreference | null
  timezone: TimezonePreference
  websocket: boolean
  streamAuth: StreamAuthPreference
  wsToken: string
  allowControls: boolean
  notifications: boolean
  remember: boolean
  controlsAcknowledged: boolean
}

/** Nothing picked yet means "follow the browser", which is what the app did at boot. */
const DEFAULT_LOCALE: LocalePreference = 'system'

const DEFAULT_SETTINGS: StoredSettings = {
  locale: DEFAULT_LOCALE,
  /**
   * A day of trading is local to whoever is watching, so the app starts by reading the clock
   * the operator's browser is already on — their day, their hours.
   */
  timezone: 'browser',
  websocket: true,
  streamAuth: 'auto',
  wsToken: '',
  allowControls: false,
  notifications: false,
  /**
   * Off by default: the password then lives in sessionStorage and dies with the tab,
   * instead of sitting in localStorage until someone clears it.
   */
  remember: false,
  controlsAcknowledged: false,
}

export const STREAM_AUTH_OPTIONS: StreamAuthPreference[] = ['auto', 'ws_token']

function resolveStreamAuth(value: unknown): StreamAuthPreference {
  return STREAM_AUTH_OPTIONS.includes(value as StreamAuthPreference)
    ? (value as StreamAuthPreference)
    : DEFAULT_SETTINGS.streamAuth
}

/**
 * A stored zone survives only if the runtime still knows it: 'browser', or an IANA name
 * this Intl can format in. Anything else — an old value, a hand-edited entry — falls back
 * to the default rather than leaving the app formatting in a zone that does not exist.
 */
function resolveTimezone(value: unknown): TimezonePreference {
  if (value === 'browser') return 'browser'
  return typeof value === 'string' && isZone(value) ? value : DEFAULT_SETTINGS.timezone
}

/**
 * The list survives a reload as metadata in localStorage. Passwords ride along in
 * localStorage only when the operator asked to remember them; otherwise they live in
 * sessionStorage, so a reload inside the same tab still works but nothing hits the disk.
 */
function loadBots(): Bot[] {
  const local = parseBots(readJson<unknown>(BOTS_KEY, []))
  const session = parseBots(readJson<unknown>(BOTS_SESSION_KEY, [], safeSessionStorage()))
  if (!local.length) return session
  return local.map((bot) => {
    if (bot.password) return bot
    const tabCopy = session.find((entry) => entry.id === bot.id)
    return tabCopy?.password ? { ...bot, password: tabCopy.password } : bot
  })
}

export const useSettingsStore = defineStore('settings', () => {
  const persisted = readJson<Partial<StoredSettings>>(SETTINGS_KEY, {})

  const bots = ref<Bot[]>(loadBots())
  const storedActive = readJson<string | null>(ACTIVE_BOT_KEY, null)
  const activeBotId = ref(
    typeof storedActive === 'string' && bots.value.some((bot) => bot.id === storedActive)
      ? storedActive
      : (bots.value[0]?.id ?? ''),
  )
  const activeBot = computed(() => bots.value.find((bot) => bot.id === activeBotId.value) ?? null)

  const baseUrl = ref(activeBot.value?.baseUrl ?? import.meta.env.VITE_API_BASE_DEFAULT ?? '')
  const username = ref(activeBot.value?.username ?? '')
  const password = ref(activeBot.value?.password ?? '')
  /**
   * The pick is a preference, not a resolved language: "follow the system" has to keep
   * following it across reloads and across a system language change.
   */
  const localePreference = ref<LocalePreference>(
    isLocalePreference(persisted.locale) ? persisted.locale : DEFAULT_LOCALE,
  )
  const systemLocale = ref<AppLocale>(detectLocale())
  const locale = computed<AppLocale>(() =>
    localePreference.value === 'system'
      ? systemLocale.value
      : resolveLocalePreference(localePreference.value),
  )
  if (typeof window !== 'undefined') {
    window.addEventListener('languagechange', () => {
      systemLocale.value = detectLocale()
    })
  }
  const websocket = ref(persisted.websocket ?? DEFAULT_SETTINGS.websocket)
  const timezone = ref<TimezonePreference>(resolveTimezone(persisted.timezone))
  const streamAuth = ref(resolveStreamAuth(persisted.streamAuth))
  const wsToken = ref(
    activeBot.value?.wsToken ?? (typeof persisted.wsToken === 'string' ? persisted.wsToken : ''),
  )
  const allowControls = ref(persisted.allowControls ?? DEFAULT_SETTINGS.allowControls)
  const notifications = ref(persisted.notifications ?? DEFAULT_SETTINGS.notifications)
  const remember = ref(persisted.remember ?? DEFAULT_SETTINGS.remember)
  const controlsAcknowledged = ref(
    persisted.controlsAcknowledged ?? DEFAULT_SETTINGS.controlsAcknowledged,
  )

  /** True when we already hold a full credential set at startup. */
  const hasCredentials = computed(() => Boolean(baseUrl.value && username.value && password.value))
  const writesEnabled = computed(() => allowControls.value && controlsAcknowledged.value)
  const activeBotName = computed(() => activeBot.value?.name ?? '')
  /** The active bot has no password at hand: the operator has to type it again. */
  const needsPassword = computed(() => Boolean(activeBot.value) && password.value.length === 0)

  function persist() {
    writeJson(SETTINGS_KEY, {
      // The preference is what gets stored; the resolved language is derived from it.
      locale: localePreference.value,
      timezone: timezone.value,
      websocket: websocket.value,
      streamAuth: streamAuth.value,
      wsToken: wsToken.value,
      allowControls: allowControls.value,
      notifications: notifications.value,
      remember: remember.value,
      controlsAcknowledged: controlsAcknowledged.value,
    } satisfies StoredSettings)
  }

  function persistBots() {
    writeJson(BOTS_KEY, serializeBots(bots.value, remember.value))
    writeJson(BOTS_SESSION_KEY, serializeBots(bots.value, true), safeSessionStorage())
    writeJson(ACTIVE_BOT_KEY, activeBotId.value)
  }

  function clearStoredData() {
    removeKey(SETTINGS_KEY)
    removeKey(BOTS_KEY)
    removeKey(BOTS_SESSION_KEY, safeSessionStorage())
    removeKey(ACTIVE_BOT_KEY)
    bots.value = []
    activeBotId.value = ''
  }

  /** Drops the live connection but keeps the stored bot list. */
  function disconnect() {
    baseUrl.value = ''
    username.value = ''
    password.value = ''
    wsToken.value = ''
    activeBotId.value = ''
    persistBots()
  }

  /** Copies a bot's connection details into the live fields the rest of the app reads. */
  function applyBot(bot: Bot | null) {
    baseUrl.value = bot?.baseUrl ?? ''
    username.value = bot?.username ?? ''
    password.value = bot?.password ?? ''
    wsToken.value = bot?.wsToken ?? ''
  }

  function addBot(input: BotInput): Bot {
    const username = input.username.trim()
    const baseUrl = input.baseUrl.trim()
    const bot: Bot = {
      id: newBotId(),
      name: input.name?.trim() || defaultBotName(username, baseUrl),
      baseUrl,
      username,
      password: input.password,
      wsToken: input.wsToken?.trim() ?? wsToken.value,
      lastUsedAt: null,
    }
    bots.value = [...bots.value, bot]
    // The first bot has nothing to compete with, so it becomes the active one.
    if (!activeBotId.value) setActiveBot(bot.id)
    else persistBots()
    return bot
  }

  function updateBot(id: string, patch: Partial<BotInput>) {
    const index = bots.value.findIndex((bot) => bot.id === id)
    if (index < 0) return
    const current = bots.value[index]
    const baseUrl = patch.baseUrl?.trim() ?? current.baseUrl
    const username = patch.username?.trim() ?? current.username
    const next: Bot = {
      ...current,
      name:
        patch.name !== undefined
          ? patch.name.trim() || defaultBotName(username, baseUrl)
          : current.name,
      baseUrl,
      username,
      password: patch.password ?? current.password,
      wsToken: patch.wsToken?.trim() ?? current.wsToken,
    }
    bots.value = bots.value.map((bot, i) => (i === index ? next : bot))
    if (id === activeBotId.value) applyBot(next)
    persistBots()
  }

  function setActiveBot(id: string) {
    const bot = bots.value.find((entry) => entry.id === id)
    if (!bot) return
    bot.lastUsedAt = Date.now()
    activeBotId.value = bot.id
    applyBot(bot)
    persistBots()
    persist()
  }

  function removeBot(id: string) {
    const remaining = bots.value.filter((bot) => bot.id !== id)
    bots.value = remaining
    if (activeBotId.value !== id) {
      persistBots()
      return
    }
    if (remaining.length) {
      setActiveBot(remaining[0].id)
      return
    }
    disconnect()
  }

  watch(
    [
      localePreference,
      timezone,
      websocket,
      streamAuth,
      wsToken,
      allowControls,
      notifications,
      remember,
      controlsAcknowledged,
    ],
    persist,
  )

  /** Toggling "remember" rewrites the stored list with or without the passwords. */
  watch(remember, persistBots)

  return {
    bots,
    activeBot,
    activeBotId,
    activeBotName,
    needsPassword,
    baseUrl,
    username,
    password,
    locale,
    localePreference,
    timezone,
    websocket,
    streamAuth,
    wsToken,
    allowControls,
    notifications,
    remember,
    controlsAcknowledged,
    hasCredentials,
    writesEnabled,
    persistBots,
    clearStoredData,
    disconnect,
    addBot,
    updateBot,
    setActiveBot,
    removeBot,
  }
})

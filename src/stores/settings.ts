import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { detectLocale, isSupportedLocale, type AppLocale } from '@/i18n'
import {
  ACTIVE_BOT_KEY,
  BOTS_KEY,
  BOTS_SESSION_KEY,
  botNameFromUrl,
  newBotId,
  parseBots,
  serializeBots,
  type Bot,
  type BotInput,
} from '@/lib/bots'
import { readJson, removeKey, safeSessionStorage, writeJson } from '@/lib/storage'
import type { StreamAuthPreference } from '@/lib/stream'

const SETTINGS_KEY = 'ftdash.settings.v1'
/** Pre-multi-bot single-credential blob; read only to clean it up. */
const CREDENTIALS_KEY = 'ftdash.credentials.v1'

export interface StoredCredentials {
  baseUrl: string
  username: string
  password: string
}

interface StoredSettings {
  locale: AppLocale | null
  websocket: boolean
  streamAuth: StreamAuthPreference
  wsToken: string
  allowControls: boolean
  notifications: boolean
  remember: boolean
  controlsAcknowledged: boolean
}

const DEFAULT_SETTINGS: StoredSettings = {
  locale: null,
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

function readLegacyCredentials(): Partial<StoredCredentials> {
  const local = readJson<Partial<StoredCredentials>>(CREDENTIALS_KEY, {})
  if (local.baseUrl) return local
  return readJson<Partial<StoredCredentials>>(CREDENTIALS_KEY, {}, safeSessionStorage())
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

  /**
   * The single-credential blob from before multi-bot support is dropped rather than
   * migrated: guessing at a half-migrated state is worse than asking once.
   */
  const hadLegacyCredentials = Boolean(readLegacyCredentials().baseUrl)
  if (hadLegacyCredentials) {
    removeKey(CREDENTIALS_KEY)
    removeKey(CREDENTIALS_KEY, safeSessionStorage())
  }
  const legacyCleared = ref(hadLegacyCredentials && bots.value.length === 0)

  const baseUrl = ref(activeBot.value?.baseUrl ?? import.meta.env.VITE_API_BASE_DEFAULT ?? '')
  const username = ref(activeBot.value?.username ?? '')
  const password = ref(activeBot.value?.password ?? '')
  const locale = ref<AppLocale>(
    isSupportedLocale(persisted.locale) ? persisted.locale : detectLocale(),
  )
  const websocket = ref(persisted.websocket ?? DEFAULT_SETTINGS.websocket)
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
      locale: locale.value,
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
    removeKey(CREDENTIALS_KEY)
    removeKey(CREDENTIALS_KEY, safeSessionStorage())
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
    const bot: Bot = {
      id: newBotId(),
      name: input.name?.trim() || botNameFromUrl(input.baseUrl),
      baseUrl: input.baseUrl.trim(),
      username: input.username.trim(),
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
    const next: Bot = {
      ...current,
      name:
        patch.name !== undefined
          ? patch.name.trim() || botNameFromUrl(patch.baseUrl ?? current.baseUrl)
          : current.name,
      baseUrl: patch.baseUrl?.trim() ?? current.baseUrl,
      username: patch.username?.trim() ?? current.username,
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
      locale,
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
    legacyCleared,
    needsPassword,
    baseUrl,
    username,
    password,
    locale,
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

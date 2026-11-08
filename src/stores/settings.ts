import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import { sameConnectionIdentity } from '@/data/freqtrade'
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
import { clampCount } from '@/lib/format'
import { readJson, removeKey, safeSessionStorage, writeJson } from '@/lib/storage'
import type { StreamAuthPreference } from '@/lib/stream'
import type { TimezonePreference } from '@/lib/timezone'
import { isZone } from '@/lib/timezone'

const SETTINGS_KEY = 'ftdash.settings.v1'
const DATA_GENERATION_KEY = 'ftdash.dataGeneration.v1'

interface StoredSettings {
  generation?: string | null
  locale: LocalePreference | null
  timezone: TimezonePreference
  websocket: boolean
  streamAuth: StreamAuthPreference
  wsToken: string
  allowControls: boolean
  notifications: boolean
  remember: boolean
  controlsAcknowledged: boolean
  dashboardOpenLimit: number
  dashboardClosedLimit: number
  tradesPerPage: number
  pairTablePerPage: number
  pollInterval: number
}

/** Ranges and defaults for the numeric interface settings. */
export const COUNT_SETTINGS = {
  dashboardOpenLimit: { min: 1, max: 50, fallback: 6 },
  dashboardClosedLimit: { min: 1, max: 50, fallback: 6 },
  /** Positive page sizes; zero separately means all loaded trades. */
  tradesPerPage: { min: 5, max: 300, fallback: 20 },
  pairTablePerPage: { min: 5, max: 300, fallback: 10 },
  pollInterval: { min: 1, max: 60, fallback: 1 },
} as const

type CountKey = keyof typeof COUNT_SETTINGS
const COUNT_KEYS = Object.keys(COUNT_SETTINGS) as CountKey[]
const isAllTrades = (key: CountKey, value: unknown) =>
  key === 'tradesPerPage' && (value === 0 || value === '0')
function normalizeCount(key: CountKey, value: unknown): number {
  if (isAllTrades(key, value)) return 0
  const { fallback, min, max } = COUNT_SETTINGS[key]
  return clampCount(value, fallback, min, max)
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
  /** How many rows the overview lists before its "view all" link takes over. */
  dashboardOpenLimit: COUNT_SETTINGS.dashboardOpenLimit.fallback,
  dashboardClosedLimit: COUNT_SETTINGS.dashboardClosedLimit.fallback,
  tradesPerPage: COUNT_SETTINGS.tradesPerPage.fallback,
  pairTablePerPage: COUNT_SETTINGS.pairTablePerPage.fallback,
  pollInterval: COUNT_SETTINGS.pollInterval.fallback,
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
function loadBots(rememberLocalSecrets: boolean, generation: string | null): Bot[] {
  const local = readJson<Bot[] | { generation: string | null; bots: Bot[] } | null>(BOTS_KEY, null)
  const tabStorage = safeSessionStorage()
  const tabGeneration = readJson<string | null>(DATA_GENERATION_KEY, null, tabStorage)
  if (tabGeneration !== generation) removeKey(BOTS_SESSION_KEY, tabStorage)
  const session = parseBots(readJson<unknown>(BOTS_SESSION_KEY, [], tabStorage))
  if (local === null) return session
  const localGeneration = Array.isArray(local) ? null : local.generation
  if (localGeneration !== generation) return session
  return parseBots(Array.isArray(local) ? local : local.bots).map((bot) => {
    const stored = rememberLocalSecrets ? bot : { ...bot, password: '', wsToken: '' }
    const tabCopy = session.find(
      (entry) => entry.id === bot.id && sameConnectionIdentity(entry, bot),
    )
    return {
      ...stored,
      password: stored.password || tabCopy?.password || '',
      wsToken: stored.wsToken || tabCopy?.wsToken || '',
    }
  })
}

export const useSettingsStore = defineStore('settings', () => {
  let storageGeneration = readJson<string | null>(DATA_GENERATION_KEY, null)
  const stored = readJson<Partial<StoredSettings>>(SETTINGS_KEY, {})
  const persisted = (stored.generation ?? null) === storageGeneration ? stored : {}
  const localDataRevision = ref(0)

  const remember = ref(persisted.remember ?? DEFAULT_SETTINGS.remember)
  const bots = ref<Bot[]>(loadBots(remember.value, storageGeneration))
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
    const onLanguageChange = () => {
      systemLocale.value = detectLocale()
    }
    window.addEventListener('languagechange', onLanguageChange)
    onScopeDispose(() => window.removeEventListener('languagechange', onLanguageChange))
  }
  const count = <K extends CountKey>(key: K, stored: unknown) => ref(normalizeCount(key, stored))

  /** The raw inputs, which may briefly hold "" while being retyped. */
  const dashboardOpenLimit = count('dashboardOpenLimit', persisted.dashboardOpenLimit)
  const dashboardClosedLimit = count('dashboardClosedLimit', persisted.dashboardClosedLimit)
  const tradesPerPage = count('tradesPerPage', persisted.tradesPerPage)
  const pairTablePerPage = count('pairTablePerPage', persisted.pairTablePerPage)
  const pollInterval = count('pollInterval', persisted.pollInterval)
  const pollIntervalSeconds = ref(pollInterval.value)
  const countRefs: Record<CountKey, Ref<number>> = {
    dashboardOpenLimit,
    dashboardClosedLimit,
    tradesPerPage,
    pairTablePerPage,
    pollInterval,
  }

  /** Normalized view values; zero is the explicit all-trades mode. */
  const clamped = (key: CountKey) => computed(() => normalizeCount(key, countRefs[key].value))
  const overviewOpenLimit = clamped('dashboardOpenLimit')
  const overviewClosedLimit = clamped('dashboardClosedLimit')
  const tradesPageSize = clamped('tradesPerPage')
  const pairTablePageSize = clamped('pairTablePerPage')

  /**
   * The last number that was actually saved for each input, which is what a bad entry falls
   * back to. Tracked from the refs rather than in `commitCount`, so a value written by
   * anything else — clearing local data, a stored default — is remembered too.
   */
  const lastCount = Object.fromEntries(
    COUNT_KEYS.map((key) => [key, countRefs[key].value]),
  ) as Record<CountKey, number>
  watch(
    () => COUNT_KEYS.map((key) => countRefs[key].value),
    () => {
      for (const key of COUNT_KEYS) {
        if (key === 'pollInterval') continue
        const { min, max } = COUNT_SETTINGS[key]
        const value = countRefs[key].value
        if (isAllTrades(key, value) || (Number.isInteger(value) && value >= min && value <= max))
          lastCount[key] = value
      }
    },
    { flush: 'sync' },
  )

  /**
   * What an input settles on when the operator leaves it. Below the range takes the minimum,
   * above it the maximum, and anything that is not a whole number — an empty box, `12.7`, a
   * half-typed exponent — goes back to the last number that was actually saved.
   */
  function commitCount(key: CountKey): number {
    const { min, max } = COUNT_SETTINGS[key]
    // The refs are typed `number`, but a cleared input really holds "" (and a stray string
    // can come back from storage), so the check is on the runtime value.
    const raw: unknown = countRefs[key].value
    const value = typeof raw === 'number' ? raw : raw === '' ? Number.NaN : Number(raw)
    const settled =
      Number.isFinite(value) && Number.isInteger(value)
        ? isAllTrades(key, value)
          ? 0
          : Math.min(max, Math.max(min, value))
        : lastCount[key]
    countRefs[key].value = settled
    if (key === 'pollInterval') {
      lastCount[key] = settled
      pollIntervalSeconds.value = settled
    }
    return settled
  }
  const websocket = ref(persisted.websocket ?? DEFAULT_SETTINGS.websocket)
  const timezone = ref<TimezonePreference>(resolveTimezone(persisted.timezone))
  const streamAuth = ref(resolveStreamAuth(persisted.streamAuth))
  const wsToken = ref(
    activeBot.value?.wsToken ??
      (remember.value && typeof persisted.wsToken === 'string' ? persisted.wsToken : ''),
  )
  const allowControls = ref(persisted.allowControls ?? DEFAULT_SETTINGS.allowControls)
  const notifications = ref(persisted.notifications ?? DEFAULT_SETTINGS.notifications)
  const controlsAcknowledged = ref(
    persisted.controlsAcknowledged ?? DEFAULT_SETTINGS.controlsAcknowledged,
  )

  let suppressPersistence = false

  /** True when we already hold a full credential set at startup. */
  const hasCredentials = computed(() => Boolean(baseUrl.value && username.value && password.value))
  const writesEnabled = computed(() => allowControls.value && controlsAcknowledged.value)
  const activeBotName = computed(() => activeBot.value?.name ?? '')
  /** The active bot has no password at hand: the operator has to type it again. */
  const needsPassword = computed(() => Boolean(activeBot.value) && password.value.length === 0)

  function isLocalDataRevisionCurrent(expectedRevision: number): boolean {
    return (
      expectedRevision === localDataRevision.value &&
      storageGeneration === readJson<string | null>(DATA_GENERATION_KEY, null)
    )
  }

  function persist() {
    if (suppressPersistence || !isLocalDataRevisionCurrent(localDataRevision.value)) return
    writeJson(SETTINGS_KEY, {
      generation: storageGeneration,
      // The preference is what gets stored; the resolved language is derived from it.
      locale: localePreference.value,
      timezone: timezone.value,
      websocket: websocket.value,
      streamAuth: streamAuth.value,
      wsToken: remember.value ? wsToken.value : '',
      allowControls: allowControls.value,
      notifications: notifications.value,
      remember: remember.value,
      controlsAcknowledged: controlsAcknowledged.value,
      dashboardOpenLimit: dashboardOpenLimit.value,
      dashboardClosedLimit: dashboardClosedLimit.value,
      tradesPerPage: tradesPerPage.value,
      pairTablePerPage: pairTablePerPage.value,
      pollInterval: pollIntervalSeconds.value,
    } satisfies StoredSettings)
  }

  function persistBots() {
    if (suppressPersistence || !isLocalDataRevisionCurrent(localDataRevision.value)) return
    writeJson(BOTS_KEY, {
      generation: storageGeneration,
      bots: serializeBots(bots.value, remember.value),
    })
    const tabStorage = safeSessionStorage()
    writeJson(BOTS_SESSION_KEY, serializeBots(bots.value, true), tabStorage)
    writeJson(DATA_GENERATION_KEY, storageGeneration, tabStorage)
    writeJson(ACTIVE_BOT_KEY, activeBotId.value)
  }

  function resetLocalState() {
    suppressPersistence = true
    const tabStorage = safeSessionStorage()
    removeKey(BOTS_SESSION_KEY, tabStorage)
    removeKey(DATA_GENERATION_KEY, tabStorage)
    bots.value = []
    activeBotId.value = ''
    baseUrl.value = ''
    username.value = ''
    password.value = ''
    localePreference.value = DEFAULT_SETTINGS.locale ?? DEFAULT_LOCALE
    systemLocale.value = detectLocale()
    timezone.value = DEFAULT_SETTINGS.timezone
    websocket.value = DEFAULT_SETTINGS.websocket
    streamAuth.value = DEFAULT_SETTINGS.streamAuth
    wsToken.value = DEFAULT_SETTINGS.wsToken
    allowControls.value = DEFAULT_SETTINGS.allowControls
    notifications.value = DEFAULT_SETTINGS.notifications
    remember.value = DEFAULT_SETTINGS.remember
    dashboardOpenLimit.value = DEFAULT_SETTINGS.dashboardOpenLimit
    dashboardClosedLimit.value = DEFAULT_SETTINGS.dashboardClosedLimit
    tradesPerPage.value = DEFAULT_SETTINGS.tradesPerPage
    pairTablePerPage.value = DEFAULT_SETTINGS.pairTablePerPage
    pollInterval.value = DEFAULT_SETTINGS.pollInterval
    commitCount('pollInterval')
    controlsAcknowledged.value = DEFAULT_SETTINGS.controlsAcknowledged
    localDataRevision.value += 1
    suppressPersistence = false
  }

  function clearStoredData() {
    writeJson(DATA_GENERATION_KEY, newBotId())
    storageGeneration = readJson<string | null>(DATA_GENERATION_KEY, null)
    removeKey(SETTINGS_KEY)
    removeKey(BOTS_KEY)
    removeKey(ACTIVE_BOT_KEY)
    resetLocalState()
  }

  if (typeof window !== 'undefined') {
    const syncClearedData = (event: StorageEvent) => {
      if (event.key !== DATA_GENERATION_KEY && event.key !== null) return
      const generation = readJson<string | null>(DATA_GENERATION_KEY, null)
      if (generation === storageGeneration) return
      storageGeneration = generation
      resetLocalState()
    }
    window.addEventListener('storage', syncClearedData)
    onScopeDispose(() => window.removeEventListener('storage', syncClearedData))
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
      wsToken: input.wsToken?.trim() ?? '',
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
    const sameIdentity = sameConnectionIdentity(current, { baseUrl, username })
    const next: Bot = {
      ...current,
      name:
        patch.name !== undefined
          ? patch.name.trim() || defaultBotName(username, baseUrl)
          : current.name,
      baseUrl,
      username,
      password: patch.password ?? (sameIdentity ? current.password : ''),
      wsToken: patch.wsToken?.trim() ?? (sameIdentity ? current.wsToken : ''),
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

  function reorderBots(ids: string[]) {
    const byId = new Map(bots.value.map((bot) => [bot.id, bot]))
    if (
      ids.length !== bots.value.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !byId.has(id))
    )
      return
    bots.value = ids.map((id) => byId.get(id)!)
    persistBots()
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
      dashboardOpenLimit,
      dashboardClosedLimit,
      tradesPerPage,
      pairTablePerPage,
      pollIntervalSeconds,
    ],
    persist,
    { flush: 'sync' },
  )

  /** Toggling "remember" rewrites the stored list with or without the passwords. */
  watch(remember, persistBots, { flush: 'sync' })

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
    dashboardOpenLimit,
    dashboardClosedLimit,
    tradesPerPage,
    tradesPageSize,
    pairTablePerPage,
    pairTablePageSize,
    pollInterval,
    pollIntervalSeconds,
    commitCount,
    overviewOpenLimit,
    overviewClosedLimit,
    hasCredentials,
    writesEnabled,
    localDataRevision,
    isLocalDataRevisionCurrent,
    persistBots,
    clearStoredData,
    disconnect,
    addBot,
    updateBot,
    setActiveBot,
    removeBot,
    reorderBots,
  }
})

import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { detectLocale, isSupportedLocale, type AppLocale } from '@/i18n'
import { readJson, removeKey, safeSessionStorage, writeJson } from '@/lib/storage'

const SETTINGS_KEY = 'ftdash.settings.v1'
const CREDENTIALS_KEY = 'ftdash.credentials.v1'

export interface StoredCredentials {
  baseUrl: string
  username: string
  password: string
}

interface StoredSettings {
  locale: AppLocale | null
  refreshInterval: number
  websocket: boolean
  allowControls: boolean
  notifications: boolean
  remember: boolean
  controlsAcknowledged: boolean
}

const DEFAULT_SETTINGS: StoredSettings = {
  locale: null,
  refreshInterval: 30,
  websocket: true,
  allowControls: false,
  notifications: false,
  remember: true,
  controlsAcknowledged: false,
}

export const REFRESH_OPTIONS = [10, 15, 30, 60, 120, 300] as const

/**
 * Guards against a missing or hand-edited stored value: anything that is not an
 * allowed interval falls back to the default instead of becoming NaN.
 */
function resolveRefreshInterval(value: unknown): number {
  if (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    (REFRESH_OPTIONS as readonly number[]).includes(value)
  ) {
    return value
  }
  return DEFAULT_SETTINGS.refreshInterval
}

export const useSettingsStore = defineStore('settings', () => {
  const persisted = readJson<Partial<StoredSettings>>(SETTINGS_KEY, {})
  const stored = readJson<Partial<StoredCredentials>>(CREDENTIALS_KEY, {})
  const sessionCreds = readJson<Partial<StoredCredentials>>(
    CREDENTIALS_KEY,
    {},
    safeSessionStorage(),
  )
  const source = stored.baseUrl ? stored : sessionCreds

  const baseUrl = ref(source.baseUrl ?? import.meta.env.VITE_API_BASE_DEFAULT ?? '')
  const username = ref(source.username ?? '')
  const password = ref(source.password ?? '')
  const locale = ref<AppLocale>(isSupportedLocale(persisted.locale) ? persisted.locale : detectLocale())
  const refreshInterval = ref(resolveRefreshInterval(persisted.refreshInterval))
  const websocket = ref(persisted.websocket ?? DEFAULT_SETTINGS.websocket)
  const allowControls = ref(persisted.allowControls ?? DEFAULT_SETTINGS.allowControls)
  const notifications = ref(persisted.notifications ?? DEFAULT_SETTINGS.notifications)
  const remember = ref(persisted.remember ?? DEFAULT_SETTINGS.remember)
  const controlsAcknowledged = ref(
    persisted.controlsAcknowledged ?? DEFAULT_SETTINGS.controlsAcknowledged,
  )

  /** True when we already hold a full credential set at startup. */
  const hasCredentials = computed(() => Boolean(baseUrl.value && username.value && password.value))
  const writesEnabled = computed(() => allowControls.value && controlsAcknowledged.value)

  function persist() {
    writeJson(SETTINGS_KEY, {
      locale: locale.value,
      refreshInterval: refreshInterval.value,
      websocket: websocket.value,
      allowControls: allowControls.value,
      notifications: notifications.value,
      remember: remember.value,
      controlsAcknowledged: controlsAcknowledged.value,
    } satisfies StoredSettings)
  }

  function persistCredentials() {
    const payload: StoredCredentials = {
      baseUrl: baseUrl.value,
      username: username.value,
      password: password.value,
    }
    removeKey(CREDENTIALS_KEY)
    removeKey(CREDENTIALS_KEY, safeSessionStorage())
    if (!payload.baseUrl || !payload.username) return
    if (remember.value) writeJson(CREDENTIALS_KEY, payload)
    else writeJson(CREDENTIALS_KEY, payload, safeSessionStorage())
  }

  function clearStoredData() {
    removeKey(SETTINGS_KEY)
    removeKey(CREDENTIALS_KEY)
    removeKey(CREDENTIALS_KEY, safeSessionStorage())
  }

  function disconnect() {
    baseUrl.value = ''
    username.value = ''
    password.value = ''
    remember.value = true
    removeKey(CREDENTIALS_KEY)
    removeKey(CREDENTIALS_KEY, safeSessionStorage())
    persist()
  }

  function updateCredentialFields(fields: Partial<StoredCredentials>) {
    if (fields.baseUrl !== undefined) baseUrl.value = fields.baseUrl.trim()
    if (fields.username !== undefined) username.value = fields.username.trim()
    if (fields.password !== undefined) password.value = fields.password
  }

  watch(
    [locale, refreshInterval, websocket, allowControls, notifications, remember, controlsAcknowledged],
    persist,
  )

  return {
    baseUrl,
    username,
    password,
    locale,
    refreshInterval,
    websocket,
    allowControls,
    notifications,
    remember,
    controlsAcknowledged,
    hasCredentials,
    writesEnabled,
    persistCredentials,
    clearStoredData,
    disconnect,
    updateCredentialFields,
  }
})

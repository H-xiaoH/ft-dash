import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { detectLocale, isSupportedLocale, type AppLocale } from '@/i18n'
import { readJson, removeKey, safeSessionStorage, writeJson } from '@/lib/storage'
import type { StreamAuthPreference } from '@/lib/stream'

const SETTINGS_KEY = 'ftdash.settings.v1'
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
  const locale = ref<AppLocale>(
    isSupportedLocale(persisted.locale) ? persisted.locale : detectLocale(),
  )
  const websocket = ref(persisted.websocket ?? DEFAULT_SETTINGS.websocket)
  const streamAuth = ref(resolveStreamAuth(persisted.streamAuth))
  const wsToken = ref(typeof persisted.wsToken === 'string' ? persisted.wsToken : '')
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
      websocket: websocket.value,
      streamAuth: streamAuth.value,
      wsToken: wsToken.value,
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
    remember.value = DEFAULT_SETTINGS.remember
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

  return {
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
    persistCredentials,
    clearStoredData,
    disconnect,
    updateCredentialFields,
  }
})

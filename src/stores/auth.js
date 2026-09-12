import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  ApiError,
  DEFAULT_BASE_URL,
  login as apiLogin,
  normalizeBaseUrl,
  onUnauthorized,
  session,
} from '@/api/client'

const KEY = 'ft.auth'

/**
 * Session store. Owns nothing itself - it drives `session` from api/client.js,
 * which is what every request reads.
 */
export const useAuthStore = defineStore('auth', () => {
  const authenticated = ref(false)
  const baseUrl = ref(DEFAULT_BASE_URL)
  const username = ref('')
  const remember = ref(true)
  const mode = ref('basic')
  const connecting = ref(false)
  const error = ref('')

  /**
   * Only a refresh token is ever written to disk - never the password.
   * A refresh token is revocable and expires; a plaintext password in
   * localStorage is the first thing any XSS reads, and it never expires.
   * Bots that do not offer JWT simply require a fresh login per launch.
   */
  function persist() {
    const payload = {
      baseUrl: baseUrl.value,
      username: username.value,
      remember: remember.value,
    }
    if (remember.value && session.mode === 'jwt' && session.refreshToken) {
      payload.mode = 'jwt'
      payload.refreshToken = session.refreshToken
    }
    localStorage.setItem(KEY, JSON.stringify(payload))
  }

  /** Restore a previous session so a returning user lands straight on the dashboard. */
  function hydrate() {
    let saved = null
    try {
      saved = JSON.parse(localStorage.getItem(KEY) || 'null')
    } catch {
      saved = null
    }
    if (!saved) return

    baseUrl.value = normalizeBaseUrl(saved.baseUrl || DEFAULT_BASE_URL)
    username.value = saved.username || ''
    remember.value = saved.remember !== false

    session.baseUrl = baseUrl.value
    session.username = username.value

    if (remember.value && saved.refreshToken) {
      session.mode = 'jwt'
      session.refreshToken = saved.refreshToken
      // Always leave the in-memory password empty on restore - the refresh token
      // is the credential here, whatever state the module happened to be in.
      session.password = ''
      // The first request refreshes this into an access token before it is sent.
      authenticated.value = true
    } else {
      session.mode = 'basic'
      session.refreshToken = ''
      session.password = ''
      authenticated.value = false
    }
  }

  function clearCredentials() {
    session.password = ''
    session.accessToken = ''
    session.refreshToken = ''
    session.expiresAt = 0
  }

  async function connect({ baseUrl: url, username: user, password, remember: keep = true }) {
    connecting.value = true
    error.value = ''
    try {
      const target = normalizeBaseUrl(url)
      session.baseUrl = target
      session.username = user
      session.password = password

      const result = await apiLogin({ baseUrl: target, username: user, password })

      baseUrl.value = target
      username.value = user
      remember.value = keep
      mode.value = result.mode
      // With "remember" off the credentials simply stay in memory for this page
      // session: `persist()` already omits every secret, so there is nothing to
      // clear here. Clearing them would 401 every following request.
      authenticated.value = true
      persist()
      return true
    } catch (err) {
      clearCredentials()
      authenticated.value = false
      error.value =
        err instanceof ApiError ? err.message : err?.message || '登录失败，请重试'
      throw err
    } finally {
      connecting.value = false
    }
  }

  function logout() {
    authenticated.value = false
    clearCredentials()
    persist()
  }

  /** Changing the host invalidates the stored credentials. */
  function setBaseUrl(value) {
    const next = normalizeBaseUrl(value)
    if (next === baseUrl.value) return
    baseUrl.value = next
    session.baseUrl = next
    logout()
  }

  function forgetEverything() {
    clearCredentials()
    authenticated.value = false
    username.value = ''
    baseUrl.value = DEFAULT_BASE_URL
    session.baseUrl = DEFAULT_BASE_URL
    localStorage.removeItem(KEY)
  }

  // A 401 that survives a refresh attempt means the session is really gone -
  // drop the tokens so a dead refresh token is not retried on every launch.
  onUnauthorized(() => {
    authenticated.value = false
    session.accessToken = ''
    session.refreshToken = ''
    session.expiresAt = 0
    persist()
  })

  const host = computed(() => {
    try {
      return new URL(baseUrl.value, location.origin).host
    } catch {
      return baseUrl.value
    }
  })

  const transportLabel = computed(() => (mode.value === 'jwt' ? 'JWT 令牌' : 'HTTP Basic'))

  return {
    authenticated,
    baseUrl,
    username,
    remember,
    mode,
    connecting,
    error,
    host,
    transportLabel,
    hydrate,
    connect,
    logout,
    setBaseUrl,
    forgetEverything,
  }
})

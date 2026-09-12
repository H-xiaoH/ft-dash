import { reactive } from 'vue'

export const DEFAULT_BASE_URL = '/api/v1'

/**
 * Single source of truth for the credentials used by every request.
 * The auth store is a thin reactive wrapper around this object, which keeps the
 * request layer free of store imports (and therefore free of circular imports).
 */
export const session = reactive({
  baseUrl: DEFAULT_BASE_URL,
  username: '',
  /** Kept in memory; persisted only when the user opts into "remember". */
  password: '',
  accessToken: '',
  refreshToken: '',
  /** ms epoch at which `accessToken` stops being valid. */
  expiresAt: 0,
  /** 'jwt' uses short-lived bearer tokens, 'basic' sends credentials on every call. */
  mode: 'basic',
})

export class ApiError extends Error {
  constructor(message, { status = 0, detail = '', url = '' } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.url = url
  }

  get isAuth() {
    return this.status === 401 || this.status === 403
  }

  get isNetwork() {
    return this.status === 0
  }
}

/* ------------------------------------------------------------------ base url */

/** Accepts `bot.example.com`, `https://bot.example.com/`, `/api/v1`, ... */
export function normalizeBaseUrl(input) {
  let url = String(input ?? '').trim()
  if (!url) return DEFAULT_BASE_URL
  url = url.replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(url) && !url.startsWith('/')) url = 'https://' + url
  if (!/\/api\/v1$/i.test(url)) url += '/api/v1'
  // Drop any userinfo (`https://user:pass@host`). Left in, the password would be
  // persisted, rendered in Settings and echoed inside error messages.
  url = url.replace(/^(https?:\/\/)[^/@]*@/i, '$1')
  return url
}

export function buildUrl(baseUrl, path = '', params) {
  const base = String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')
  let url = base + (path ? (path.startsWith('/') ? path : '/' + path) : '')
  if (params) {
    const qs = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue
      qs.append(key, String(value))
    }
    const query = qs.toString()
    if (query) url += (url.includes('?') ? '&' : '?') + query
  }
  return url
}

/* ------------------------------------------------------------------- headers */

function base64(value) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function basicHeader(username, password) {
  return 'Basic ' + base64(`${username}:${password}`)
}

function isTokenFresh() {
  return Boolean(session.accessToken) && Date.now() < session.expiresAt - 30_000
}

function authHeader() {
  if (session.mode === 'jwt' && isTokenFresh()) {
    return 'Bearer ' + session.accessToken
  }
  // Never send a Basic header with an empty password - that is a guaranteed 401
  // and would put a half-credential on the wire.
  if (session.username && session.password) {
    return basicHeader(session.username, session.password)
  }
  return ''
}

/* ------------------------------------------------------------- auth helpers */

function applyTokens(payload, fallbackMinutes = 15) {
  if (!payload || typeof payload !== 'object') return false
  session.accessToken = payload.access_token || ''
  if (payload.refresh_token) session.refreshToken = payload.refresh_token
  const expires = Number(payload.expires_in)
  session.expiresAt = Date.now() + (Number.isFinite(expires) && expires > 0
    ? expires * 1000
    : fallbackMinutes * 60_000)
  return Boolean(session.accessToken)
}

let refreshPromise = null

/**
 * Exchange the refresh token for a new access token.
 * Single-flight: concurrent 401s share one refresh round-trip.
 */
async function refreshAccessToken() {
  if (!session.refreshToken) return false
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      const res = await fetch(buildUrl(session.baseUrl, '/token/refresh'), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer ' + session.refreshToken,
        },
        // Trading data must never land in the on-disk HTTP cache.
        cache: 'no-store',
        credentials: 'omit',
      })
      if (!res.ok) return false
      const payload = await res.json().catch(() => null)
      return applyTokens(payload)
    } catch {
      return false
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

/**
 * Validate credentials and decide the transport.
 * Prefers JWT (short-lived, refreshable) and degrades to HTTP Basic for older bots.
 */
export async function login({ baseUrl, username, password }) {
  const base = normalizeBaseUrl(baseUrl)
  const url = buildUrl(base, '/token/login')

  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: basicHeader(username, password) },
      // Trading data must never land in the on-disk HTTP cache.
      cache: 'no-store',
      credentials: 'omit',
    })
  } catch {
    throw new ApiError('无法连接到服务器，请检查地址 / 网络 / CORS 配置', { url })
  }

  if (res.status === 401 || res.status === 403) {
    throw new ApiError('用户名或密码错误', { status: res.status, url })
  }

  if (res.ok) {
    const payload = await res.json().catch(() => null)
    if (applyTokens(payload)) {
      session.mode = 'jwt'
      return { mode: 'jwt' }
    }
  }

  // Older bots (or a disabled JWT secret) - fall back to Basic auth and prove it works.
  if (res.status === 404 || res.status === 405 || res.status === 400) {
    const probe = await fetch(buildUrl(base, '/profit'), {
      headers: { Accept: 'application/json', Authorization: basicHeader(username, password) },
      // Trading data must never land in the on-disk HTTP cache.
      cache: 'no-store',
      credentials: 'omit',
    })
    if (probe.status === 401 || probe.status === 403) {
      throw new ApiError('用户名或密码错误', { status: probe.status, url })
    }
    if (!probe.ok) {
      throw new ApiError(`服务器返回 ${probe.status}`, { status: probe.status, url })
    }
    session.mode = 'basic'
    session.accessToken = ''
    session.refreshToken = ''
    return { mode: 'basic' }
  }

  const payload = await res.json().catch(() => null)
  throw new ApiError(extractDetail(payload) || `登录失败 (${res.status})`, {
    status: res.status,
    url,
  })
}

/* --------------------------------------------------------------- error text */

function extractDetail(payload) {
  if (!payload) return ''
  if (typeof payload === 'string') return payload.slice(0, 300)
  const detail = payload.detail ?? payload.error ?? payload.message
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => item?.msg || item?.message || JSON.stringify(item))
      .join('; ')
      .slice(0, 300)
  }
  return ''
}

/* -------------------------------------------------------- unauthorized hooks */

const unauthorizedListeners = new Set()

export function onUnauthorized(listener) {
  unauthorizedListeners.add(listener)
  return () => unauthorizedListeners.delete(listener)
}

let notifiedAt = 0
function notifyUnauthorized() {
  // Collapse a burst of parallel 401s into a single logout.
  if (Date.now() - notifiedAt < 1500) return
  notifiedAt = Date.now()
  for (const listener of unauthorizedListeners) {
    try {
      listener()
    } catch {
      /* a broken listener must not break the request that triggered it */
    }
  }
}

/* ------------------------------------------------------------------ request */

async function request(path, options = {}) {
  const {
    method = 'GET',
    params,
    body,
    auth = true,
    retry = true,
    timeout = 25_000,
    signal,
  } = options

  // Refresh ahead of expiry so a normal poll never eats a wasted 401 round-trip.
  if (
    auth &&
    retry &&
    session.mode === 'jwt' &&
    !isTokenFresh() &&
    session.refreshToken
  ) {
    await refreshAccessToken()
  }

  const url = buildUrl(session.baseUrl, path, params)
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth) {
    const header = authHeader()
    if (header) headers.Authorization = header
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })

  let res
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      // Trading data must never land in the on-disk HTTP cache.
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError' && !signal?.aborted) {
      throw new ApiError('请求超时', { url })
    }
    if (signal?.aborted) throw error
    throw new ApiError('无法连接到服务器（网络或 CORS 错误）', { url })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }

  const text = await res.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }

  if (res.ok) return payload

  // An expired access token is expected during normal use - refresh once and replay.
  if (res.status === 401 && auth && retry && session.mode === 'jwt' && session.refreshToken) {
    const refreshed = await refreshAccessToken()
    if (refreshed) return request(path, { ...options, retry: false })
  }

  if (res.status === 401 || res.status === 403) notifyUnauthorized()

  const detail = extractDetail(payload) || `${res.status} ${res.statusText}`.trim()
  throw new ApiError(detail, { status: res.status, detail, url })
}

export const get = (path, params, options) => request(path, { ...options, params })
export const post = (path, body, options) => request(path, { ...options, method: 'POST', body })
export const del = (path, body, options) => request(path, { ...options, method: 'DELETE', body })

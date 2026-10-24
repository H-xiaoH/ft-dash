import { ApiError, type ApiErrorKind } from './errors'

export interface Credentials {
  baseUrl: string
  username: string
  password: string
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE' | 'PATCH' | 'PUT'
  query?: Record<string, string | number | boolean | (string | number)[] | undefined | null>
  body?: unknown
  form?: Record<string, string>
  /** Adds an `Authorization: Basic` header instead of the cached bearer token. */
  basic?: boolean
  timeoutMs?: number
  signal?: AbortSignal
}

export const DEFAULT_REQUEST_TIMEOUT_MS = 20_000

/**
 * Accepts `bot.example.com`, `https://bot.example.com`,
 * `https://bot.example.com/api/v1` or a relative dev-proxy path such as `/ft-api`.
 */
export function normalizeBaseUrl(raw: string): string {
  let value = (raw || '').trim()
  if (!value) return ''
  value = value.replace(/\/+$/, '')
  if (value.startsWith('/')) return value
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`
  const url = new URL(value)
  const path = url.pathname.replace(/\/+$/, '')
  if (!path) {
    url.pathname = '/api/v1'
  } else if (!/\/api\/v\d+$/.test(path)) {
    url.pathname = `${path}/api/v1`
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

/** Absolute http(s) base, resolved against the current origin when relative. */
export function absoluteBaseUrl(baseUrl: string): string {
  if (/^https?:\/\//i.test(baseUrl)) return baseUrl
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  return `${origin}${baseUrl}`
}

export function websocketUrl(baseUrl: string, token: string): string {
  const absolute = absoluteBaseUrl(baseUrl)
  const wsRoot = absolute.replace(/^http/i, 'ws')
  return `${wsRoot}/message/ws?token=${encodeURIComponent(token)}`
}

function base64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function buildQuery(query: RequestOptions['query']): string {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item))
      continue
    }
    params.append(key, String(value))
  }
  const serialized = params.toString()
  return serialized ? `?${serialized}` : ''
}

function extractDetail(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const detail = (payload as { detail?: unknown }).detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) =>
        item && typeof item === 'object' ? (item as { msg?: unknown }).msg : undefined,
      )
      .filter((msg): msg is string => typeof msg === 'string')
    return messages.length ? messages.join('; ') : undefined
  }
  return undefined
}

function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError
}

/**
 * Handles only transport concerns. Endpoint response validation belongs to the client so
 * this class can also be used for the small compatibility probe.
 */
export class FreqtradeTransport {
  readonly baseUrl: string

  private readonly basicAuthHeader: string
  private bearer: { token: string; expiresAt: number } | null = null

  constructor(credentials: Credentials) {
    let baseUrl: string
    try {
      baseUrl = normalizeBaseUrl(credentials.baseUrl)
    } catch (error) {
      throw new ApiError('config', 'API base URL is invalid', {
        detail: 'invalid-base-url',
        cause: error,
      })
    }
    if (!baseUrl) {
      throw new ApiError('config', 'API base URL is empty', { detail: 'missing-base-url' })
    }
    this.baseUrl = baseUrl
    this.basicAuthHeader = `Basic ${base64Utf8(`${credentials.username}:${credentials.password}`)}`
  }

  setBearerToken(token: string, expiresAt = Date.now() + 13 * 60 * 1000): void {
    this.bearer = { token, expiresAt }
  }

  clearBearerToken(): void {
    this.bearer = null
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.send<T>(path, options)
  }

  private hasFreshBearer(): boolean {
    return this.bearer !== null && this.bearer.expiresAt > Date.now()
  }

  private headers(options: RequestOptions, useBearer: boolean): HeadersInit {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (options.body !== undefined && !options.form) headers['Content-Type'] = 'application/json'
    if (options.form) headers['Content-Type'] = 'application/x-www-form-urlencoded'
    headers.Authorization = useBearer ? `Bearer ${this.bearer?.token ?? ''}` : this.basicAuthHeader
    return headers
  }

  /**
   * A single attempt owns its timer until the whole response body and JSON parse finish.
   * The only retry is the documented bearer-to-basic recovery after a 401.
   */
  private async send<T>(
    path: string,
    options: RequestOptions,
    allowBearerRetry = true,
  ): Promise<T> {
    const query = buildQuery(options.query)
    const url = `${this.baseUrl}${path}${query}`
    const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    const controller = new AbortController()
    const useBearer = !options.basic && this.hasFreshBearer()
    let timedOut = false
    let externallyAborted = Boolean(options.signal?.aborted)

    const timer = setTimeout(() => {
      timedOut = true
      controller.abort(new ApiError('timeout', 'Request timed out'))
    }, timeoutMs)
    const onExternalAbort = () => {
      externallyAborted = true
      controller.abort(options.signal?.reason)
    }

    if (options.signal?.aborted) {
      controller.abort(options.signal.reason)
    } else {
      options.signal?.addEventListener('abort', onExternalAbort, { once: true })
    }

    try {
      const response = await fetch(url, {
        method: options.method ?? 'GET',
        headers: this.headers(options, useBearer),
        body: options.form
          ? new URLSearchParams(options.form).toString()
          : options.body !== undefined
            ? JSON.stringify(options.body)
            : undefined,
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
        mode: 'cors',
      })

      if (externallyAborted || options.signal?.aborted) {
        throw new ApiError('aborted', 'Request aborted')
      }
      const text = await response.text()
      if (timedOut) throw new ApiError('timeout', `Timed out after ${timeoutMs}ms`)
      if (externallyAborted || options.signal?.aborted) {
        throw new ApiError('aborted', 'Request aborted')
      }

      let payload: unknown = null
      if (text) {
        try {
          payload = JSON.parse(text)
        } catch (error) {
          if (response.ok) {
            throw new ApiError('parse', 'Response was not valid JSON', {
              status: response.status,
              url,
              endpoint: path,
              cause: error,
            })
          }
          payload = { detail: text.slice(0, 300) }
        }
      }

      if (!response.ok) {
        const detail = extractDetail(payload) ?? `HTTP ${response.status}`
        if (response.status === 401 && useBearer && allowBearerRetry) {
          this.clearBearerToken()
          return this.send<T>(path, options, false)
        }
        const kind: ApiErrorKind = response.status === 401 ? 'auth' : 'http'
        throw new ApiError(kind, detail, {
          status: response.status,
          detail,
          url,
          endpoint: path,
        })
      }

      return payload as T
    } catch (error) {
      if (timedOut) {
        throw new ApiError('timeout', `Timed out after ${timeoutMs}ms`, {
          url,
          endpoint: path,
          cause: error,
        })
      }
      if (externallyAborted || options.signal?.aborted) {
        throw new ApiError('aborted', 'Request aborted', {
          url,
          endpoint: path,
          cause: error,
        })
      }
      if (isApiError(error)) {
        if (error.url || error.endpoint) throw error
        throw new ApiError(error.kind, error.message, {
          status: error.status,
          detail: error.detail,
          url,
          endpoint: path,
          cause: error.cause,
        })
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new ApiError('offline', 'Browser reports no network connection', {
          url,
          endpoint: path,
          cause: error,
        })
      }
      throw new ApiError('cors', 'Request blocked or host unreachable', {
        url,
        endpoint: path,
        detail: 'cors-or-unreachable',
        cause: error,
      })
    } finally {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', onExternalAbort)
    }
  }
}

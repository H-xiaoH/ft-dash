import type {
  AccessToken,
  BalanceResponse,
  BlacklistResponse,
  DailyResponse,
  DeleteLockPayload,
  ForceEnterPayload,
  ForceExitPayload,
  HealthResponse,
  LockPayload,
  LocksResponse,
  LogsResponse,
  PairCandlesResponse,
  PerformanceEntry,
  ProfitAllResponse,
  ProfitSummary,
  ShowConfigResponse,
  StatusCountResponse,
  StatusMsg,
  SysInfoResponse,
  Trade,
  TradeStats,
  TradesResponse,
  VersionResponse,
  WhitelistResponse,
} from './types'

export type ApiErrorKind =
  | 'config'
  | 'timeout'
  | 'aborted'
  | 'cors'
  | 'offline'
  | 'auth'
  | 'http'
  | 'parse'

/** Raised when an endpoint a feature depends on is missing or refuses to serve us. */
export const WS_AUTH_UNSUPPORTED_STATUS = [404, 405, 501]

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status?: number
  readonly detail?: string
  readonly url?: string

  constructor(
    kind: ApiErrorKind,
    message: string,
    options: { status?: number; detail?: string; url?: string; cause?: unknown } = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = options.status
    this.detail = options.detail
    this.url = options.url
    if (options.cause !== undefined) this.cause = options.cause
  }
}

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
  /** Adds a `Authorization: Basic` header instead of the cached bearer token. */
  basic?: boolean
  timeoutMs?: number
  signal?: AbortSignal
}

const DEFAULT_TIMEOUT_MS = 20_000

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
      .map((item) => (item && typeof item === 'object' ? (item as { msg?: string }).msg : undefined))
      .filter((msg): msg is string => typeof msg === 'string')
    return messages.length ? messages.join('; ') : undefined
  }
  return undefined
}

/**
 * Minimal Freqtrade API v1 client.
 *
 * REST calls use HTTP Basic auth (never expires, no refresh dance). `/token/login`
 * is only used to mint the short-lived JWT the websocket endpoint requires.
 */
export class FreqtradeApi {
  readonly baseUrl: string
  private readonly authHeader: string
  private readonly credentials: Credentials
  private bearer: { token: string; expiresAt: number } | null = null

  constructor(credentials: Credentials) {
    const baseUrl = normalizeBaseUrl(credentials.baseUrl)
    if (!baseUrl) {
      throw new ApiError('config', 'API base URL is empty', { detail: 'missing-base-url' })
    }
    this.credentials = { ...credentials, baseUrl }
    this.baseUrl = baseUrl
    this.authHeader = `Basic ${base64Utf8(`${credentials.username}:${credentials.password}`)}`
  }

  private headers(options: RequestOptions, json: boolean): HeadersInit {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (json) headers['Content-Type'] = 'application/json'
    if (!options.basic && this.hasFreshBearer()) {
      headers.Authorization = `Bearer ${this.bearer?.token ?? ''}`
    } else {
      headers.Authorization = this.authHeader
    }
    return headers
  }

  private hasFreshBearer(): boolean {
    return this.bearer !== null && this.bearer.expiresAt > Date.now()
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.send<T>(path, options)
  }

  /**
   * Sends a request and, when a cached bearer token is rejected, retries once with HTTP
   * Basic. A restarted bot can invalidate every JWT it ever issued (new secret), and Basic
   * credentials are always valid, so this keeps polling alive without a re-login dance.
   */
  private async send<T>(path: string, options: RequestOptions, allowRetry = true): Promise<T> {
    const url = `${this.baseUrl}${path}${buildQuery(options.query)}`
    const controller = new AbortController()
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const timer = setTimeout(() => controller.abort(new ApiError('timeout', 'Request timed out')), timeoutMs)
    const onExternalAbort = () => controller.abort()
    options.signal?.addEventListener('abort', onExternalAbort, { once: true })

    let response: Response
    try {
      response = await fetch(url, {
        method: options.method ?? 'GET',
        headers: {
          ...this.headers(options, Boolean(options.body) && !options.form),
          ...(options.form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        },
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
    } catch (error) {
      const abortedByTimeout =
        controller.signal.aborted && (controller.signal.reason as ApiError | undefined)?.kind === 'timeout'
      if (abortedByTimeout) {
        throw new ApiError('timeout', `Timed out after ${timeoutMs}ms`, { url })
      }
      if (options.signal?.aborted) {
        throw new ApiError('aborted', 'Request aborted', { url, cause: error })
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new ApiError('offline', 'Browser reports no network connection', { url, cause: error })
      }
      throw new ApiError('cors', 'Request blocked or host unreachable', {
        url,
        detail: 'cors-or-unreachable',
        cause: error,
      })
    } finally {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', onExternalAbort)
    }

    const text = await response.text()
    let payload: unknown = null
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        if (response.ok) {
          throw new ApiError('parse', 'Response was not valid JSON', {
            status: response.status,
            url,
          })
        }
        payload = { detail: text.slice(0, 300) }
      }
    }

    if (!response.ok) {
      const detail = extractDetail(payload) ?? `HTTP ${response.status}`
      const usedBearer = !options.basic && this.hasFreshBearer()
      if (response.status === 401 && usedBearer && allowRetry) {
        this.bearer = null
        return this.send<T>(path, options, false)
      }
      throw new ApiError(response.status === 401 ? 'auth' : 'http', detail, {
        status: response.status,
        detail,
        url,
      })
    }

    return payload as T
  }

  /** Mints a JWT for the websocket endpoint. */
  async login(): Promise<string> {
    const token = await this.request<AccessToken>('/token/login', {
      method: 'POST',
      form: {
        username: this.credentials.username,
        password: this.credentials.password,
        grant_type: 'password',
      },
      basic: true,
      timeoutMs: 15_000,
    })
    // Access tokens are valid for 15 minutes; keep a safety margin.
    this.bearer = { token: token.access_token, expiresAt: Date.now() + 13 * 60 * 1000 }
    return token.access_token
  }

  // --- read-only endpoints -------------------------------------------------

  ping(): Promise<{ status: string }> {
    return this.request('/ping', { timeoutMs: 12_000 })
  }

  version(): Promise<VersionResponse> {
    return this.request('/version')
  }

  showConfig(): Promise<ShowConfigResponse> {
    return this.request('/show_config')
  }

  health(): Promise<HealthResponse> {
    return this.request('/health', { timeoutMs: 12_000 })
  }

  sysinfo(): Promise<SysInfoResponse> {
    return this.request('/sysinfo')
  }

  balance(): Promise<BalanceResponse> {
    return this.request('/balance')
  }

  profit(): Promise<ProfitSummary> {
    return this.request('/profit')
  }

  profitAll(): Promise<ProfitAllResponse> {
    return this.request('/profit_all')
  }

  status(): Promise<Trade[]> {
    return this.request('/status', { timeoutMs: 25_000 })
  }

  count(): Promise<StatusCountResponse> {
    return this.request('/count')
  }

  trades(params: { limit?: number; offset?: number } = {}): Promise<TradesResponse> {
    return this.request('/trades', { query: { limit: params.limit, offset: params.offset } })
  }

  trade(id: number | string): Promise<Trade> {
    return this.request(`/trade/${id}`)
  }

  tradeStats(): Promise<TradeStats> {
    return this.request('/stats')
  }

  performance(): Promise<PerformanceEntry[]> {
    return this.request('/performance')
  }

  daily(days?: number): Promise<DailyResponse> {
    return this.request('/daily', { query: { timescale: days } })
  }

  weekly(weeks?: number): Promise<DailyResponse> {
    return this.request('/weekly', { query: { timescale: weeks } })
  }

  monthly(months?: number): Promise<DailyResponse> {
    return this.request('/monthly', { query: { timescale: months } })
  }

  logs(limit = 100): Promise<LogsResponse> {
    return this.request('/logs', { query: { limit } })
  }

  whitelist(): Promise<WhitelistResponse> {
    return this.request('/whitelist')
  }

  blacklist(): Promise<BlacklistResponse> {
    return this.request('/blacklist')
  }

  locks(): Promise<LocksResponse> {
    return this.request('/locks')
  }

  pairCandles(
    pair: string,
    timeframe: string,
    limit = 200,
    columns?: string[],
  ): Promise<PairCandlesResponse> {
    if (columns?.length) {
      return this.request('/pair_candles', {
        method: 'POST',
        body: { pair, timeframe, limit, columns },
      })
    }
    return this.request('/pair_candles', { query: { pair, timeframe, limit } })
  }

  // --- write endpoints -----------------------------------------------------

  start(): Promise<StatusMsg> {
    return this.request('/start', { method: 'POST' })
  }

  stop(): Promise<StatusMsg> {
    return this.request('/stop', { method: 'POST' })
  }

  pause(): Promise<StatusMsg> {
    return this.request('/stopentry', { method: 'POST' })
  }

  reloadConfig(): Promise<StatusMsg> {
    return this.request('/reload_config', { method: 'POST' })
  }

  forceExit(payload: ForceExitPayload): Promise<StatusMsg> {
    return this.request('/forceexit', { method: 'POST', body: payload })
  }

  forceEnter(payload: ForceEnterPayload): Promise<Record<string, unknown>> {
    return this.request('/forceenter', { method: 'POST', body: payload })
  }

  addBlacklist(pairs: string[]): Promise<BlacklistResponse> {
    return this.request('/blacklist', { method: 'POST', body: { blacklist: pairs } })
  }

  deleteBlacklist(pairs: string[]): Promise<BlacklistResponse> {
    return this.request('/blacklist', {
      method: 'DELETE',
      query: { pairs_to_delete: pairs },
    })
  }

  deleteLock(payload: DeleteLockPayload): Promise<LocksResponse> {
    return this.request('/locks/delete', { method: 'POST', body: payload })
  }

  addLocks(payload: LockPayload[]): Promise<LocksResponse> {
    return this.request('/locks', { method: 'POST', body: payload })
  }
}

/** Maps an unknown thrown value to a translated, user-facing message key. */
export function describeError(error: unknown): { key: string; params?: Record<string, unknown> } {
  if (error instanceof ApiError) {
    switch (error.kind) {
      case 'auth':
        return { key: 'errors.auth' }
      case 'timeout':
        return { key: 'errors.timeout' }
      case 'offline':
        return { key: 'errors.offline' }
      case 'cors':
        return { key: 'errors.cors' }
      case 'config':
        return { key: 'errors.config' }
      case 'parse':
        return { key: 'errors.parse' }
      case 'aborted':
        return { key: 'errors.aborted' }
      default:
        if (error.status === 404) return { key: 'errors.notFound' }
        if (error.detail?.toLowerCase().includes('correct state')) {
          return { key: 'errors.notInState' }
        }
        return { key: 'errors.http', params: { status: error.status ?? 0, detail: error.detail ?? '' } }
    }
  }
  return { key: 'errors.unknown' }
}

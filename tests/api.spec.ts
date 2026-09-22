import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  absoluteBaseUrl,
  describeError,
  FreqtradeApi,
  normalizeBaseUrl,
  websocketUrl,
} from '@/lib/api'

const credentials = {
  baseUrl: 'https://bot.example.com',
  username: 'apiuser',
  password: 'secret',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('normalizeBaseUrl', () => {
  it('adds the scheme and /api/v1 path', () => {
    expect(normalizeBaseUrl('bot.example.com')).toBe('https://bot.example.com/api/v1')
    expect(normalizeBaseUrl('https://bot.example.com/')).toBe('https://bot.example.com/api/v1')
    expect(normalizeBaseUrl('https://bot.example.com/api/v1/')).toBe(
      'https://bot.example.com/api/v1',
    )
    expect(normalizeBaseUrl('http://192.168.1.10:8080')).toBe('http://192.168.1.10:8080/api/v1')
  })

  it('keeps custom reverse-proxy paths and relative dev proxies', () => {
    expect(normalizeBaseUrl('https://bot.example.com/freqtrade')).toBe(
      'https://bot.example.com/freqtrade/api/v1',
    )
    expect(normalizeBaseUrl('/ft-api')).toBe('/ft-api')
    expect(normalizeBaseUrl('   ')).toBe('')
  })
})

describe('url helpers', () => {
  it('resolves relative bases against the current origin', () => {
    expect(absoluteBaseUrl('/ft-api')).toBe(`${window.location.origin}/ft-api`)
    expect(absoluteBaseUrl('https://bot.example.com/api/v1')).toBe(
      'https://bot.example.com/api/v1',
    )
  })

  it('builds an encoded websocket url', () => {
    expect(websocketUrl('https://bot.example.com/api/v1', 'a.b c')).toBe(
      'wss://bot.example.com/api/v1/message/ws?token=a.b%20c',
    )
    expect(websocketUrl('http://host/api/v1', 'tok')).toBe(
      'ws://host/api/v1/message/ws?token=tok',
    )
  })
})

describe('FreqtradeApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('refuses an empty base url', () => {
    expect(() => new FreqtradeApi({ ...credentials, baseUrl: '  ' })).toThrow(ApiError)
  })

  it('sends basic auth and serialises query parameters', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse({ trades: [], trades_count: 0 }))
    const api = new FreqtradeApi(credentials)
    await api.trades({ limit: 50, offset: 100 })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://bot.example.com/api/v1/trades?limit=50&offset=100')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe(`Basic ${btoa('apiuser:secret')}`)
    expect(init.credentials).toBe('omit')
  })

  it('drops empty query values and repeats array values', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse({ blacklist: [] }))
    const api = new FreqtradeApi(credentials)
    await api.deleteBlacklist(['BTC/.*', 'ETH/.*'])

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('DELETE')
    expect(url).toContain('pairs_to_delete=BTC%2F.*&pairs_to_delete=ETH%2F.*')
  })

  it('uses a bearer token for REST calls after login', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'jwt-token', refresh_token: 'r' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'pong' }))
    const api = new FreqtradeApi(credentials)
    await api.login()
    await api.ping()

    const [, secondInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect((secondInit.headers as Record<string, string>).Authorization).toBe('Bearer jwt-token')
  })

  it('retries once with basic auth when the cached bearer is rejected', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'stale-token' }))
      .mockResolvedValueOnce(jsonResponse({ detail: 'Could not validate credentials' }, 401))
      .mockResolvedValueOnce(jsonResponse({ status: 'pong' }))
    const api = new FreqtradeApi(credentials)
    await api.login()
    await expect(api.ping()).resolves.toEqual({ status: 'pong' })

    const [, retryInit] = fetchMock.mock.calls[2] as [string, RequestInit]
    expect((retryInit.headers as Record<string, string>).Authorization).toBe(
      `Basic ${btoa('apiuser:secret')}`,
    )
  })

  it('does not retry forever when both bearer and basic are rejected', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'stale-token' }))
      // A fresh Response per call: a body can only be read once.
      .mockImplementation(() => Promise.resolve(jsonResponse({ detail: 'Unauthorized' }, 401)))
    const api = new FreqtradeApi(credentials)
    await api.login()
    await expect(api.ping()).rejects.toMatchObject({ kind: 'auth' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('maps 401 responses to an auth error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ detail: 'Incorrect username or password' }, 401),
    )
    const api = new FreqtradeApi(credentials)
    await expect(api.ping()).rejects.toMatchObject({ kind: 'auth', status: 401 })
  })

  it('maps transport failures to a cors/unreachable hint', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const api = new FreqtradeApi(credentials)
    await expect(api.ping()).rejects.toMatchObject({ kind: 'cors' })
  })

  it('times out slow requests', async () => {
    vi.mocked(fetch).mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )
    const api = new FreqtradeApi(credentials)
    await expect(api.request('/status', { timeoutMs: 10 })).rejects.toMatchObject({
      kind: 'timeout',
    })
  })

  it('surfaces FastAPI validation detail', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ detail: [{ msg: 'field required', type: 'value_error' }] }, 422),
    )
    const api = new FreqtradeApi(credentials)
    await expect(api.forceExit({ tradeid: 1 })).rejects.toMatchObject({
      kind: 'http',
      detail: 'field required',
      status: 422,
    })
  })
})

describe('describeError', () => {
  it('maps each error kind to a translation key', () => {
    expect(describeError(new ApiError('auth', 'nope')).key).toBe('errors.auth')
    expect(describeError(new ApiError('cors', 'blocked')).key).toBe('errors.cors')
    expect(describeError(new ApiError('http', 'boom', { status: 500 })).key).toBe('errors.http')
    expect(describeError(new Error('whatever')).key).toBe('errors.unknown')
  })

  it('explains a missing endpoint and an out-of-state bot in plain language', () => {
    expect(
      describeError(new ApiError('http', 'Not Found', { status: 404 })).key,
    ).toBe('errors.notFound')
    expect(
      describeError(
        new ApiError('http', 'Bot is not in the correct state.', { status: 502, detail: 'Bot is not in the correct state.' }),
      ).key,
    ).toBe('errors.notInState')
  })
})

export type ApiErrorKind =
  'config' | 'timeout' | 'aborted' | 'cors' | 'offline' | 'auth' | 'http' | 'parse'

/** Raised when an endpoint a feature depends on is missing or refuses to serve us. */
export const WS_AUTH_UNSUPPORTED_STATUS: readonly number[] = [404, 405, 501]

export interface ApiErrorOptions {
  status?: number
  detail?: string
  url?: string
  endpoint?: string
  cause?: unknown
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status?: number
  readonly detail?: string
  readonly url?: string
  readonly endpoint?: string

  constructor(kind: ApiErrorKind, message: string, options: ApiErrorOptions = {}) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = options.status
    this.detail = options.detail
    this.url = options.url
    this.endpoint = options.endpoint
    if (options.cause !== undefined) this.cause = options.cause
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
        return {
          key: 'errors.http',
          params: { status: error.status ?? 0, detail: error.detail ?? '' },
        }
    }
  }
  return { key: 'errors.unknown' }
}

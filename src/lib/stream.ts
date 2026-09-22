/**
 * Decides how the live stream authenticates.
 *
 * Freqtrade accepts exactly two token types on `/message/ws?token=…`:
 *  1. a JWT access token minted by `POST /token/login` (needs `api_server.jwt_secret_key`), or
 *  2. the shared `api_server.ws_token` string, when the operator configured one.
 *
 * Browsers cannot attach an `Authorization` header to a WebSocket handshake, so HTTP Basic
 * cannot be used for the socket — it stays the transport for every REST call.
 */

/** Turning the stream off is the WebSocket switch's job, not an auth choice. */
export type StreamAuthPreference = 'auto' | 'ws_token'

export type StreamAuthMode = 'jwt' | 'ws_token' | 'off' | 'unavailable'

export interface StreamAuthPlan {
  mode: StreamAuthMode
  /** Token to append to the websocket URL, when the plan has one. */
  token: string | null
  /** i18n key describing why the stream is unavailable, if it is. */
  reason?: string
  /** Whether connecting is worth attempting with this plan. */
  connectable: boolean
}

export interface StreamAuthInput {
  preference: StreamAuthPreference
  /** Operator-provided api_server.ws_token. */
  wsToken: string
  /** Access token from `/token/login`, or null when the endpoint is unusable. */
  jwtToken: string | null
  /** Normalised reason the JWT request failed, when it did. */
  jwtFailure?: JwtFailure
  /** Set after a JWT handshake was rejected, to fall back to the shared token. */
  jwtDisallowed?: boolean
}

export type JwtFailure = 'unsupported' | 'credentials' | 'other'

/** Classifies a `/token/login` failure so the UI can explain what to fix. */
export function classifyJwtFailure(error: unknown): JwtFailure {
  const status = (error as { status?: number } | null)?.status
  const kind = (error as { kind?: string } | null)?.kind
  if (status && WS_AUTH_UNSUPPORTED_STATUS.includes(status)) return 'unsupported'
  if (kind === 'auth' || status === 401 || status === 403) return 'credentials'
  if (kind === 'cors' || kind === 'offline' || kind === 'timeout') return 'other'
  return status && status >= 500 ? 'unsupported' : 'other'
}

const JWT_FAILURE_REASONS: Record<JwtFailure, string> = {
  unsupported: 'errors.wsAuthUnsupported',
  credentials: 'errors.wsAuthCredentials',
  other: 'errors.wsAuthUnavailable',
}

export function planStreamAuth(input: StreamAuthInput): StreamAuthPlan {
  const wsToken = input.wsToken.trim()

  if (input.preference === 'ws_token') {
    if (!wsToken) {
      return {
        mode: 'unavailable',
        token: null,
        reason: 'errors.wsTokenMissing',
        connectable: false,
      }
    }
    return { mode: 'ws_token', token: wsToken, connectable: true }
  }

  /*
   * auto: prefer a JWT, because it always reflects the current secret. A stale
   * `ws_token` left in the field must never shadow credentials that still work.
   */
  if (input.jwtToken && !input.jwtDisallowed) {
    return { mode: 'jwt', token: input.jwtToken, connectable: true }
  }
  if (wsToken) {
    return { mode: 'ws_token', token: wsToken, connectable: true }
  }
  return {
    mode: 'unavailable',
    token: null,
    reason: input.jwtDisallowed
      ? 'errors.wsAuthUnsupported'
      : input.jwtFailure
        ? JWT_FAILURE_REASONS[input.jwtFailure]
        : 'errors.wsAuthPending',
    connectable: false,
  }
}

/** Consecutive handshake failures after which we stop retrying on our own. */
export const STREAM_FAILURE_LIMIT = 3

export function nextRetryDelay(attempt: number): number {
  return Math.min(60_000, 1_500 * 2 ** Math.min(Math.max(attempt, 1), 6))
}
import { WS_AUTH_UNSUPPORTED_STATUS } from './api'

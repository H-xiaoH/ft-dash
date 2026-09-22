import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api'
import {
  classifyJwtFailure,
  nextRetryDelay,
  planStreamAuth,
  STREAM_FAILURE_LIMIT,
} from '@/lib/stream'

describe('planStreamAuth', () => {
  it('prefers a fresh JWT in auto mode so a stale ws_token cannot shadow it', () => {
    const plan = planStreamAuth({
      preference: 'auto',
      wsToken: 'stale-secret',
      jwtToken: 'jwt-token',
    })
    expect(plan).toMatchObject({ mode: 'jwt', token: 'jwt-token', connectable: true })
  })

  it('falls back to a ws_token in auto mode after the JWT handshake was rejected', () => {
    const plan = planStreamAuth({
      preference: 'auto',
      wsToken: 'shared-secret',
      jwtToken: 'jwt-token',
      jwtDisallowed: true,
    })
    expect(plan).toMatchObject({ mode: 'ws_token', token: 'shared-secret', connectable: true })
  })

  it('reports unsupported auth when no method is left', () => {
    const plan = planStreamAuth({
      preference: 'auto',
      wsToken: '',
      jwtToken: 'jwt-token',
      jwtDisallowed: true,
    })
    expect(plan).toMatchObject({
      mode: 'unavailable',
      connectable: false,
      reason: 'errors.wsAuthUnsupported',
    })
  })

  it('reports why the stream is unavailable instead of connecting', () => {
    expect(
      planStreamAuth({
        preference: 'auto',
        wsToken: '',
        jwtToken: null,
        jwtFailure: 'unsupported',
      }),
    ).toMatchObject({ mode: 'unavailable', connectable: false, reason: 'errors.wsAuthUnsupported' })

    expect(
      planStreamAuth({
        preference: 'auto',
        wsToken: '',
        jwtToken: null,
        jwtFailure: 'credentials',
      }).reason,
    ).toBe('errors.wsAuthCredentials')

    expect(planStreamAuth({ preference: 'auto', wsToken: '', jwtToken: null }).reason).toBe(
      'errors.wsAuthPending',
    )
  })

  it('falls back to a ws_token when the login endpoint cannot mint a JWT', () => {
    const plan = planStreamAuth({
      preference: 'auto',
      wsToken: 'shared-secret',
      jwtToken: null,
      jwtFailure: 'unsupported',
    })
    expect(plan).toMatchObject({ mode: 'ws_token', token: 'shared-secret', connectable: true })
  })

  it('honours an explicit ws_token preference and an explicit opt-out', () => {
    expect(planStreamAuth({ preference: 'ws_token', wsToken: '', jwtToken: 'jwt' })).toMatchObject({
      mode: 'unavailable',
      reason: 'errors.wsTokenMissing',
    })

    expect(
      planStreamAuth({ preference: 'ws_token', wsToken: 'tok', jwtToken: null }),
    ).toMatchObject({ mode: 'ws_token', token: 'tok' })

    expect(planStreamAuth({ preference: 'off', wsToken: 'tok', jwtToken: 'jwt' })).toMatchObject({
      mode: 'off',
      connectable: false,
    })
  })
})

describe('classifyJwtFailure', () => {
  it('separates missing endpoints, bad credentials and transient failures', () => {
    expect(classifyJwtFailure(new ApiError('http', 'nope', { status: 404 }))).toBe('unsupported')
    expect(classifyJwtFailure(new ApiError('http', 'nope', { status: 501 }))).toBe('unsupported')
    expect(classifyJwtFailure(new ApiError('http', 'boom', { status: 500 }))).toBe('unsupported')
    expect(classifyJwtFailure(new ApiError('auth', 'denied', { status: 401 }))).toBe('credentials')
    expect(classifyJwtFailure(new ApiError('cors', 'blocked'))).toBe('other')
    expect(classifyJwtFailure(new Error('weird'))).toBe('other')
  })
})

describe('nextRetryDelay', () => {
  it('backs off exponentially and caps the wait', () => {
    expect(nextRetryDelay(1)).toBe(3000)
    expect(nextRetryDelay(2)).toBe(6000)
    expect(nextRetryDelay(6)).toBe(60_000)
    expect(nextRetryDelay(9)).toBe(60_000)
    expect(nextRetryDelay(0)).toBe(3000)
    expect(STREAM_FAILURE_LIMIT).toBeGreaterThan(1)
  })
})

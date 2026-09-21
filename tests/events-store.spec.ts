import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEventsStore } from '@/stores/events'

describe('events store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('ingests a fill message into a readable event', () => {
    const events = useEventsStore()
    events.ingest({
      type: 'exit_fill',
      data: {
        pair: 'BOME/USDT:USDT',
        profit_ratio: 0.1234,
        profit_abs: 1.5,
        exit_reason: 'exit_long_quick_u_1',
      },
    })

    expect(events.events).toHaveLength(1)
    const [event] = events.events
    expect(event.type).toBe('exit_fill')
    expect(event.subject).toBe('BOME/USDT:USDT')
    expect(event.severity).toBe('good')
    expect(event.detail).toContain('12.34%')
    expect(event.detail).toContain('exit_long_quick_u_1')
  })

  it('marks losing exits and warnings with the right severity', () => {
    const events = useEventsStore()
    events.ingest({ type: 'exit_fill', data: { pair: 'X/USDT', profit_ratio: -0.02 } })
    events.ingest({ type: 'exception', data: { msg: 'exchange timeout' } })

    expect(events.events[0].severity).toBe('warn')
    expect(events.events[0].detail).toContain('exchange timeout')
    expect(events.events[1].severity).toBe('bad')
  })

  it('tracks stream status and unread counts', () => {
    const events = useEventsStore()
    events.setStatus('open')
    expect(events.isLive).toBe(true)
    expect(events.status).toBe('open')

    events.ingest({ type: 'warning', data: {} })
    expect(events.unread).toBeGreaterThan(0)
    events.markRead()
    expect(events.unread).toBe(0)

    events.clear()
    expect(events.events).toHaveLength(0)
  })

  it('caps the tape so a busy bot cannot grow memory without bound', () => {
    const events = useEventsStore()
    for (let i = 0; i < 260; i += 1) {
      events.ingest({ type: 'strategy_msg', data: { msg: `m${i}` } })
    }
    expect(events.events.length).toBeLessThanOrEqual(200)
  })
})

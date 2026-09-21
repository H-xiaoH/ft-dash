import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { WsMessage } from '@/lib/types'

export type StreamStatus = 'off' | 'connecting' | 'open' | 'closed' | 'error'

export interface BotEvent {
  id: number
  ts: number
  type: string
  /** Primary key of the payload: pair, lock id or message text. */
  subject: string
  /** Secondary line: profit, amount, reason… */
  detail: string
  severity: 'info' | 'good' | 'bad' | 'warn'
  raw?: Record<string, unknown>
}

const MAX_EVENTS = 200

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export const useEventsStore = defineStore('events', () => {
  const events = ref<BotEvent[]>([])
  const status = ref<StreamStatus>('off')
  const lastError = ref<string | null>(null)
  const lastMessageAt = ref<number | null>(null)
  const unread = ref(0)
  let nextId = 1

  const isLive = computed(() => status.value === 'open')

  function push(event: Omit<BotEvent, 'id' | 'ts'> & { ts?: number }) {
    const item: BotEvent = { id: nextId++, ts: event.ts ?? Date.now(), ...event }
    events.value = [item, ...events.value].slice(0, MAX_EVENTS)
    unread.value += 1
  }

  function clear() {
    events.value = []
    unread.value = 0
  }

  function markRead() {
    unread.value = 0
  }

  function setStatus(next: StreamStatus, error: string | null = null) {
    status.value = next
    lastError.value = error
    if (next === 'open') {
      push({ type: 'stream.connected', subject: '', detail: '', severity: 'info' })
    }
    if (next === 'closed' || next === 'error') {
      push({ type: 'stream.disconnected', subject: '', detail: error ?? '', severity: 'warn' })
    }
  }

  function ingest(message: WsMessage) {
    lastMessageAt.value = Date.now()
    const data = (message.data ?? {}) as Record<string, unknown>
    const pair = text(data.pair)
    const profitRatio = numeric(data.profit_ratio)
    const profitAbs = numeric(data.profit_abs)
    const stake = numeric(data.stake_amount)
    const amount = numeric(data.amount)
    const leverage = numeric(data.leverage)
    const exitReason = text(data.exit_reason)
    const enterTag = text(data.enter_tag)
    const direction = data.is_short === true || data.direction === 'Short' ? 'short' : 'long'

    const parts: string[] = []
    if (amount !== null) parts.push(String(amount))
    if (stake !== null) parts.push(String(stake))
    if (leverage !== null && leverage > 1) parts.push(`${leverage}x`)
    if (profitRatio !== null) parts.push(`${(profitRatio * 100).toFixed(2)}%`)
    if (profitAbs !== null) parts.push(String(profitAbs))
    if (exitReason) parts.push(exitReason)
    if (enterTag) parts.push(enterTag)
    if (text(data.status)) parts.push(text(data.status))
    if (text(data.msg)) parts.push(text(data.msg))

    let severity: BotEvent['severity'] = 'info'
    switch (message.type) {
      case 'entry':
      case 'entry_fill':
        severity = direction === 'short' ? 'bad' : 'good'
        break
      case 'exit':
      case 'exit_fill':
        severity = (profitRatio ?? 0) >= 0 ? 'good' : 'bad'
        break
      case 'warning':
      case 'exception':
      case 'protection_trigger':
      case 'protection_trigger_global':
        severity = 'warn'
        break
      default:
        severity = 'info'
    }

    push({
      type: message.type,
      subject: pair || text(data.reason) || text(data.msg) || '',
      detail: parts.join(' · '),
      severity,
      raw: data,
    })
  }

  return {
    events,
    status,
    lastError,
    lastMessageAt,
    unread,
    isLive,
    push,
    clear,
    markRead,
    setStatus,
    ingest,
  }
})

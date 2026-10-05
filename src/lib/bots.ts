/**
 * One bot = one freqtrade instance: an API base URL plus the credentials that open it.
 * The dashboard keeps a list and talks to exactly one of them at a time ("single-active"),
 * so every page keeps its one-data-source assumption.
 */

export interface Bot {
  id: string
  name: string
  baseUrl: string
  username: string
  password: string
  wsToken: string
  /** Epoch ms of the last time this bot was selected; `null` until it has been used. */
  lastUsedAt: number | null
}

export interface BotInput {
  name?: string
  baseUrl: string
  username: string
  password: string
  wsToken?: string
}

export const BOTS_KEY = 'ftdash.bots.v1'
/** Tab-scoped copy: keeps the password across a reload without writing it to disk. */
export const BOTS_SESSION_KEY = 'ftdash.bots.session.v1'
export const ACTIVE_BOT_KEY = 'ftdash.activeBot.v1'

export function newBotId(): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10)
  return `bot-${random}`
}

/** Default label: the host the API lives on, which is what the operator just typed. */
export function botNameFromUrl(baseUrl: string): string {
  const value = (baseUrl || '').trim()
  if (!value) return ''
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
    return url.hostname
  } catch {
    return value
  }
}

/** Reads one stored entry; anything without a URL and a username is dropped. */
function parseBot(raw: unknown): Bot | null {
  if (!raw || typeof raw !== 'object') return null
  const entry = raw as Record<string, unknown>
  const baseUrl = typeof entry.baseUrl === 'string' ? entry.baseUrl.trim() : ''
  const username = typeof entry.username === 'string' ? entry.username.trim() : ''
  if (!baseUrl || !username) return null
  const name = typeof entry.name === 'string' ? entry.name.trim() : ''
  return {
    id: typeof entry.id === 'string' && entry.id ? entry.id : newBotId(),
    name: name || botNameFromUrl(baseUrl),
    baseUrl,
    username,
    password: typeof entry.password === 'string' ? entry.password : '',
    wsToken: typeof entry.wsToken === 'string' ? entry.wsToken : '',
    lastUsedAt: typeof entry.lastUsedAt === 'number' ? entry.lastUsedAt : null,
  }
}

export function parseBots(raw: unknown): Bot[] {
  if (!Array.isArray(raw)) return []
  return raw.map(parseBot).filter((bot): bot is Bot => bot !== null)
}

/** Storage copy. Passwords are written to disk only when they are meant to be kept. */
export function serializeBots(bots: Bot[], includeSecrets: boolean): Bot[] {
  return bots.map((bot) => (includeSecrets ? { ...bot } : { ...bot, password: '' }))
}

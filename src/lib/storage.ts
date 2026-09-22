/**
 * Thin localStorage wrapper. Credentials live here (or in sessionStorage) and
 * never leave the browser except as an Authorization header to the API.
 */

export function readJson<T>(key: string, fallback: T, storage: Storage | null = safeStorage()): T {
  if (!storage) return fallback
  try {
    const raw = storage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as T
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

export function writeJson(key: string, value: unknown, storage: Storage | null = safeStorage()) {
  if (!storage) return
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota or private mode — the app still works, settings just won't persist */
  }
}

export function removeKey(key: string, storage: Storage | null = safeStorage()) {
  try {
    storage?.removeItem(key)
  } catch {
    /* ignore */
  }
}

/**
 * Storage access throws in some sandboxed or private contexts, so probe first and
 * fall back to "no persistence" — the app still works, settings just don't stick.
 */
function probe(kind: 'local' | 'session'): Storage | null {
  try {
    const store = kind === 'local' ? window.localStorage : window.sessionStorage
    const key = '__ftdash_probe__'
    store.setItem(key, '1')
    store.removeItem(key)
    return store
  } catch {
    return null
  }
}

export function safeStorage(): Storage | null {
  return probe('local')
}

export function safeSessionStorage(): Storage | null {
  return probe('session')
}

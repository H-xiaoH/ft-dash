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

/** localStorage access throws in some sandboxed/private contexts. */
export function safeStorage(): Storage | null {
  try {
    const probe = '__ftdash_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    return null
  }
}

export function safeSessionStorage(): Storage | null {
  try {
    const probe = '__ftdash_probe__'
    window.sessionStorage.setItem(probe, '1')
    window.sessionStorage.removeItem(probe)
    return window.sessionStorage
  } catch {
    return null
  }
}

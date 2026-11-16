import { afterEach, describe, expect, it, vi } from 'vitest'
import { readJson, removeKey, safeSessionStorage, writeJson } from '@/lib/storage'

afterEach(() => vi.restoreAllMocks())

describe('storage with exhausted write quota', () => {
  it('can still read and remove local credentials when writes throw', () => {
    localStorage.setItem('credentials', JSON.stringify({ password: 'secret' }))
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })

    expect(readJson('credentials', null)).toEqual({ password: 'secret' })
    removeKey('credentials')
    expect(localStorage.getItem('credentials')).toBeNull()
    expect(() => writeJson('settings', {})).not.toThrow()
  })

  it('keeps session credentials accessible for reading and deletion when writes throw', () => {
    sessionStorage.setItem('credentials', JSON.stringify({ password: 'secret' }))
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })

    const storage = safeSessionStorage()
    expect(readJson('credentials', null, storage)).toEqual({ password: 'secret' })
    removeKey('credentials', storage)
    expect(sessionStorage.getItem('credentials')).toBeNull()
  })

  it('falls back when browser storage access is denied', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError')
    })
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError')
    })

    expect(readJson('credentials', 'fallback')).toBe('fallback')
    expect(safeSessionStorage()).toBeNull()
    expect(() => removeKey('credentials')).not.toThrow()
    expect(() => writeJson('credentials', {})).not.toThrow()
  })
})

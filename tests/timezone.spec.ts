import { describe, expect, it } from 'vitest'
import { resolveZone } from '@/lib/timezone'

describe('resolveZone', () => {
  it('hands UTC back as UTC rather than as the browser zone', () => {
    expect(resolveZone('UTC')).toBe('UTC')
  })

  it('follows the browser for the default preference', () => {
    expect(resolveZone('browser')).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
  })
})

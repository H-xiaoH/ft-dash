import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteLocationRaw, Router } from 'vue-router'
import { isStandalone, navigatePage } from '@/lib/navigation'

function fakeRouter() {
  return {
    push: vi.fn().mockResolvedValue(undefined),
    replace: vi.fn().mockResolvedValue(undefined),
  } as unknown as Router & {
    push: ReturnType<typeof vi.fn>
    replace: ReturnType<typeof vi.fn>
  }
}

describe('page navigation', () => {
  beforeEach(() => {
    isStandalone.value = false
  })

  it('keeps normal browser navigation in the history stack', async () => {
    const router = fakeRouter()
    const to: RouteLocationRaw = '/trades'

    await navigatePage(router, to)

    expect(router.push).toHaveBeenCalledWith(to)
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('replaces page navigation in standalone mode', async () => {
    const router = fakeRouter()
    const to: RouteLocationRaw = '/trades'
    isStandalone.value = true

    await navigatePage(router, to)

    expect(router.replace).toHaveBeenCalledWith(to)
    expect(router.push).not.toHaveBeenCalled()
  })
})

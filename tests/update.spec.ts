import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkForUpdate, startUpdateChecks, UPDATE_CHECK_MS } from '@/lib/update'

/** Stands in for the browser's registration, which jsdom does not provide at all. */
function stubServiceWorker(update: () => Promise<unknown> = async () => {}) {
  const getRegistration = vi.fn(async () => ({ update }))
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { getRegistration },
    configurable: true,
  })
  return getRegistration
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('checkForUpdate', () => {
  it('asks the registration for a new worker script', async () => {
    const update = vi.fn(async () => {})
    const getRegistration = stubServiceWorker(update)

    await checkForUpdate()

    expect(getRegistration).toHaveBeenCalled()
    expect(update).toHaveBeenCalled()
  })

  it('survives a browser without service workers', async () => {
    Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true })

    await expect(checkForUpdate()).resolves.toBeUndefined()
  })

  it('swallows a check that fails, rather than reporting a background miss', async () => {
    stubServiceWorker(async () => {
      throw new Error('offline')
    })

    await expect(checkForUpdate()).resolves.toBeUndefined()
  })
})

describe('startUpdateChecks', () => {
  it('asks on the timer, again on the next tick, and when the tab comes back', async () => {
    vi.useFakeTimers()
    const getRegistration = stubServiceWorker()
    startUpdateChecks(30_000)

    const beforeTimer = getRegistration.mock.calls.length
    await vi.advanceTimersByTimeAsync(30_000)
    expect(getRegistration.mock.calls.length).toBeGreaterThan(beforeTimer)

    const afterFirst = getRegistration.mock.calls.length
    await vi.advanceTimersByTimeAsync(30_000)
    expect(getRegistration.mock.calls.length).toBeGreaterThan(afterFirst)

    // Hidden is not a moment to check: nothing is looking, and the timer will come round.
    const beforeHidden = getRegistration.mock.calls.length
    setHidden(true)
    expect(getRegistration.mock.calls.length).toBe(beforeHidden)

    setHidden(false)
    expect(getRegistration.mock.calls.length).toBeGreaterThan(beforeHidden)
  })

  it('checks about once a minute by default', () => {
    expect(UPDATE_CHECK_MS).toBe(60_000)
  })
})

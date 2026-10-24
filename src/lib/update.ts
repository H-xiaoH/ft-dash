/**
 * Keeping a tab that stays open on the newest build. The build applies itself —
 * `registerType: 'autoUpdate'` reloads the page the moment a new worker takes over — so the
 * only thing missing is asking, which the browser otherwise does on a load and nowhere else.
 */

/**
 * A minute is also the floor for a hidden tab: Chrome clamps timers there to roughly one a
 * minute, so a shorter interval would only queue up behind the throttle.
 */
export const UPDATE_CHECK_MS = 60_000

/**
 * Asks for the worker script, which is the strongest check the page has: `update()` goes
 * past the HTTP cache, so a deploy is noticed even where a CDN would still hand out the
 * previous `sw.js`.
 */
type RegistrationLike = { update: () => Promise<unknown> | unknown }
type RegistrationProvider = () => RegistrationLike | null | undefined

export async function checkForUpdate(registration?: RegistrationLike | null) {
  try {
    const current =
      registration ??
      (typeof navigator === 'undefined'
        ? undefined
        : await navigator.serviceWorker?.getRegistration())
    await current?.update()
  } catch {
    // A check nobody asked for is not worth a word — the next one comes in a minute.
  }
}

/**
 * Asks on a timer and whenever the tab comes back to the foreground: the two moments a
 * long-lived tab would otherwise never notice a deploy.
 */
export function startUpdateChecks(
  intervalMs = UPDATE_CHECK_MS,
  getRegistration: RegistrationProvider = () => undefined,
): () => void {
  const check = () => void checkForUpdate(getRegistration())
  const timer = window.setInterval(check, intervalMs)
  const onVisibilityChange = () => {
    if (!document.hidden) check()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  // The registration callback can arrive just after setup. This immediate fallback also
  // catches a worker that was registered by a previous page visit.
  check()

  return () => {
    window.clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}

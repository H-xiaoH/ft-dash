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
export async function checkForUpdate() {
  try {
    const registration = await navigator.serviceWorker?.getRegistration()
    await registration?.update()
  } catch {
    // A check nobody asked for is not worth a word — the next one comes in a minute.
  }
}

/**
 * Asks on a timer and whenever the tab comes back to the foreground: the two moments a
 * long-lived tab would otherwise never notice a deploy.
 */
export function startUpdateChecks(intervalMs = UPDATE_CHECK_MS) {
  window.setInterval(() => void checkForUpdate(), intervalMs)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void checkForUpdate()
  })
}

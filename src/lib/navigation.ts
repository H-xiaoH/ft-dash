import { shallowRef } from 'vue'
import type { RouteLocationRaw, Router } from 'vue-router'

/** Whether the current document is running as an installed standalone app. */
export function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true
}

/** Read before the first component mounts so initial standalone navigation uses the right mode. */
export const isStandalone = shallowRef(detectStandalone())

/** Page navigation replaces history in a standalone app, but stays browser-like in a tab. */
export function navigatePage(router: Router, to: RouteLocationRaw) {
  return isStandalone.value ? router.replace(to) : router.push(to)
}

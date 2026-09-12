/**
 * Service-worker registration + install prompt plumbing.
 *
 * `virtual:pwa-register` is only available once vite-plugin-pwa has generated the
 * SW, which does not happen with `devOptions.enabled: false`. We import it lazily
 * and swallow the failure so plain `npm run dev` keeps working.
 */
import { ref } from 'vue'

export const swUpdateReady = ref(false)
export const offlineReady = ref(false)
export const installAvailable = ref(false)

let deferredPrompt = null
let updateSW = null

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return

  try {
    const mod = await import('virtual:pwa-register')
    updateSW = mod.registerSW({
      immediate: true,
      onNeedRefresh() {
        swUpdateReady.value = true
      },
      onOfflineReady() {
        offlineReady.value = true
      },
      onRegisteredSW(_url, registration) {
        if (!registration) return
        // Poll for a new deployment every 30 minutes.
        setInterval(() => registration.update().catch(() => {}), 30 * 60 * 1000)
      },
    })
  } catch {
    /* dev server without PWA plugin - nothing to register */
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    installAvailable.value = true
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    installAvailable.value = false
  })
}

export async function promptInstall() {
  if (!deferredPrompt) return false
  deferredPrompt.prompt()
  const choice = await deferredPrompt.userChoice
  deferredPrompt = null
  installAvailable.value = false
  return choice?.outcome === 'accepted'
}

export async function applyUpdate() {
  if (updateSW) await updateSW(true)
  else location.reload()
}

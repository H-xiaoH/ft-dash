import { ref } from 'vue'
import { registerSW } from 'virtual:pwa-register'
import { startUpdateChecks } from '@/lib/update'

export const offlineReady = ref(false)
export const canInstall = ref(false)
export const isStandalone = ref(false)

let installPrompt: BeforeInstallPromptEvent | null = null

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function setupPwa() {
  registerSW({
    immediate: true,
    onOfflineReady() {
      offlineReady.value = true
    },
  })
  // A new build reloads the page on its own; this is what notices it while the tab is open.
  startUpdateChecks()

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    installPrompt = event as BeforeInstallPromptEvent
    canInstall.value = true
  })

  window.addEventListener('appinstalled', () => {
    canInstall.value = false
    installPrompt = null
  })

  isStandalone.value = window.matchMedia('(display-mode: standalone)').matches
  if (isStandalone.value) {
    canInstall.value = false
  }
}

export async function promptInstall(): Promise<boolean> {
  if (!installPrompt) return false
  await installPrompt.prompt()
  const choice = await installPrompt.userChoice
  installPrompt = null
  canInstall.value = false
  return choice.outcome === 'accepted'
}

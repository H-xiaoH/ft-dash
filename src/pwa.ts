import { ref } from 'vue'
import { registerSW } from 'virtual:pwa-register'

export const needRefresh = ref(false)
export const offlineReady = ref(false)
export const canInstall = ref(false)
export const isStandalone = ref(false)

let installPrompt: BeforeInstallPromptEvent | null = null
const updateServiceWorker = ref<((reloadPage?: boolean) => Promise<void>) | null>(null)

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function setupPwa() {
  updateServiceWorker.value = registerSW({
    immediate: true,
    onNeedRefresh() {
      needRefresh.value = true
    },
    onOfflineReady() {
      offlineReady.value = true
    },
  })

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

export async function applyUpdate() {
  needRefresh.value = false
  await updateServiceWorker.value?.(true)
}

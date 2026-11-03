import { ref } from 'vue'
import { registerSW } from 'virtual:pwa-register'
import { checkForUpdate } from '@/lib/update'
import { detectStandalone, isStandalone } from '@/lib/navigation'

export { isStandalone } from '@/lib/navigation'

export const updateAvailable = ref(false)
export const offlineReady = ref(false)
export const canInstall = ref(false)

let installPrompt: BeforeInstallPromptEvent | null = null
let applyWorkerUpdate: (() => Promise<void>) | undefined
let updateRequestedHere = false
let updateAlreadyActive = false

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function setupPwa() {
  applyWorkerUpdate = registerSW({
    immediate: true,
    onRegisteredSW(_scriptUrl, registration) {
      if (registration) void checkForUpdate(registration)
    },
    onNeedRefresh() {
      updateAvailable.value = true
    },
    onNeedReload() {
      updateAlreadyActive = true
      if (updateRequestedHere) window.location.reload()
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

  isStandalone.value = detectStandalone()
  if (isStandalone.value) {
    canInstall.value = false
  }
}

export function applyPwaUpdate() {
  if (updateAlreadyActive) {
    window.location.reload()
    return
  }
  updateRequestedHere = true
  return applyWorkerUpdate?.()
}

export async function promptInstall(): Promise<boolean> {
  if (!installPrompt) return false
  await installPrompt.prompt()
  const choice = await installPrompt.userChoice
  installPrompt = null
  canInstall.value = false
  return choice.outcome === 'accepted'
}

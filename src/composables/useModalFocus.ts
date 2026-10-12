import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'

let activeLockCount = 0
let savedBodyOverflow: string | null = null
let initialFocus: HTMLElement | null = null

/**
 * The part of `<dialog>` the app cannot get for free: park the page behind the modal so
 * Tab cannot reach it, move focus into the dialog, and hand focus back to whatever opened
 * it once it closes.
 */
export function useModalFocus(open: Ref<boolean>, panel: Ref<HTMLElement | null>) {
  let ownsLock = false
  let focusRequest = 0
  const shell = () => document.querySelector('.shell')

  function acquireLock() {
    if (ownsLock) return
    if (activeLockCount === 0) {
      initialFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      savedBodyOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    activeLockCount += 1
    ownsLock = true
    shell()?.setAttribute('inert', '')
  }

  function releaseLock() {
    if (!ownsLock) return false
    ownsLock = false
    activeLockCount -= 1
    if (activeLockCount > 0) return false

    shell()?.removeAttribute('inert')
    document.body.style.overflow = savedBodyOverflow ?? ''
    savedBodyOverflow = null
    return true
  }

  function restoreFocus() {
    const target = initialFocus
    initialFocus = null
    if (target?.isConnected) {
      target.focus()
      return
    }
    const fallback = shell()?.querySelector<HTMLElement>(
      'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    fallback?.focus()
  }

  watch(
    open,
    async (isOpen) => {
      if (isOpen) {
        // Teleported dialogs sit outside the shell, so inerting it cannot reach them.
        acquireLock()
        const request = ++focusRequest
        await nextTick()
        if (request === focusRequest && open.value) panel.value?.focus()
        return
      }
      focusRequest += 1
      if (releaseLock()) restoreFocus()
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    focusRequest += 1
    if (releaseLock()) restoreFocus()
  })
}

import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'

let activeLockCount = 0
let savedBodyOverflow: string | null = null

/**
 * The part of `<dialog>` the app cannot get for free: park the page behind the modal so
 * Tab cannot reach it, move focus into the dialog, and hand focus back to whatever opened
 * it once it closes.
 */
export function useModalFocus(open: Ref<boolean>, panel: Ref<HTMLElement | null>) {
  let restoreTo: HTMLElement | null = null
  let ownsLock = false
  let focusRequest = 0
  const shell = () => document.querySelector('.shell')

  function acquireLock() {
    if (ownsLock) return
    if (activeLockCount === 0) {
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

  watch(
    open,
    async (isOpen) => {
      if (isOpen) {
        // Teleported dialogs sit outside the shell, so inerting it cannot reach them.
        restoreTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
        acquireLock()
        const request = ++focusRequest
        await nextTick()
        if (request === focusRequest && open.value) panel.value?.focus()
        return
      }
      focusRequest += 1
      if (releaseLock()) restoreTo?.focus()
      restoreTo = null
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    focusRequest += 1
    if (releaseLock()) restoreTo?.focus()
    restoreTo = null
  })
}

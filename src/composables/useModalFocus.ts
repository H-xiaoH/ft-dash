import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'

/**
 * The part of `<dialog>` the app cannot get for free: park the page behind the modal so
 * Tab cannot reach it, move focus into the dialog, and hand focus back to whatever opened
 * it once it closes.
 */
export function useModalFocus(open: Ref<boolean>, panel: Ref<HTMLElement | null>) {
  let restoreTo: HTMLElement | null = null
  const shell = () => document.querySelector('.shell')

  watch(open, async (isOpen) => {
    if (isOpen) {
      // Teleported dialogs sit outside the shell, so inerting it cannot reach them.
      restoreTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
      shell()?.setAttribute('inert', '')
      await nextTick()
      panel.value?.focus()
      return
    }
    shell()?.removeAttribute('inert')
    restoreTo?.focus()
    restoreTo = null
  })

  onBeforeUnmount(() => {
    shell()?.removeAttribute('inert')
  })
}

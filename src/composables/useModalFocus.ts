import { computed, nextTick, onBeforeUnmount, shallowRef, watch, type Ref } from 'vue'

let activeLockCount = 0
let savedBodyOverflow: string | null = null
let nextModalId = 0

interface ModalEntry {
  id: number
  panel: Ref<HTMLElement | null>
  opener: HTMLElement | null
  parent: ModalEntry | null
  active: boolean
}

const modalStack = shallowRef<ModalEntry[]>([])

/**
 * The part of `<dialog>` the app cannot get for free: park the page behind the modal so
 * Tab cannot reach it, move focus into the dialog, and hand focus back to whatever opened
 * it once it closes.
 */
export function useModalFocus(open: Ref<boolean>, panel: Ref<HTMLElement | null>) {
  const entry: ModalEntry = {
    id: ++nextModalId,
    panel,
    opener: null,
    parent: null,
    active: false,
  }
  let focusRequest = 0
  const shell = () => document.querySelector('.shell')
  const topModal = () => modalStack.value[modalStack.value.length - 1]

  function activeElement(): HTMLElement | null {
    return document.activeElement instanceof HTMLElement ? document.activeElement : null
  }

  function resolveFocusContext(modal: ModalEntry): HTMLElement | null {
    if (modal.parent) {
      if (modal.parent.active) {
        const parentPanel = modal.parent.panel.value
        if (parentPanel?.isConnected) return parentPanel
      }

      const parentContext = resolveFocusContext(modal.parent)
      if (parentContext) return parentContext
    }

    return modal.opener?.isConnected ? modal.opener : null
  }

  function focusFallback() {
    const fallback = shell()?.querySelector<HTMLElement>(
      'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    fallback?.focus()
  }

  function restoreFocus(modal: ModalEntry) {
    const target = resolveFocusContext(modal)
    if (target) {
      target.focus()
      return
    }
    focusFallback()
  }

  function focusTopModal() {
    void nextTick(() => {
      const top = topModal()
      if (!top) return
      const target = top.panel.value
      if (target?.isConnected) {
        target.focus()
        return
      }
      resolveFocusContext(top)?.focus()
    })
  }

  function acquireLock() {
    if (entry.active) return
    entry.parent = topModal() ?? null
    entry.opener = activeElement()
    entry.active = true
    if (activeLockCount === 0) {
      savedBodyOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    activeLockCount += 1
    modalStack.value = [...modalStack.value, entry]
    shell()?.setAttribute('inert', '')
  }

  function releaseLock() {
    if (!entry.active) return false
    const index = modalStack.value.indexOf(entry)
    const wasTop = topModal()?.id === entry.id
    entry.active = false
    if (index >= 0) modalStack.value = modalStack.value.filter((modal) => modal !== entry)
    activeLockCount = Math.max(0, activeLockCount - 1)
    if (activeLockCount > 0) {
      if (wasTop) focusTopModal()
      return false
    }

    shell()?.removeAttribute('inert')
    document.body.style.overflow = savedBodyOverflow ?? ''
    savedBodyOverflow = null
    restoreFocus(entry)
    return true
  }

  const isTopModal = computed(() => entry.active && open.value && topModal()?.id === entry.id)

  watch(
    open,
    async (isOpen) => {
      if (isOpen) {
        // Teleported dialogs sit outside the shell, so inerting it cannot reach them.
        acquireLock()
        const request = ++focusRequest
        await nextTick()
        if (request === focusRequest && isTopModal.value) panel.value?.focus()
        return
      }
      focusRequest += 1
      releaseLock()
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    focusRequest += 1
    releaseLock()
  })

  return { isTopModal }
}

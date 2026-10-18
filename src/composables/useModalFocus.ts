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
  // Each opening owns a fresh entry. A still-open child may retain the previous entry as
  // its parent while this same component closes and reopens around it.
  let entry: ModalEntry | null = null
  let focusRequest = 0
  const shell = () => document.querySelector('.shell')
  const topModal = () => modalStack.value[modalStack.value.length - 1]

  function activeElement(): HTMLElement | null {
    const element = document.activeElement
    return element instanceof HTMLElement && element !== document.body ? element : null
  }

  function resolveFocusContext(modal: ModalEntry): HTMLElement | null {
    const visited = new Set<ModalEntry>()
    const chain: ModalEntry[] = []
    let current: ModalEntry | null = modal
    while (current && !visited.has(current)) {
      visited.add(current)
      chain.push(current)
      const parent: ModalEntry | null = current.parent
      if (parent?.active && parent.panel.value?.isConnected) return parent.panel.value
      current = parent
    }
    for (const ancestor of chain.reverse()) {
      if (ancestor.opener?.isConnected) return ancestor.opener
    }
    return null
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
    if (entry?.active) return
    const modal: ModalEntry = {
      id: ++nextModalId,
      panel,
      opener: activeElement(),
      parent: topModal() ?? null,
      active: true,
    }
    entry = modal
    if (activeLockCount === 0) {
      savedBodyOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    activeLockCount += 1
    modalStack.value = [...modalStack.value, modal]
    shell()?.setAttribute('inert', '')
  }

  function releaseLock() {
    const modal = entry
    if (!modal?.active) return false
    entry = null
    const index = modalStack.value.indexOf(modal)
    const wasTop = topModal()?.id === modal.id
    modal.active = false
    if (index >= 0) modalStack.value = modalStack.value.filter((item) => item !== modal)
    activeLockCount = Math.max(0, activeLockCount - 1)
    if (activeLockCount > 0) {
      if (wasTop) focusTopModal()
      return false
    }

    shell()?.removeAttribute('inert')
    document.body.style.overflow = savedBodyOverflow ?? ''
    savedBodyOverflow = null
    restoreFocus(modal)
    return true
  }

  const isTopModal = computed(() => entry?.active && open.value && topModal()?.id === entry.id)

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

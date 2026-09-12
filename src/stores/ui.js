import { defineStore } from 'pinia'
import { ref } from 'vue'

let seq = 0

/**
 * Toasts and a promise-based confirm dialog.
 */
export const useUiStore = defineStore('ui', () => {
  const toasts = ref([])

  const confirmState = ref({
    open: false,
    title: '',
    message: '',
    confirmLabel: '确认',
    danger: false,
    resolve: null,
  })

  function toast(message, { type = 'info', timeout = 3200, detail = '' } = {}) {
    const id = ++seq
    toasts.value.push({ id, message, type, detail })
    if (timeout > 0) setTimeout(() => dismiss(id), timeout)
    return id
  }

  function dismiss(id) {
    toasts.value = toasts.value.filter((item) => item.id !== id)
  }

  const success = (message, detail) => toast(message, { type: 'success', detail })
  const error = (message, detail) => toast(message, { type: 'error', timeout: 6000, detail })
  const info = (message, detail) => toast(message, { type: 'info', detail })
  const warn = (message, detail) => toast(message, { type: 'warn', timeout: 4500, detail })

  /** `await confirm({...})` resolves true/false. */
  function confirm({ title, message, confirmLabel = '确认', danger = false }) {
    return new Promise((resolve) => {
      confirmState.value = { open: true, title, message, confirmLabel, danger, resolve }
    })
  }

  function resolveConfirm(value) {
    confirmState.value.resolve?.(value)
    confirmState.value = { ...confirmState.value, open: false, resolve: null }
  }

  return {
    toasts,
    confirmState,
    toast,
    dismiss,
    success,
    error,
    info,
    warn,
    confirm,
    resolveConfirm,
  }
})

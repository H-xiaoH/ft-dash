import { ref } from 'vue'

export type ToastTone = 'info' | 'good' | 'bad'

export interface Toast {
  id: number
  message: string
  tone: ToastTone
  /** Carried so the toast can draw the countdown that matches its own dismissal. */
  ttlMs: number
}

const toasts = ref<Toast[]>([])
let nextId = 1

export function pushToast(message: string, tone: ToastTone = 'info', ttlMs = 4000) {
  const id = nextId++
  toasts.value = [...toasts.value, { id, message, tone, ttlMs }]
  window.setTimeout(() => dismissToast(id), ttlMs)
  return id
}

export function dismissToast(id: number) {
  toasts.value = toasts.value.filter((toast) => toast.id !== id)
}

export function useToasts() {
  return { toasts, pushToast, dismissToast }
}

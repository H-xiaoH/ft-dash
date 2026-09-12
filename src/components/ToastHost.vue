<script setup>
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import Icon from './Icon.vue'

const ui = useUiStore()
const { toasts } = storeToRefs(ui)

const ICON_BY_TYPE = {
  success: 'check',
  error: 'alert',
  warn: 'alert',
  info: 'info',
}
</script>

<template>
  <Teleport to="body">
    <div class="toast-host" role="status" aria-live="polite">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="toast"
          :class="`toast--${toast.type}`"
          @click="ui.dismiss(toast.id)"
        >
          <Icon class="toast-icon" :name="ICON_BY_TYPE[toast.type] || 'info'" :size="16" />
          <div class="grow">
            <div class="toast-title">{{ toast.message }}</div>
            <div v-if="toast.detail" class="toast-detail">{{ toast.detail }}</div>
          </div>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: opacity 200ms var(--ease), transform 200ms var(--ease);
}

.toast-leave-active {
  position: absolute;
  right: 0;
  left: 0;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.97);
}
</style>

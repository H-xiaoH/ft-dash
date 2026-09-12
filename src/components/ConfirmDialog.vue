<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import Icon from './Icon.vue'

const ui = useUiStore()
const { confirmState } = storeToRefs(ui)
const confirmButton = ref(null)

function onKeydown(event) {
  if (!confirmState.value.open) return
  if (event.key === 'Escape') ui.resolveConfirm(false)
  if (event.key === 'Enter') ui.resolveConfirm(true)
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

watch(
  () => confirmState.value.open,
  (open) => {
    if (open) requestAnimationFrame(() => confirmButton.value?.focus())
  },
)
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="confirmState.open"
        class="modal-backdrop"
        @click.self="ui.resolveConfirm(false)"
      >
        <div class="modal" style="max-width: 420px" role="dialog" aria-modal="true">
          <div class="row" style="padding: 18px 18px 0; gap: 12px">
            <div
              class="stat-icon"
              :style="{
                background: confirmState.danger ? 'var(--loss-soft)' : 'var(--warn-soft)',
                color: confirmState.danger ? 'var(--loss)' : 'var(--warn)',
                width: '34px',
                height: '34px',
              }"
            >
              <Icon name="alert" :size="18" />
            </div>
            <div class="grow">
              <div class="modal-title">{{ confirmState.title }}</div>
            </div>
          </div>

          <div class="modal-body" style="padding-top: 10px">
            <p class="muted" style="font-size: 13px; line-height: 1.6">
              {{ confirmState.message }}
            </p>
          </div>

          <div class="modal-foot">
            <button class="btn" @click="ui.resolveConfirm(false)">取消</button>
            <button
              ref="confirmButton"
              class="btn"
              :class="confirmState.danger ? 'btn--danger' : 'btn--primary'"
              @click="ui.resolveConfirm(true)"
            >
              {{ confirmState.confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 160ms var(--ease);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

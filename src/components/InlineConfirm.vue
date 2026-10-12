<script setup lang="ts">
withDefaults(
  defineProps<{
    open: boolean
    message: string
    confirmLabel: string
    cancelLabel: string
    pending?: boolean
  }>(),
  { pending: false },
)

const emit = defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
  <div v-if="open" class="banner banner--warn inline-confirm" role="alert">
    <div class="inline-confirm__message">{{ message }}</div>
    <div class="inline-confirm__actions">
      <button type="button" class="btn btn--primary" :disabled="pending" @click="emit('confirm')">
        {{ confirmLabel }}
      </button>
      <button type="button" class="btn" @click="emit('cancel')">
        {{ cancelLabel }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.inline-confirm {
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  text-align: center;
}

.inline-confirm__message {
  min-width: 0;
  overflow-wrap: anywhere;
}

.inline-confirm__actions {
  display: flex;
  flex: none;
  gap: var(--sp-2);
}
</style>

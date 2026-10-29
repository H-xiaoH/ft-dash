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
  <!-- The banner chrome, stacked and centred: a confirmation reads as one block, not a row. -->
  <div v-if="open" class="banner banner--warn inline-confirm" role="alert">
    <div class="banner__body">
      <div class="banner__message">{{ message }}</div>
    </div>
    <div class="banner__actions">
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
  grid-template-columns: minmax(0, 1fr);
  justify-items: center;
  row-gap: var(--sp-3);
  text-align: center;
}

.inline-confirm .banner__actions {
  /* The base banner drops its action under the words on phones; here it is already stacked. */
  grid-column: auto;
  flex-wrap: wrap;
  justify-content: center;
}
</style>

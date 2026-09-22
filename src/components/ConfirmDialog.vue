<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    body?: string
    confirmLabel?: string
    cancelLabel?: string
    tone?: 'primary' | 'danger'
    /** When set, the operator must type this exact string to enable confirm. */
    requireText?: string
    requiredHint?: string
    pending?: boolean
  }>(),
  { tone: 'primary', pending: false },
)

const emit = defineEmits<{ confirm: []; cancel: [] }>()

const { t } = useI18n()
const typed = ref('')

watch(
  () => props.open,
  (open) => {
    if (open) typed.value = ''
  },
)

const canConfirm = computed(
  () => !props.requireText || typed.value.trim() === props.requireText.trim(),
)
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="overlay" role="dialog" aria-modal="true" @click.self="emit('cancel')">
      <div class="dialog">
        <div class="dialog__head">
          <span class="dialog__title">{{ title }}</span>
          <div class="spacer" />
          <button type="button" class="btn btn--icon btn--ghost" @click="emit('cancel')">
            <span aria-hidden="true">✕</span>
            <span class="sr-only">{{ t('common.close') }}</span>
          </button>
        </div>
        <div class="dialog__body">
          <p v-if="body">{{ body }}</p>
          <p v-if="tone === 'danger'" class="confirm-warning">{{ t('actions.confirmBody') }}</p>
          <label v-if="requireText" class="field">
            <span class="field__label">{{
              requiredHint ?? t('actions.forceExitConfirm', { pair: requireText })
            }}</span>
            <input v-model="typed" class="input num" autocomplete="off" spellcheck="false" />
          </label>
        </div>
        <div class="dialog__foot">
          <button type="button" class="btn" @click="emit('cancel')">
            {{ cancelLabel ?? t('common.cancel') }}
          </button>
          <button
            type="button"
            class="btn"
            :class="tone === 'danger' ? 'btn--danger' : 'btn--primary'"
            :disabled="!canConfirm || pending"
            @click="emit('confirm')"
          >
            {{ pending ? t('actions.running') : (confirmLabel ?? t('actions.run')) }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.confirm-warning {
  color: var(--warn);
  font-size: var(--fs-base);
}
</style>

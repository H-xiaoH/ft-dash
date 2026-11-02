<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import type { IconName } from '@/components/icons'
import { useModalFocus } from '@/composables/useModalFocus'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    body?: string
    confirmLabel?: string
    cancelLabel?: string
    tone?: 'primary' | 'danger'
    warning?: string
    confirmIcon?: IconName
    /** When set, the operator must type this exact string to enable confirm. */
    requireText?: string
    requiredHint?: string
    pending?: boolean
  }>(),
  { tone: 'primary', pending: false },
)

const emit = defineEmits<{ confirm: []; cancel: [] }>()

const { t } = useI18n()
const titleId = useId()
const typed = ref('')
const panel = ref<HTMLElement | null>(null)

const { isTopModal } = useModalFocus(
  computed(() => props.open),
  panel,
)

watch(
  () => props.open,
  (open) => {
    if (open) typed.value = ''
  },
)

const canConfirm = computed(
  () => !props.requireText || typed.value.trim() === props.requireText.trim(),
)

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !props.open || !isTopModal.value) return
  event.preventDefault()
  event.stopPropagation()
  emit('cancel')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="popup" appear @before-leave="(el) => el.setAttribute('inert', '')">
      <div
        v-if="open"
        class="overlay"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        @click.self="emit('cancel')"
      >
        <div ref="panel" class="dialog" tabindex="-1">
          <div class="dialog__head">
            <span :id="titleId" class="dialog__title">{{ title }}</span>
            <div class="spacer" />
            <button type="button" class="btn btn--icon btn--ghost" @click="emit('cancel')">
              <AppIcon name="close" />
              <span class="sr-only">{{ t('common.close') }}</span>
            </button>
          </div>
          <div class="dialog__body">
            <!-- A slot for callers whose explanation is a list, not one sentence. -->
            <slot name="body">
              <p v-if="body">{{ body }}</p>
            </slot>
            <p v-if="tone === 'danger' && warning !== ''" class="confirm-warning">
              {{ warning ?? t('actions.confirmBody') }}
            </p>
            <label v-if="requireText" class="field">
              <span class="field__label">{{
                requiredHint ?? t('actions.forceExitConfirm', { pair: requireText })
              }}</span>
              <input v-model="typed" class="input num" autocomplete="off" spellcheck="false" />
            </label>
          </div>
          <div class="dialog__foot">
            <button type="button" class="btn" @click="emit('cancel')">
              <AppIcon name="close" />
              {{ cancelLabel ?? t('common.cancel') }}
            </button>
            <button
              type="button"
              class="btn"
              :class="tone === 'danger' ? 'btn--danger' : 'btn--primary'"
              :disabled="!canConfirm || pending"
              @click="open && canConfirm && !pending && emit('confirm')"
            >
              <AppIcon
                :name="
                  pending ? 'refresh' : (confirmIcon ?? (tone === 'danger' ? 'alert' : 'check'))
                "
              />
              {{ pending ? t('actions.running') : (confirmLabel ?? t('actions.run')) }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.confirm-warning {
  color: var(--warn);
  font-size: var(--fs-base);
}

.overlay,
.dialog {
  overscroll-behavior: contain;
}
</style>

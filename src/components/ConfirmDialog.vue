<script setup lang="ts">
import { computed, ref, useId, watch, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from './AppIcon.vue'
import type { IconName } from './icons'

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
const canConfirm = computed(
  () => !props.requireText || typed.value.trim() === props.requireText.trim(),
)
watch(
  () => props.open,
  (value) => {
    if (value) typed.value = ''
  },
)
function confirm() {
  if (props.open && canConfirm.value && !props.pending) emit('confirm')
}
const activator = shallowRef<HTMLElement>()
watch(
  () => props.open,
  (open) => {
    if (open) {
      const active = document.activeElement
      activator.value =
        active instanceof HTMLElement && active !== document.body ? active : undefined
    }
  },
  { immediate: true },
)
</script>

<template>
  <VDialog
    :activator="activator"
    :open-on-click="false"
    :close-on-back="false"
    :model-value="open"
    :persistent="pending"
    max-width="480"
    :aria-labelledby="titleId"
    @update:model-value="!$event && emit('cancel')"
  >
    <VCard>
      <VCardTitle :id="titleId" class="text-wrap">{{ title }}</VCardTitle>
      <VCardText class="d-flex flex-column ga-4">
        <slot name="body"
          ><p v-if="body">{{ body }}</p></slot
        >
        <VAlert v-if="tone === 'danger' && warning !== ''" type="warning" variant="tonal">{{
          warning ?? t('actions.confirmBody')
        }}</VAlert>
        <VTextField
          v-if="requireText"
          v-model="typed"
          :label="requiredHint ?? t('actions.forceExitConfirm', { pair: requireText })"
          autocomplete="off"
          spellcheck="false"
          @keydown.enter="confirm"
        />
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn :disabled="pending" @click="emit('cancel')">{{
          cancelLabel ?? t('common.cancel')
        }}</VBtn>
        <VBtn
          :color="tone === 'danger' ? 'error' : 'primary'"
          variant="flat"
          :disabled="!canConfirm || pending"
          :loading="pending"
          @click="confirm"
        >
          <AppIcon :name="confirmIcon ?? (tone === 'danger' ? 'alert' : 'check')" />
          {{ confirmLabel ?? t('actions.run') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

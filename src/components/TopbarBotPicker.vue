<script setup lang="ts">
import { useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useBackendPicker } from '@/composables/useBackendPicker'
import { navigatePage } from '@/lib/navigation'
import FilterMenu from './FilterMenu.vue'

defineProps<{ hidden: boolean }>()
const emit = defineEmits<{ 'focus-fallback': [] }>()

const { t } = useI18n()
const router = useRouter()
const {
  choice,
  options,
  probeBackends,
  passwordEntry,
  passwordDraft,
  cancelPassword,
  submitPassword,
} = useBackendPicker()
const picker = useTemplateRef<{ focusTrigger: () => boolean }>('picker')
const titleId = useId()

function openManager() {
  const current = router.currentRoute.value
  if (current.name === 'settings') {
    void router.replace({ name: 'settings', query: { ...current.query, manage: 'backends' } })
  } else {
    void navigatePage(router, { name: 'settings', query: { manage: 'backends' } })
  }
}

function restoreFocus() {
  if (!passwordEntry.value && !picker.value?.focusTrigger()) emit('focus-fallback')
}
</script>

<template>
  <FilterMenu
    ref="picker"
    v-model="choice"
    :options="options"
    :label="t('bots.select')"
    :action-label="t('bots.manage')"
    :disabled="hidden"
    @open-change="probeBackends"
    @action="openManager"
  />

  <VDialog
    :model-value="passwordEntry !== null"
    :aria-labelledby="titleId"
    max-width="420"
    @update:model-value="!$event && cancelPassword()"
    @after-leave="restoreFocus"
  >
    <VForm @submit.prevent="submitPassword">
      <VCard>
        <VCardTitle :id="titleId" tag="h2">{{ t('bots.connect') }}</VCardTitle>
        <VCardText>
          <VTextField
            v-model="passwordDraft"
            :label="t('bots.needPassword', { name: passwordEntry?.name })"
            name="password"
            type="password"
            autocomplete="current-password"
          />
        </VCardText>
        <VCardActions>
          <VBtn type="button" variant="text" @click="cancelPassword">{{ t('common.cancel') }}</VBtn>
          <VBtn type="submit" color="primary" variant="flat" :disabled="!passwordDraft">
            {{ t('bots.connect') }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VForm>
  </VDialog>
</template>

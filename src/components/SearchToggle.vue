<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { VBtn } from 'vuetify/components/VBtn'
import { VTextField } from 'vuetify/components/VTextField'
import { ICON_PATHS } from './icons'

const props = withDefaults(defineProps<{ placeholder?: string }>(), { placeholder: '' })
const model = defineModel<string>({ default: '' })
const { t } = useI18n()
const open = ref(false)
const trigger = useTemplateRef<InstanceType<typeof VBtn>>('trigger')
const input = useTemplateRef<InstanceType<typeof VTextField>>('input')
function collapse() {
  open.value = false
  model.value = ''
}
</script>

<template>
  <VFadeTransition mode="out-in" @after-enter="open ? input?.focus() : trigger?.$el.focus()">
    <VBtn
      v-if="!open"
      ref="trigger"
      key="button"
      :icon="ICON_PATHS.search"
      :aria-label="t('common.search')"
      :title="t('common.search')"
      @click="open = true"
    />
    <VTextField
      v-else
      ref="input"
      key="field"
      v-model="model"
      class="search-toggle"
      type="search"
      :label="props.placeholder || t('common.search')"
      :prepend-inner-icon="ICON_PATHS.search"
      :clear-icon="ICON_PATHS.close"
      clearable
      persistent-clear
      hide-details
      @click:clear="collapse"
      @keydown.esc.stop="collapse"
    />
  </VFadeTransition>
</template>

<style scoped>
.search-toggle {
  width: 220px;
  flex: 0 1 220px;
  min-width: 120px;
}
@media (width < 720px) {
  .search-toggle {
    width: 160px;
    flex-basis: 160px;
  }
}
</style>

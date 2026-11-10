<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { VBtn } from 'vuetify/components/VBtn'
import { VTextField } from 'vuetify/components/VTextField'
import { ICON_PATHS } from './icons'

const props = withDefaults(defineProps<{ placeholder?: string }>(), { placeholder: '' })
const model = defineModel<string>({ default: '' })
const { t } = useI18n()
const open = ref(false)
const control = useTemplateRef<HTMLElement>('control')
const trigger = useTemplateRef<InstanceType<typeof VBtn>>('trigger')
const input = useTemplateRef<InstanceType<typeof VTextField>>('input')
let restoreFocus = true
function collapse(focus = true) {
  restoreFocus = focus
  open.value = false
  model.value = ''
}
onClickOutside(control, () => {
  if (open.value && !model.value.trim()) collapse(false)
})

function focusAfterTransition() {
  const active = document.activeElement
  if (active !== document.body && !control.value?.contains(active)) return
  if (open.value) input.value?.focus()
  else if (restoreFocus) trigger.value?.$el.focus()
}
</script>

<template>
  <div ref="control" class="search-control">
    <VFadeTransition mode="out-in" @after-enter="focusAfterTransition">
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
        :placeholder="props.placeholder || t('common.search')"
        :aria-label="props.placeholder || t('common.search')"
        :aria-labelledby="undefined"
        :prepend-inner-icon="ICON_PATHS.search"
        hide-details
        @keydown.esc.stop.prevent="collapse()"
      >
        <template #append-inner>
          <VBtn
            :icon="ICON_PATHS.close"
            :aria-label="t('common.close')"
            variant="text"
            size="x-small"
            width="28"
            height="28"
            @click.stop="collapse()"
          />
        </template>
      </VTextField>
    </VFadeTransition>
  </div>
</template>

<style scoped>
.search-control {
  display: contents;
}
.search-toggle {
  width: 220px;
  flex: 0 1 220px;
  min-width: 120px;
}
.search-toggle :deep(input::-webkit-search-cancel-button) {
  display: none;
}
@media (width < 720px) {
  .search-toggle {
    width: 160px;
    flex-basis: 160px;
  }
}
</style>

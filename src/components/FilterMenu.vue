<script setup lang="ts" generic="T extends string">
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from './AppIcon.vue'

export type StatusLamp = 'good' | 'warn' | 'bad' | 'muted'
export interface FilterOption<T extends string = string> {
  value: T
  label: string
  hint?: string
  dot?: StatusLamp
}

const props = withDefaults(
  defineProps<{
    options: FilterOption<T>[]
    label?: string
    prefix?: string
    triggerLabel?: string
    align?: 'start' | 'end'
    searchable?: boolean
    searchText?: Record<string, string>
    triggerHint?: string
  }>(),
  {
    label: '',
    prefix: '',
    triggerLabel: '',
    align: 'end',
    searchable: false,
    searchText: () => ({}),
    triggerHint: '',
  },
)
const emit = defineEmits<{ 'open-change': [open: boolean] }>()
const model = defineModel<T>()
const { t } = useI18n()
const open = ref(false)
const query = ref('')
const titleId = useId()
const current = computed(
  () => props.options.find((option) => option.value === model.value) ?? props.options[0],
)
const visibleOptions = computed(() => {
  const term = query.value.trim().toLowerCase()
  return !props.searchable || !term
    ? props.options
    : props.options.filter((option) =>
        `${option.label} ${option.value} ${props.searchText[option.value] ?? ''}`
          .toLowerCase()
          .includes(term),
      )
})
watch(open, (value) => {
  query.value = ''
  emit('open-change', value)
})
const lampColors: Record<StatusLamp, string> = {
  good: 'success',
  warn: 'warning',
  bad: 'error',
  muted: 'secondary',
}
function choose(value: T) {
  model.value = value
  open.value = false
}
</script>

<template>
  <div class="filter-menu">
    <VMenu
      v-model="open"
      :location="`bottom ${align}`"
      :close-on-content-click="false"
      max-height="360"
    >
      <template #activator="{ props: activatorProps }">
        <VBtn
          v-bind="activatorProps"
          class="filter-menu__button"
          :class="{ 'filter-menu__button--with-hint': triggerHint }"
          :height="triggerHint ? 'auto' : undefined"
          :aria-label="label || prefix || current?.label"
        >
          <VBadge v-if="current?.dot" dot inline :color="lampColors[current.dot]" />
          <span v-if="prefix" class="muted">{{ prefix }}</span>
          <span class="filter-menu__trigger-label"
            >{{ triggerLabel || current?.label }}
            <span v-if="triggerHint" class="filter-menu__trigger-hint num">{{
              triggerHint
            }}</span></span
          >
          <AppIcon name="chevronDown" :size="14" />
        </VBtn>
      </template>
      <VCard class="filter-menu__list" min-width="180">
        <VCardTitle :id="titleId" class="text-body-2 px-4 py-3">{{
          label || t('common.filter')
        }}</VCardTitle>
        <VTextField
          v-if="searchable"
          v-model="query"
          autofocus
          type="search"
          class="ma-2"
          :label="t('common.search')"
          clearable
          @update:model-value="query = $event ?? ''"
          @keydown.stop
        />
        <VList
          role="listbox"
          :aria-labelledby="titleId"
          :selected="model ? [model] : []"
          color="primary"
        >
          <VListItem
            v-for="option in visibleOptions"
            :key="option.value"
            :value="option.value"
            role="option"
            :aria-selected="option.value === model"
            @click="choose(option.value)"
          >
            <template #prepend>
              <VBadge v-if="option.dot" dot inline :color="lampColors[option.dot]" class="mr-2" />
            </template>
            <VListItemTitle>{{ option.label }}</VListItemTitle>
            <VListItemSubtitle v-if="option.hint" class="num">{{ option.hint }}</VListItemSubtitle>
          </VListItem>
        </VList>
        <VEmptyState v-if="!visibleOptions.length" :text="t('common.noMatch')" class="pa-3" />
      </VCard>
    </VMenu>
  </div>
</template>

<style scoped>
.filter-menu {
  display: inline-flex;
  min-width: 0;
  max-width: 100%;
}
.filter-menu__button--with-hint {
  height: auto;
  min-height: 36px;
  padding-block: 8px;
}
.filter-menu__button--with-hint :deep(.v-btn__content) {
  white-space: normal;
}
.filter-menu__trigger-label {
  min-width: 0;
  overflow-wrap: anywhere;
  text-align: start;
}
.filter-menu__trigger-hint {
  color: var(--text-3);
}
</style>

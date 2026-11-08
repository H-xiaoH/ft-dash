<script setup lang="ts" generic="T extends string">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from './AppIcon.vue'
import FilterMenu, { type FilterOption } from './FilterMenu.vue'

defineProps<{ options: FilterOption<T>[] }>()
const field = defineModel<T>({ required: true })
const direction = defineModel<'asc' | 'desc'>('direction', { required: true })
const { t } = useI18n()
const nextDirection = computed(() => (direction.value === 'asc' ? 'desc' : 'asc'))
const toggleLabel = computed(() =>
  t('trades.sortTo', {
    dir: t(nextDirection.value === 'asc' ? 'trades.sortAsc' : 'trades.sortDesc'),
  }),
)
</script>

<template>
  <VBtnGroup class="sort-group" variant="tonal">
    <FilterMenu
      v-model="field"
      :options="options"
      :prefix="t('trades.sort')"
      :label="t('trades.sort')"
    />
    <VDivider vertical />
    <VBtn
      :icon="true"
      type="button"
      class="sort-group__dir"
      :aria-label="toggleLabel"
      :title="toggleLabel"
      @click="direction = nextDirection"
    >
      <AppIcon :name="direction === 'asc' ? 'chevronUp' : 'chevronDown'" />
    </VBtn>
  </VBtnGroup>
</template>

<style scoped>
.sort-group :deep(.v-btn) {
  border: 0;
  border-radius: 0;
}
.sort-group :deep(.v-divider) {
  opacity: 1;
  border-color: var(--line);
}
</style>

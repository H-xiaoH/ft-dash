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
  <div class="sort-group">
    <FilterMenu
      v-model="field"
      :options="options"
      :prefix="t('trades.sort')"
      :label="t('trades.sort')"
    />
    <button
      type="button"
      class="btn btn--sm btn--icon sort-group__dir"
      :aria-label="toggleLabel"
      :title="toggleLabel"
      @click="direction = nextDirection"
    >
      <AppIcon :name="direction === 'asc' ? 'chevronUp' : 'chevronDown'" />
    </button>
  </div>
</template>

<style scoped>
.sort-group {
  display: inline-flex;
}

.sort-group :deep(.filter-menu__button) {
  border-right: 0;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.sort-group__dir {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  border-left: 1px solid var(--line-strong);
}
</style>

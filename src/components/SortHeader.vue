<script setup lang="ts">
import AppIcon from './AppIcon.vue'

/** Clickable table header: the chevron only appears on the active sort column. */
const props = withDefaults(
  defineProps<{
    label: string
    active?: boolean
    dir?: 'asc' | 'desc'
  }>(),
  { active: false, dir: 'desc' },
)

const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
  <button
    type="button"
    class="sort-header"
    :aria-label="props.label"
    @click="emit('toggle')"
  >
    {{ props.label }}
    <AppIcon
      v-if="props.active"
      :name="props.dir === 'asc' ? 'chevronUp' : 'chevronDown'"
      :size="12"
    />
  </button>
</template>

<style scoped>
.sort-header {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
}

.sort-header:hover {
  color: var(--text);
}
</style>

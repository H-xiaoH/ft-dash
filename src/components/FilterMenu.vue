<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from './AppIcon.vue'

export interface FilterOption {
  value: string
  label: string
}

/** A compact dropdown: the current choice stays visible on the button. */
const props = withDefaults(
  defineProps<{
    options: FilterOption[]
    label?: string
    /** Shown before the value, e.g. "Level". */
    prefix?: string
    align?: 'start' | 'end'
    /** `text` renders as a bare header label with a hint arrow instead of a button. */
    variant?: 'button' | 'text'
  }>(),
  { label: '', prefix: '', align: 'end', variant: 'button' },
)

const model = defineModel<string>({ default: '' })
const { t } = useI18n()
const open = ref(false)
const trigger = ref<HTMLElement | null>(null)
const anchor = ref<{ top: number; left?: number; right?: number }>({ top: 0, right: 0 })

const current = computed(
  () => props.options.find((option) => option.value === model.value)?.label ?? props.options[0]?.label,
)

function choose(value: string) {
  model.value = value
  open.value = false
}

/**
 * The popup is teleported, because a scrollable table wrapper would clip it.
 * Positioning is measured from the trigger on open.
 */
async function toggle() {
  open.value = !open.value
  if (!open.value) return
  await nextTick()
  const rect = trigger.value?.getBoundingClientRect()
  if (!rect || typeof window === 'undefined') return
  const estimated = 260
  const flip = rect.bottom + estimated > window.innerHeight
  anchor.value = {
    top: flip ? rect.top - estimated : rect.bottom + 4,
    ...(props.align === 'end'
      ? { right: window.innerWidth - rect.right }
      : { left: rect.left }),
  }
}

const listStyle = computed(() => ({
  top: `${anchor.value.top}px`,
  left: anchor.value.left === undefined ? 'auto' : `${anchor.value.left}px`,
  right: anchor.value.right === undefined ? 'auto' : `${anchor.value.right}px`,
}))
</script>

<template>
  <div class="filter-menu">
    <button
      ref="trigger"
      type="button"
      :class="variant === 'text' ? 'filter-menu__text' : 'btn btn--sm filter-menu__button'"
      :aria-expanded="open"
      :aria-label="prefix ? `${prefix}: ${current}` : current"
      @click="toggle"
    >
      <span v-if="prefix" class="filter-menu__prefix">{{ prefix }}</span>
      <span>{{ current }}</span>
      <AppIcon :name="open ? 'chevronUp' : 'chevronDown'" :size="12" />
    </button>

    <Teleport to="body">
      <template v-if="open">
        <div class="filter-menu__backdrop" @click="open = false" />
        <div class="filter-menu__list" :style="listStyle" role="listbox">
          <span class="filter-menu__title">{{ label || t('common.filter') }}</span>
          <button
            v-for="option in options"
            :key="option.value"
            type="button"
            class="filter-menu__item"
            role="option"
            :aria-selected="option.value === model"
            :class="{ 'is-active': option.value === model }"
            @click="choose(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </template>
    </Teleport>
  </div>
</template>

<style scoped>
.filter-menu {
  position: relative;
  display: inline-flex;
}

.filter-menu__button {
  gap: 5px;
  height: 30px;
}

.filter-menu__prefix {
  color: var(--text-3);
}

.filter-menu__text {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.filter-menu__text:hover {
  color: var(--text);
}

.filter-menu__backdrop {
  position: fixed;
  inset: 0;
  z-index: 30;
}

.filter-menu__list {
  position: fixed;
  z-index: 31;
  min-width: 150px;
  max-height: 320px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-2);
  background: var(--ink-800);
  box-shadow: 0 12px 28px rgb(0 0 0 / 65%);
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.filter-menu__title {
  padding: 4px 8px;
  font-size: var(--fs-xs);
  color: var(--text-3);
}

.filter-menu__item {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  color: var(--text-2);
  text-align: left;
  padding: 6px 8px;
  border-radius: var(--r-1);
  cursor: pointer;
  font-size: var(--fs-base);
  white-space: nowrap;
}

.filter-menu__item:hover {
  background: var(--ink-700);
  color: var(--text);
}

.filter-menu__item.is-active {
  color: var(--accent);
}

.filter-menu__item.is-active::after {
  content: '✓';
  margin-left: auto;
}
</style>

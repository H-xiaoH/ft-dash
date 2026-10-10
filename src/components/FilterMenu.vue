<script setup lang="ts" generic="T extends string">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from './AppIcon.vue'

export interface FilterOption<T extends string = string> {
  value: T
  label: string
  /** Right-aligned supporting text, e.g. "UTC+08:00". Never searched; see `searchText`. */
  hint?: string
}

/** A compact dropdown: the current choice stays visible on the button. */
const props = withDefaults(
  defineProps<{
    options: FilterOption<T>[]
    label?: string
    /** Shown before the value, e.g. "Level". */
    prefix?: string
    /** Replaces the value on the button, e.g. an emoji where the button is self-explanatory. */
    triggerLabel?: string
    align?: 'start' | 'end'
    /** Shows a search box above the options; the list can be long (every IANA zone is). */
    searchable?: boolean
    /** Extra text a row is matched against, keyed by value. Not shown. */
    searchText?: Record<string, string>
  }>(),
  {
    label: '',
    prefix: '',
    triggerLabel: '',
    align: 'end',
    searchable: false,
    searchText: () => ({}),
  },
)

const model = defineModel<T>()
const { t } = useI18n()
const open = ref(false)
const query = ref('')
const trigger = ref<HTMLElement | null>(null)
const list = ref<HTMLElement | null>(null)
const search = ref<HTMLInputElement | null>(null)
const anchor = ref({ top: 0, left: 0 })

const visibleOptions = computed(() => {
  const term = query.value.trim().toLowerCase()
  if (!props.searchable || !term) return props.options
  return props.options.filter((option) =>
    `${option.label} ${option.value} ${props.searchText[option.value] ?? ''}`
      .toLowerCase()
      .includes(term),
  )
})

const current = computed(
  () =>
    props.options.find((option) => option.value === model.value)?.label ?? props.options[0]?.label,
)
/** Ties the listbox to its visible title, which axe requires for a named input field. */
const titleId = `filter-menu-title-${useId()}`

function choose(value: T) {
  model.value = value
  open.value = false
}

async function toggle() {
  open.value = !open.value
  if (!open.value) return
  await nextTick()
  place()
  follow()
}

// The search term is per-opening: a filter left over from last time would hide rows for no
// visible reason, since the box is gone by then.
watch(open, async (isOpen) => {
  if (!isOpen) {
    unfollow()
    query.value = ''
    return
  }
  if (!props.searchable) return
  await nextTick()
  search.value?.focus()
})

/** A term that matches nothing must not look like a broken control. */
function clearQuery() {
  query.value = ''
  search.value?.focus()
}

/**
 * Where the teleported, fixed popup goes: measured from the trigger and from the list itself.
 * Estimating either puts the panel off-screen on a phone, where the trigger can be anywhere
 * and the viewport is only a few hundred pixels wide. It also re-runs as the page moves —
 * placed once, it would hang in place while the trigger scrolled away underneath it.
 */
function place() {
  const rect = trigger.value?.getBoundingClientRect()
  const size = list.value?.getBoundingClientRect()
  if (!rect || !size || typeof window === 'undefined') return
  const margin = 8
  // Below the trigger when it fits, above it otherwise.
  const below = rect.bottom + 4
  const top =
    below + size.height <= window.innerHeight - margin
      ? below
      : Math.max(margin, rect.top - size.height - 4)
  // Aligned to the trigger's edge first, then pulled back inside the viewport.
  const aligned = props.align === 'end' ? rect.right - size.width : rect.left
  const maxLeft = Math.max(margin, window.innerWidth - size.width - margin)
  anchor.value = {
    top,
    left: Math.min(Math.max(aligned, margin), maxLeft),
  }
}

/** Scrolling the list itself must not move it. */
function onScroll(event: Event) {
  if (event.target === list.value) return
  place()
}

function follow() {
  window.addEventListener('scroll', onScroll, { capture: true, passive: true })
  window.addEventListener('resize', place)
}

function unfollow() {
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', place)
}

onBeforeUnmount(unfollow)

const listStyle = computed(() => ({ top: `${anchor.value.top}px`, left: `${anchor.value.left}px` }))
</script>

<template>
  <div class="filter-menu">
    <button
      ref="trigger"
      type="button"
      class="btn btn--sm filter-menu__button"
      :aria-expanded="open"
      :aria-label="prefix ? `${prefix}: ${current}` : current"
      @click="toggle"
    >
      <span v-if="prefix" class="filter-menu__prefix">{{ prefix }}</span>
      <span>{{ triggerLabel || current }}</span>
      <AppIcon :name="open ? 'chevronUp' : 'chevronDown'" :size="12" />
    </button>

    <Teleport to="body">
      <template v-if="open">
        <div class="filter-menu__backdrop" @click="open = false" />
        <div ref="list" class="filter-menu__list" :style="listStyle">
          <!-- The title sits outside the listbox: a listbox may only contain options. -->
          <span :id="titleId" class="filter-menu__title">{{ label || t('common.filter') }}</span>
          <!--
            The field sits outside the listbox too, but the popup has to swallow clicks on
            everything that is not the backdrop; the backdrop closes the menu.
          -->
          <div v-if="searchable" class="filter-menu__search" @click.stop>
            <AppIcon name="search" :size="13" />
            <input
              ref="search"
              v-model="query"
              class="filter-menu__input"
              type="search"
              spellcheck="false"
              :placeholder="t('common.search')"
              :aria-label="t('common.search')"
              @keydown.escape="open = false"
            />
          </div>
          <div class="filter-menu__options" role="listbox" :aria-labelledby="titleId">
            <button
              v-for="option in visibleOptions"
              :key="option.value"
              type="button"
              class="filter-menu__item"
              role="option"
              :aria-selected="option.value === model"
              :class="{ 'is-active': option.value === model }"
              @click="choose(option.value)"
            >
              <span>{{ option.label }}</span>
              <span v-if="option.hint" class="filter-menu__hint num">{{ option.hint }}</span>
            </button>
          </div>
          <!-- Not an option: an empty listbox would make a zero-match term look like a fault. -->
          <p v-if="searchable && !visibleOptions.length" class="filter-menu__empty">
            {{ t('common.noMatch') }}
            <button type="button" class="filter-menu__reset" @click="clearQuery">
              {{ t('common.clear') }}
            </button>
          </p>
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
}

.filter-menu__options {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.filter-menu__search {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 2px 0 4px;
  padding: 0 8px;
  height: 28px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-1);
  background: var(--ink-900);
  color: var(--text-3);
}

.filter-menu__search:focus-within {
  border-color: var(--accent);
}

.filter-menu__input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  padding: 0;
  font-size: var(--fs-base);
}

.filter-menu__input:focus,
.filter-menu__input:focus-visible {
  outline: none;
  box-shadow: none;
}

/* The field brings its own clear button. */
.filter-menu__input::-webkit-search-cancel-button,
.filter-menu__input::-webkit-search-decoration {
  -webkit-appearance: none;
  appearance: none;
}

.filter-menu__empty {
  margin: 2px 0 0;
  padding: 6px 8px;
  color: var(--text-3);
  font-size: var(--fs-sm);
}

.filter-menu__reset {
  border: 0;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  padding: 0 0 0 4px;
  font-size: inherit;
}

.filter-menu__reset:hover {
  text-decoration: underline;
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

.filter-menu__hint {
  margin-left: auto;
  padding-left: 14px;
  color: var(--text-3);
  font-size: var(--fs-xs);
}

/* The tick already means "current"; the hint then trails it rather than fighting for the edge. */
.filter-menu__item.is-active .filter-menu__hint {
  margin-left: 0;
}
</style>

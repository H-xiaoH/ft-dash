<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from './AppIcon.vue'

/**
 * A search affordance that stays out of the way: an icon button that expands into
 * an input on demand. Closing clears the term, so a hidden filter never lingers.
 */
const props = withDefaults(defineProps<{ placeholder?: string }>(), { placeholder: '' })
const model = defineModel<string>({ default: '' })

const { t } = useI18n()
const open = ref(false)
const input = ref<HTMLInputElement | null>(null)

function focusInput() {
  if (open.value) input.value?.focus()
}

async function expand() {
  open.value = true
  await nextTick()
  // The transition delays the input's arrival in the browser; the hook below catches that.
  focusInput()
}

function collapse() {
  open.value = false
  model.value = ''
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') collapse()
}
</script>

<template>
  <!-- Opening and closing both animate: the field slides in and back out. -->
  <Transition name="search" mode="out-in" @after-enter="focusInput">
    <button
      v-if="!open"
      key="button"
      type="button"
      class="btn btn--icon"
      :title="t('common.search')"
      :aria-label="t('common.search')"
      @click="expand"
    >
      <AppIcon name="search" />
    </button>

    <div v-else key="field" class="search-toggle">
      <AppIcon name="search" :size="14" />
      <input
        ref="input"
        v-model="model"
        class="search-toggle__input"
        type="search"
        spellcheck="false"
        :placeholder="props.placeholder"
        @keydown="onKeydown"
      />
      <button
        type="button"
        class="search-toggle__close"
        :title="t('common.clear')"
        :aria-label="t('common.clear')"
        @click="collapse"
      >
        <AppIcon name="close" :size="13" />
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.search-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 6px 0 9px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-1);
  background: var(--ink-900);
  color: var(--text-3);
}

/*
 * The field slides in and back out the same way, so closing does not look like the field
 * was cut out of the toolbar. `mode="out-in"` keeps the icon button arriving after it.
 */
.search-enter-active {
  transition:
    opacity 140ms ease-out,
    transform 140ms ease-out;
}

.search-leave-active {
  transition:
    opacity 120ms ease-in,
    transform 120ms ease-in;
}

.search-enter-from {
  opacity: 0;
  transform: translateX(8px);
}

.search-leave-to {
  opacity: 0;
  transform: translateX(8px);
}

.search-toggle:focus-within {
  border-color: var(--accent);
}

.search-toggle__input {
  border: 0;
  background: transparent;
  color: var(--text);
  width: 168px;
  min-width: 0;
  padding: 0;
  font-size: var(--fs-base);
}

.search-toggle__input:focus {
  outline: none;
}

/* The shared :focus-visible ring would draw a second border inside this field. */
.search-toggle__input:focus,
.search-toggle__input:focus-visible {
  outline: none;
  box-shadow: none;
}

/* The field brings its own clear button. */
.search-toggle__input::-webkit-search-cancel-button,
.search-toggle__input::-webkit-search-decoration {
  -webkit-appearance: none;
  appearance: none;
}

.search-toggle__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
}

.search-toggle__close:hover {
  color: var(--text);
  background: var(--ink-700);
}

@media (max-width: 720px) {
  .search-toggle__input {
    width: 108px;
  }
}
</style>

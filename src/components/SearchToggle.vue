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

async function expand() {
  open.value = true
  await nextTick()
  input.value?.focus()
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
  <button
    v-if="!open"
    type="button"
    class="btn btn--icon"
    :title="t('common.search')"
    :aria-label="t('common.search')"
    @click="expand"
  >
    <AppIcon name="search" />
  </button>

  <div v-else class="search-toggle">
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
  animation: search-in 140ms ease-out;
}

@keyframes search-in {
  from {
    opacity: 0;
    transform: translateX(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
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

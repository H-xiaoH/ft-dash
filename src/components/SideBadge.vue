<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from './AppIcon.vue'

const props = withDefaults(
  defineProps<{
    /** Freqtrade's `is_short` flag. Missing means long. */
    isShort?: boolean | null
    /** Icon only — for tables where the column header already says the direction. */
    iconOnly?: boolean
  }>(),
  { isShort: false, iconOnly: false },
)

const { t } = useI18n()
const label = computed(() => (props.isShort ? t('trades.short') : t('trades.long')))
</script>

<template>
  <span
    class="side"
    :class="isShort ? 'side--short' : 'side--long'"
    :title="label"
    :aria-label="label"
    role="img"
  >
    <AppIcon :name="isShort ? 'downRight' : 'upRight'" :size="12" />
    <span v-if="!iconOnly" class="side__label">{{ label }}</span>
  </span>
</template>

<style scoped>
.side {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  border-radius: var(--r-1);
  font-size: var(--fs-sm);
  line-height: 1.5;
  white-space: nowrap;
  flex: none;
}

.side--long {
  color: var(--long);
  border: 1px solid color-mix(in srgb, var(--long) 32%, transparent);
}

.side--short {
  color: var(--short);
  border: 1px solid color-mix(in srgb, var(--short) 32%, transparent);
}
</style>

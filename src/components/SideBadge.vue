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
  <VChip
    class="side"
    size="x-small"
    variant="outlined"
    :color="isShort ? 'error' : 'success'"
    :title="label"
    :aria-label="label"
    role="img"
  >
    <AppIcon :name="isShort ? 'downRight' : 'upRight'" :size="12" />
    <span v-if="!iconOnly" class="side__label">{{ label }}</span>
  </VChip>
</template>

<style scoped>
.side {
  flex: none;
}
.side__label {
  margin-inline-start: 3px;
}
</style>

<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'
import { computed, useId, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RATIO_BANDS, type RatioKey } from '@/lib/ratios'

const props = defineProps<{
  /** Which ratio to explain; `null` keeps the dialog closed. */
  ratio: RatioKey | null
  activator?: HTMLElement
}>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const titleId = useId()

const open = computed(() => props.ratio !== null)
// Keep the explanation mounted until the dialog's leave animation finishes.
const displayedRatio = shallowRef(props.ratio)
const title = computed(() =>
  displayedRatio.value ? t(`stats.ratios.${displayedRatio.value}.name`) : '',
)
watch(
  () => props.ratio,
  (ratio) => {
    if (ratio) displayedRatio.value = ratio
  },
  { immediate: true },
)
</script>

<template>
  <VDialog
    :activator="activator"
    :target="activator"
    :open-on-click="false"
    :model-value="open"
    max-width="480"
    :aria-labelledby="titleId"
    @update:model-value="!$event && emit('close')"
  >
    <VCard v-if="displayedRatio" class="ratios">
      <VCardItem>
        <template #title
          ><span :id="titleId" class="text-wrap">{{ title }}</span></template
        >
        <template #append>
          <VBtn variant="text" :icon="true" :aria-label="t('common.close')" @click="emit('close')"
            ><AppIcon name="close"
          /></VBtn>
        </template>
      </VCardItem>
      <VCardText class="dialog__body">
        <p>{{ t(`stats.ratios.${displayedRatio}.plain`) }}</p>
        <p class="ratios__bench">
          {{ t(`stats.ratios.${displayedRatio}.bench`, { ...RATIO_BANDS[displayedRatio] }) }}
        </p>
        <p class="ratios__caveat">{{ t('stats.ratios.caveat') }}</p>
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn color="primary" variant="flat" type="button" @click="emit('close')">
          <AppIcon name="close" />
          {{ t('common.close') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.ratios__bench {
  color: var(--text-1);
}

.dialog__body p + p {
  margin-top: var(--sp-3);
}

.ratios__caveat {
  border-top: 1px solid var(--line);
  padding-top: var(--sp-3);
  color: var(--text-2);
  font-size: var(--fs-base);
}
</style>

<script setup lang="ts">
import { useId } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from './AppIcon.vue'

const { t } = useI18n()
const titleId = useId()
const methods = ['touch', 'mouse', 'keyboard'] as const
</script>

<template>
  <VDialog max-width="480" scrollable :aria-labelledby="titleId">
    <template #activator="{ props }">
      <VBtn
        v-bind="props"
        :icon="true"
        variant="text"
        width="36"
        :aria-label="t('chart.help.title')"
        :title="t('chart.help.title')"
      >
        <AppIcon name="info" />
      </VBtn>
    </template>
    <template #default="{ isActive }">
      <VCard>
        <VCardTitle :id="titleId" tag="h2" class="text-wrap">{{
          t('chart.help.title')
        }}</VCardTitle>
        <VCardText class="d-flex flex-column ga-3">
          <section v-for="method in methods" :key="method">
            <h3 class="text-subtitle-2">{{ t(`chart.help.${method}.title`) }}</h3>
            <p>{{ t(`chart.help.${method}.body`) }}</p>
          </section>
          <p>{{ t('chart.help.controls') }}</p>
        </VCardText>
        <VCardActions>
          <VBtn color="primary" variant="flat" @click="isActive.value = false">
            <AppIcon name="close" />
            {{ t('common.close') }}
          </VBtn>
        </VCardActions>
      </VCard>
    </template>
  </VDialog>
</template>

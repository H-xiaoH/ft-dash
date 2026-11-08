<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import { SECONDARY_ROUTES } from '@/router'

const { t } = useI18n()
</script>

<template>
  <VCard tag="section" class="panel">
    <VCardTitle>{{ t('nav.more') }}</VCardTitle>
    <VList tag="nav" role="navigation" :aria-label="t('nav.more')" nav color="primary">
      <VListItem v-for="page in SECONDARY_ROUTES" :key="page.name" :to="page.path">
        <template #prepend><AppIcon :name="page.icon" class="mr-4" /></template>
        <VListItemTitle>{{ t(page.titleKey) }}</VListItemTitle>
        <template #append><AppIcon name="chevronRight" /></template>
      </VListItem>
    </VList>
  </VCard>
</template>

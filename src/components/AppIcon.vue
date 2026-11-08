<script setup lang="ts">
import { computed } from 'vue'
import { ICON_PATHS, type IconName } from './icons'
const props = withDefaults(defineProps<{ name: IconName; size?: number; title?: string }>(), {
  size: 16,
})
const path = computed(() => ICON_PATHS[props.name])
</script>

<template>
  <VIcon :icon="path" :size="size" :title="title" aria-hidden="true" />
</template>

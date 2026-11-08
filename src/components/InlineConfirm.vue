<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'
withDefaults(
  defineProps<{
    open: boolean
    message: string
    confirmLabel: string
    cancelLabel: string
    pending?: boolean
  }>(),
  { pending: false },
)

const emit = defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
  <VAlert v-if="open" type="warning" variant="tonal" role="alert">
    <p>{{ message }}</p>
    <VCardActions class="flex-wrap justify-end px-0 pb-0">
      <VBtn color="primary" variant="flat" :disabled="pending" @click="emit('confirm')">
        <AppIcon name="check" />{{ confirmLabel }}
      </VBtn>
      <VBtn variant="text" @click="emit('cancel')"><AppIcon name="close" />{{ cancelLabel }}</VBtn>
    </VCardActions>
  </VAlert>
</template>

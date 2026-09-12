<script setup>
import Icon from './Icon.vue'

defineProps({
  icon: { type: String, default: 'database' },
  title: { type: String, default: '暂无数据' },
  message: { type: String, default: '' },
})
</script>

<template>
  <div class="empty">
    <div class="empty-icon"><Icon :name="icon" :size="22" /></div>
    <div class="empty-title">{{ title }}</div>
    <p v-if="message" class="small" style="max-width: 320px">{{ message }}</p>
    <slot />
  </div>
</template>

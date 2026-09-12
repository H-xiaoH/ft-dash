<script setup>
import Icon from './Icon.vue'

const props = defineProps({
  label: { type: String, required: true },
  // Every caller passes these two, so they are required rather than defaulted.
  value: { type: [String, Number], required: true },
  icon: { type: String, required: true },
  sub: { type: String, default: '' },
  tone: { type: String, default: 'neutral' }, // neutral | profit | loss
  loading: { type: Boolean, default: false },
})
</script>

<template>
  <div class="stat" :class="tone !== 'neutral' ? `stat--${tone}` : ''">
    <div class="stat-glow" />
    <div class="stat-head">
      <span class="stat-label upper">{{ label }}</span>
      <span class="stat-icon"><Icon :name="icon" :size="15" /></span>
    </div>

    <div v-if="loading" class="skeleton" style="height: 28px; margin-top: 12px; width: 70%" />
    <div v-else class="stat-value" :class="tone === 'neutral' ? '' : tone">{{ value }}</div>

    <div class="stat-foot">
      <slot name="foot">
        <span v-if="sub" class="truncate">{{ sub }}</span>
      </slot>
    </div>
  </div>
</template>

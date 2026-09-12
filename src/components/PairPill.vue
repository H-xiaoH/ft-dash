<script setup>
import { computed } from 'vue'

const props = defineProps({
  pair: { type: String, default: '' },
})

const base = computed(() => String(props.pair || '').split('/')[0] || '—')
// Drop the settle currency: "BTC/USDT:USDT" shows as "BTC/USDT".
const quote = computed(() => String(props.pair || '').split('/')[1]?.split(':')[0] || '')
</script>

<template>
  <span class="pair-pill">
    <span class="pair-base">{{ base }}</span>
    <span v-if="quote" class="pair-quote">/{{ quote }}</span>
  </span>
</template>

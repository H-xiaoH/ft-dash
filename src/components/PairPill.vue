<script setup>
import { computed } from 'vue'
import { pairBase, pairQuote } from '@/utils/format'

const props = defineProps({
  pair: { type: String, default: '' },
  short: { type: Boolean, default: false },
})

const base = computed(() => pairBase(props.pair))
const quote = computed(() => pairQuote(props.pair))
</script>

<template>
  <span class="pair-pill">
    <span class="pair-base">{{ base }}</span>
    <span v-if="!short && quote" class="pair-quote">/{{ quote }}</span>
  </span>
</template>

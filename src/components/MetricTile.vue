<script setup lang="ts">
import { computed } from 'vue'
import { useFormat } from '@/composables/useFormat'
import { toNumber, type Numberish } from '@/lib/format'

const props = withDefaults(
  defineProps<{
    label: string
    value: Numberish
    /** How the value is rendered. `text` prints `value` verbatim. */
    kind?: 'number' | 'money' | 'percent' | 'ratio' | 'text'
    currency?: string
    digits?: number
    signed?: boolean
    tone?: 'auto' | 'none'
    sub?: string
    small?: boolean
  }>(),
  { kind: 'number', tone: 'none', signed: false, small: false },
)

defineSlots<{ default?: () => unknown }>()

const format = useFormat()

const display = computed(() => {
  const value = toNumber(props.value)
  if (props.kind === 'text') return value === null ? String(props.value ?? '—') : String(props.value)
  if (value === null) return '—'
  switch (props.kind) {
    case 'money':
      // The currency is rendered as a separate, smaller unit so it never gets clipped.
      return props.signed
        ? format.signedMoney(value, '', props.digits ?? 2)
        : format.money(value, '', props.digits ?? 2)
    case 'percent':
      return format.percent(value, props.digits ?? 2, props.signed)
    case 'ratio':
      return format.ratio(value, props.digits ?? 2)
    default:
      return format.number(value, props.digits ?? 2)
  }
})

const unit = computed(() => (props.kind === 'money' ? (props.currency ?? '') : ''))

const toneClass = computed(() =>
  props.tone === 'auto' ? format.toneClass(props.value) : '',
)
</script>

<template>
  <div class="metric">
    <span class="metric__label">{{ label }}</span>
    <span class="metric__value" :class="[toneClass, { 'metric__value--sm': small }]">
      {{ display }}
      <span v-if="unit" class="metric__unit">{{ unit }}</span>
    </span>
    <span v-if="sub" class="metric__sub">{{ sub }}</span>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useFormat } from '@/composables/useFormat'
import { toNumber, type Numberish } from '@/lib/format'

const props = withDefaults(
  defineProps<{
    label: string
    /** Leave it out when the value slot renders the figure itself. */
    value?: Numberish
    /** How the value is rendered. `text` prints `value` verbatim. */
    kind?: 'number' | 'money' | 'percent' | 'text'
    currency?: string
    digits?: number
    signed?: boolean
    /**
     * Colour of the value: `auto` follows its sign, `none` leaves it neutral, and any
     * other value is used as the utility class itself (`u-pos`, `u-neg`, `u-warn`).
     */
    tone?: string
    sub?: string
    small?: boolean
  }>(),
  { kind: 'number', tone: 'none', signed: false, small: false },
)

defineSlots<{ default?: () => unknown; value?: () => unknown }>()

const format = useFormat()

const display = computed(() => {
  const value = toNumber(props.value)
  if (props.kind === 'text') return String(props.value ?? '—')
  if (value === null) return '—'
  switch (props.kind) {
    case 'money':
      // The currency is rendered as a separate, smaller unit so it never gets clipped.
      return props.signed
        ? format.signedMoney(value, '', props.digits ?? 2)
        : format.money(value, '', props.digits ?? 2)
    case 'percent':
      return format.percent(value, props.digits ?? 2, props.signed)
    default:
      return format.number(value, props.digits ?? 2)
  }
})

const unit = computed(() => (props.kind === 'money' ? (props.currency ?? '') : ''))

const toneClass = computed(() => {
  if (props.tone === 'auto') return format.toneClass(props.value)
  return props.tone === 'none' ? '' : props.tone
})
</script>

<template>
  <div class="metric">
    <span class="metric__label">{{ label }}</span>
    <span class="metric__value" :class="[toneClass, { 'metric__value--sm': small }]">
      <!-- The value slot is for figures that need their own markup, like a win/loss pair. -->
      <slot name="value">
        {{ display }}
        <span v-if="unit" class="metric__unit">{{ unit }}</span>
      </slot>
    </span>
    <span v-if="sub" class="metric__sub">{{ sub }}</span>
    <slot />
  </div>
</template>

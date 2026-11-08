<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
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
    /** Turns the tile into a button, for figures that explain themselves when clicked. */
    interactive?: boolean
  }>(),
  { kind: 'number', tone: 'none', signed: false, small: false, interactive: false },
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
  <VCard
    :tag="interactive ? 'button' : 'div'"
    :link="interactive"
    :ripple="interactive"
    :type="interactive ? 'button' : undefined"
    class="metric w-100 h-100 text-start"
  >
    <VCardItem :subtitle="label" class="pb-0">
      <template v-if="interactive" #append><AppIcon name="info" /></template>
    </VCardItem>
    <VCardText class="pt-2">
      <div class="metric__value" :class="[toneClass, { 'metric__value--sm': small }]">
        <slot name="value"
          >{{ display }}<span v-if="unit" class="metric__unit">{{ unit }}</span></slot
        >
      </div>
    </VCardText>
    <VCardSubtitle v-if="sub" class="text-wrap pb-3">{{ sub }}</VCardSubtitle>
    <VCardText v-if="$slots.default" class="pt-0"><slot /></VCardText>
  </VCard>
</template>

<style scoped>
.metric {
  min-width: 0;
  container-type: inline-size;
}
.metric__value {
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums;
  font-size: clamp(0.9rem, 12.5cqw, 1.25rem);
  white-space: nowrap;
}
.metric__value--sm {
  font-size: var(--fs-lg);
}
.metric__unit {
  font-size: var(--fs-sm);
  color: var(--text-3);
  flex: none;
}
</style>

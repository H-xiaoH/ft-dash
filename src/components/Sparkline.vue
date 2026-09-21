<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    values: number[]
    height?: number
    tone?: 'auto' | 'good' | 'bad' | 'neutral'
    area?: boolean
  }>(),
  { height: 34, tone: 'auto', area: true },
)

const WIDTH = 100

const bounds = computed(() => {
  const values = props.values.filter((value) => Number.isFinite(value))
  if (values.length === 0) return { min: 0, max: 1 }
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) return { min: min - 1, max: max + 1 }
  return { min, max }
})

const points = computed(() => {
  const values = props.values
  if (values.length === 0) return [] as [number, number][]
  const { min, max } = bounds.value
  const span = max - min || 1
  const step = values.length > 1 ? WIDTH / (values.length - 1) : 0
  return values.map((value, index) => {
    const x = values.length > 1 ? index * step : WIDTH / 2
    const y = props.height - ((value - min) / span) * (props.height - 4) - 2
    return [Number(x.toFixed(2)), Number(y.toFixed(2))] as [number, number]
  })
})

const line = computed(() => points.value.map(([x, y]) => `${x},${y}`).join(' '))

const areaPath = computed(() => {
  if (points.value.length < 2) return ''
  const first = points.value[0]
  const last = points.value[points.value.length - 1]
  return `M${first[0]},${props.height} L${line.value.replace(/ /g, ' L')} L${last[0]},${props.height} Z`
})

const resolvedTone = computed(() => {
  if (props.tone !== 'auto') return props.tone
  const values = props.values
  if (values.length < 2) return 'neutral'
  const delta = values[values.length - 1] - values[0]
  if (delta > 0) return 'good'
  if (delta < 0) return 'bad'
  return 'neutral'
})

const stroke = computed(
  () =>
    ({
      good: 'var(--long)',
      bad: 'var(--short)',
      neutral: 'var(--text-3)',
    })[resolvedTone.value as 'good' | 'bad' | 'neutral'],
)

const fillId = `spark-${Math.random().toString(36).slice(2, 9)}`
</script>

<template>
  <svg
    class="spark"
    :viewBox="`0 0 ${WIDTH} ${height}`"
    :style="{ height: `${height}px` }"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <defs>
      <linearGradient :id="fillId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" :stop-color="stroke" stop-opacity="0.28" />
        <stop offset="100%" :stop-color="stroke" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path v-if="area && areaPath" :d="areaPath" :fill="`url(#${fillId})`" />
    <polyline
      v-if="points.length > 1"
      :points="line"
      fill="none"
      :stroke="stroke"
      stroke-width="1.5"
      stroke-linejoin="round"
      stroke-linecap="round"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>

<style scoped>
.spark {
  display: block;
  width: 100%;
  overflow: visible;
}
</style>

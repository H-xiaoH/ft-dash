<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Candle } from './charts'

const props = withDefaults(
  defineProps<{
    candles: Candle[]
    height?: number
  }>(),
  { height: 220 },
)

const host = ref<HTMLElement | null>(null)
const width = ref(600)
let observer: ResizeObserver | null = null

onMounted(() => {
  if (!host.value) return
  observer = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (entry) width.value = Math.max(240, Math.floor(entry.contentRect.width))
  })
  observer.observe(host.value)
  width.value = Math.max(240, Math.floor(host.value.clientWidth))
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

const padding = { top: 10, right: 52, bottom: 8, left: 4 }

const priceBounds = computed(() => {
  const highs = props.candles.map((candle) => candle.high)
  const lows = props.candles.map((candle) => candle.low)
  const max = highs.length ? Math.max(...highs) : 1
  const min = lows.length ? Math.min(...lows) : 0
  const pad = (max - min) * 0.06 || Math.abs(max) * 0.01 || 1
  return { min: min - pad, max: max + pad }
})

const plotHeight = computed(() => props.height - padding.top - padding.bottom)
const plotWidth = computed(() => Math.max(60, width.value - padding.left - padding.right))

function scaleY(value: number): number {
  const { min, max } = priceBounds.value
  const span = max - min || 1
  return padding.top + (1 - (value - min) / span) * plotHeight.value
}

const step = computed(() => (props.candles.length ? plotWidth.value / props.candles.length : 0))
const bodyWidth = computed(() => Math.max(1, Math.min(10, step.value * 0.62)))

const rendered = computed(() =>
  props.candles.map((candle, index) => {
    const centerX = padding.left + step.value * (index + 0.5)
    const up = candle.close >= candle.open
    const top = scaleY(Math.max(candle.open, candle.close))
    const bottom = scaleY(Math.min(candle.open, candle.close))
    return {
      key: index,
      x: centerX,
      wickTop: scaleY(candle.high),
      wickBottom: scaleY(candle.low),
      bodyY: top,
      bodyH: Math.max(1, bottom - top),
      up,
    }
  }),
)

const gridLines = computed(() => {
  const { min, max } = priceBounds.value
  const lines: { y: number; value: number }[] = []
  for (let i = 0; i <= 4; i += 1) {
    const value = min + ((max - min) * i) / 4
    lines.push({ y: scaleY(value), value })
  }
  const last = props.candles.length ? props.candles[props.candles.length - 1].close : null
  if (last === null) return lines
  // Drop the axis label that would collide with the last-price marker.
  const lastY = scaleY(last)
  return lines.filter((line) => Math.abs(line.y - lastY) > 11)
})

const lastClose = computed(() =>
  props.candles.length ? props.candles[props.candles.length - 1].close : null,
)

defineExpose({ width })
</script>

<template>
  <div ref="host" class="candles">
    <svg
      :viewBox="`0 0 ${width} ${height}`"
      :style="{ height: `${height}px` }"
      role="img"
      :aria-label="`${candles.length} candles`"
    >
      <g>
        <line
          v-for="line in gridLines"
          :key="`grid-${line.value}`"
          :x1="padding.left"
          :x2="width - padding.right"
          :y1="line.y"
          :y2="line.y"
          stroke="var(--line)"
          stroke-width="1"
        />
        <text
          v-for="line in gridLines"
          :key="`label-${line.value}`"
          :x="width - padding.right + 6"
          :y="line.y + 3"
          class="candles__axis"
        >
          {{ line.value >= 100 ? line.value.toFixed(2) : line.value.toPrecision(4) }}
        </text>
      </g>
      <g v-for="candle in rendered" :key="candle.key">
        <line
          :x1="candle.x"
          :x2="candle.x"
          :y1="candle.wickTop"
          :y2="candle.wickBottom"
          :stroke="candle.up ? 'var(--long)' : 'var(--short)'"
          stroke-width="1"
        />
        <rect
          :x="candle.x - bodyWidth / 2"
          :y="candle.bodyY"
          :width="bodyWidth"
          :height="candle.bodyH"
          :fill="candle.up ? 'var(--long)' : 'var(--short)'"
          opacity="0.9"
        />
      </g>
      <g v-if="lastClose !== null">
        <line
          :x1="padding.left"
          :x2="width - padding.right"
          :y1="scaleY(lastClose)"
          :y2="scaleY(lastClose)"
          stroke="var(--accent)"
          stroke-width="1"
          stroke-dasharray="4 3"
        />
        <text
          :x="width - padding.right + 6"
          :y="scaleY(lastClose) + 3"
          class="candles__axis candles__axis--accent"
        >
          {{ lastClose >= 100 ? lastClose.toFixed(2) : lastClose.toPrecision(4) }}
        </text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.candles {
  width: 100%;
  min-width: 0;
}

.candles svg {
  display: block;
  width: 100%;
}

.candles__axis {
  font-family: var(--font-data);
  font-size: 10px;
  fill: var(--text-3);
}

.candles__axis--accent {
  fill: var(--accent);
}
</style>

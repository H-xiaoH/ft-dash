<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Candle, CandleFormatters } from './charts'

const props = withDefaults(
  defineProps<{
    candles: Candle[]
    height?: number
    formatters: CandleFormatters
  }>(),
  { height: 260 },
)

const { t } = useI18n()

const host = ref<HTMLElement | null>(null)
const width = ref(600)
/** null means "follow the newest candle". */
const activeIndex = ref<number | null>(null)
let observer: ResizeObserver | null = null
let capturedPointer: number | null = null

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

const padding = { top: 12, right: 58, bottom: 8, left: 4 }

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
  const active = activeCandle.value
  if (!active) return lines
  // Drop the axis label that would collide with the active price marker.
  const markerY = scaleY(active.close)
  return lines.filter((line) => Math.abs(line.y - markerY) > 11)
})

const activeCandle = computed(() => {
  const list = props.candles
  if (!list.length) return null
  const index = activeIndex.value
  return index === null ? list[list.length - 1] : (list[index] ?? list[list.length - 1])
})
const isFollowingLatest = computed(() => activeIndex.value === null)

const markerY = computed(() => (activeCandle.value ? scaleY(activeCandle.value.close) : null))
const markerX = computed(() => {
  const index = activeIndex.value
  if (index === null) return null
  return padding.left + step.value * (index + 0.5)
})

/** Change against the previous close, the way an exchange readout shows it. */
const activeChange = computed(() => {
  const index = activeIndex.value ?? props.candles.length - 1
  const candle = props.candles[index]
  const previous = props.candles[index - 1]
  if (!candle) return null
  const base = previous ? previous.close : candle.open
  if (!base) return null
  return (candle.close - base) / base
})

function candleIndexAt(clientX: number): number | null {
  if (!host.value || props.candles.length === 0) return null
  const rect = host.value.getBoundingClientRect()
  const left = rect.left + padding.left
  const usable = rect.width - padding.left - padding.right
  if (usable <= 0) return null
  const ratio = (clientX - left) / usable
  if (ratio < -0.02 || ratio > 1.02) return null
  const index = Math.floor(ratio * props.candles.length)
  return Math.min(props.candles.length - 1, Math.max(0, index))
}

function capturePointer(event: PointerEvent) {
  const element = event.currentTarget as HTMLElement | null
  if (!element || typeof element.setPointerCapture !== 'function') return
  try {
    element.setPointerCapture(event.pointerId)
    capturedPointer = event.pointerId
  } catch {
    /* capture is an optimisation */
  }
}

function releasePointer(event: PointerEvent) {
  const element = event.currentTarget as HTMLElement | null
  if (capturedPointer !== event.pointerId) return
  capturedPointer = null
  if (element && typeof element.releasePointerCapture === 'function') {
    try {
      element.releasePointerCapture(event.pointerId)
    } catch {
      /* already released */
    }
  }
}

function onPointerDown(event: PointerEvent) {
  const index = candleIndexAt(event.clientX)
  if (index === null) {
    activeIndex.value = null
    return
  }
  activeIndex.value = index
  capturePointer(event)
}

function onPointerMove(event: PointerEvent) {
  if (event.pointerType !== 'mouse' && capturedPointer !== event.pointerId) return
  const index = candleIndexAt(event.clientX)
  if (index !== null) activeIndex.value = index
}

function onPointerUp(event: PointerEvent) {
  releasePointer(event)
}

function onPointerCancel(event: PointerEvent) {
  releasePointer(event)
  activeIndex.value = null
}

function onPointerLeave(event: PointerEvent) {
  if (event.pointerType === 'mouse') activeIndex.value = null
}

function onKeydown(event: KeyboardEvent) {
  const last = props.candles.length - 1
  if (last < 0) return
  if (event.key === 'Escape') {
    activeIndex.value = null
    return
  }
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  const stepDir = event.key === 'ArrowRight' ? 1 : -1
  const current = activeIndex.value ?? last
  activeIndex.value = Math.min(last, Math.max(0, current + stepDir))
}
</script>

<template>
  <div ref="host" class="candles">
    <svg
      :viewBox="`0 0 ${width} ${height}`"
      :style="{ height: `${height}px` }"
      tabindex="0"
      role="img"
      :aria-label="t('market.candleChart')"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @pointerleave="onPointerLeave"
      @keydown="onKeydown"
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

      <g v-if="markerY !== null">
        <line
          v-if="markerX !== null"
          :x1="markerX"
          :x2="markerX"
          :y1="padding.top"
          :y2="height - padding.bottom"
          stroke="var(--line-strong)"
          stroke-width="1"
          stroke-dasharray="3 3"
        />
        <line
          :x1="padding.left"
          :x2="width - padding.right"
          :y1="markerY"
          :y2="markerY"
          stroke="var(--text-3)"
          stroke-width="1"
          stroke-dasharray="4 3"
        />
        <text
          :x="width - padding.right + 6"
          :y="markerY + 3"
          class="candles__axis candles__axis--accent"
        >
          {{ formatters.price(activeCandle?.close ?? 0) }}
        </text>
      </g>
    </svg>

    <div v-if="activeCandle" class="candles__readout">
      <span class="candles__time num">
        {{ formatters.time?.(activeCandle.time ?? null) ?? '' }}
        <span v-if="isFollowingLatest" class="candles__badge">{{ t('chart.latest') }}</span>
      </span>
      <dl class="candles__grid">
        <div>
          <dt>{{ t('chart.open') }}</dt>
          <dd class="num">{{ formatters.price(activeCandle.open) }}</dd>
        </div>
        <div>
          <dt>{{ t('chart.high') }}</dt>
          <dd class="num">{{ formatters.price(activeCandle.high) }}</dd>
        </div>
        <div>
          <dt>{{ t('chart.low') }}</dt>
          <dd class="num">{{ formatters.price(activeCandle.low) }}</dd>
        </div>
        <div>
          <dt>{{ t('chart.close') }}</dt>
          <dd class="num">{{ formatters.price(activeCandle.close) }}</dd>
        </div>
        <div v-if="activeChange !== null">
          <dt>{{ t('chart.change') }}</dt>
          <dd class="num" :class="activeChange >= 0 ? 'u-pos' : 'u-neg'">
            {{ formatters.change?.(activeChange) ?? '' }}
          </dd>
        </div>
        <div v-if="activeCandle.volume !== null && activeCandle.volume !== undefined">
          <dt>{{ t('chart.volume') }}</dt>
          <dd class="num">{{ formatters.volume?.(activeCandle.volume) ?? '' }}</dd>
        </div>
      </dl>
    </div>
  </div>
</template>

<style scoped>
.candles {
  position: relative;
  width: 100%;
  min-width: 0;
}

.candles svg {
  display: block;
  width: 100%;
  touch-action: pan-y;
  cursor: crosshair;
  outline-offset: 2px;
}

.candles svg:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 40%, transparent);
}

.candles__axis {
  font-family: var(--font-data);
  font-size: 10px;
  fill: var(--text-3);
}

.candles__axis--accent {
  fill: var(--accent);
}

.candles__readout {
  position: absolute;
  top: 6px;
  left: 6px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 6px 8px;
  border: 1px solid var(--line);
  border-radius: var(--r-1);
  background: color-mix(in srgb, var(--ink-850) 88%, transparent);
  backdrop-filter: blur(3px);
  pointer-events: none;
}

.candles__time {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-xs);
  color: var(--text-2);
}

.candles__badge {
  padding: 0 5px;
  border-radius: var(--r-1);
  border: 1px solid var(--line-strong);
  color: var(--text-2);
  font-size: 10px;
}

.candles__grid {
  display: grid;
  grid-template-columns: auto auto;
  gap: 1px 10px;
  margin: 0;
  font-size: var(--fs-xs);
}

.candles__grid > div {
  display: flex;
  gap: 5px;
  align-items: baseline;
}

.candles__grid dt {
  color: var(--text-3);
  min-width: 14px;
}

.candles__grid dd {
  margin: 0;
  color: var(--text);
}
</style>

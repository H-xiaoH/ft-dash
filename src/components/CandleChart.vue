<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CandleMark } from '@/lib/candles'
import type { Candle, CandleEntry, CandleFormatters } from './charts'

const props = withDefaults(
  defineProps<{
    candles: Candle[]
    /** Cost basis of the open position on this pair, if any. */
    entry?: CandleEntry | null
    /** Entries and exits to mark: the strategy's signals, and the bot's own fills. */
    marks?: CandleMark[]
    height?: number
    formatters: CandleFormatters
  }>(),
  { height: 260, entry: null, marks: () => [] },
)

const { t } = useI18n()

const host = ref<HTMLElement | null>(null)
const width = ref(600)
/** null means "follow the newest candle". */
const activeIndex = ref<number | null>(null)
let observer: ResizeObserver | null = null
const pointers = new Map<number, { x: number; y: number }>()
let dragRemainder = 0

const range = ref<{ start: number; count: number; anchor: Candle['time']; follow: boolean } | null>(
  null,
)
const count = computed(() => Math.min(range.value?.count ?? Infinity, props.candles.length))
const maxStart = computed(() => props.candles.length - count.value)
const start = computed(() => {
  const window = range.value
  if (!window) return 0
  if (window.follow) return maxStart.value
  if (window.anchor == null) return Math.min(window.start, maxStart.value)
  const index = props.candles.findIndex((candle) => candle.time === window.anchor)
  return Math.min(Math.max(0, index), maxStart.value)
})
const thumbWidth = computed(() => `${(count.value / (props.candles.length || 1)) * 100}%`)
const visible = computed(() => props.candles.slice(start.value, start.value + count.value))
const visibleMarks = computed(() =>
  props.marks.filter((mark) => mark.index >= start.value && mark.index < start.value + count.value),
)

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

/* Top and bottom leave room for the signal triangles that hang off the outermost candle. */
const padding = { top: 18, right: 58, bottom: 16, left: 4 }

const priceClipId = useId()
const priceScale = ref(1)
let axisDrag: { id: number; y: number; scale: number } | null = null

const autoPriceBounds = computed(() => {
  /*
   * Entry prices join the range: a position whose price has moved away is exactly when the
   * line matters, and it would otherwise sit off-screen.
   */
  const values = [
    ...visible.value.map((candle) => candle.high),
    ...visible.value.map((candle) => candle.low),
    ...(validEntry.value ? [validEntry.value.price] : []),
    // A fill sits at the price it traded at, which can be away from the candles around it.
    ...visibleMarks.value
      .filter((mark) => mark.kind === 'fill' && Number.isFinite(mark.price))
      .map((mark) => Number(mark.price)),
  ]
  const max = values.length ? Math.max(...values) : 1
  const min = values.length ? Math.min(...values) : 0
  const pad = (max - min) * 0.06 || Math.abs(max) * 0.01 || 1
  return { min: min - pad, max: max + pad }
})

const priceBounds = computed(() => {
  const { min, max } = autoPriceBounds.value
  const center = min + (max - min) / 2
  const radius = ((max - min) * priceScale.value) / 2
  return priceScale.value === 1 ? { min, max } : { min: center - radius, max: center + radius }
})

function scalePrice(value: number) {
  priceScale.value = Math.max(0.1, Math.min(10, value))
}

function resetPriceFromKeyboard(event: MouseEvent) {
  if (event.detail === 0) priceScale.value = 1
}

function startPriceDrag(event: PointerEvent) {
  if (event.button !== 0 || axisDrag) return
  axisDrag = { id: event.pointerId, y: event.clientY, scale: priceScale.value }
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
}

function movePriceDrag(event: PointerEvent) {
  if (axisDrag?.id !== event.pointerId) return
  scalePrice(axisDrag.scale * Math.exp((event.clientY - axisDrag.y) / plotHeight.value))
}

function endPriceDrag(event: PointerEvent) {
  if (axisDrag?.id === event.pointerId) axisDrag = null
}

const validEntry = computed(() => {
  const entry = props.entry
  return entry && Number.isFinite(entry.price) && entry.price > 0 ? entry : null
})

const plotHeight = computed(() => props.height - padding.top - padding.bottom)
const plotWidth = computed(() => Math.max(60, width.value - padding.left - padding.right))

function scaleY(value: number): number {
  const { min, max } = priceBounds.value
  const span = max - min || 1
  return padding.top + (1 - (value - min) / span) * plotHeight.value
}

const step = computed(() => (count.value ? plotWidth.value / count.value : 0))
const bodyWidth = computed(() => Math.max(1, Math.min(range.value ? 28 : 10, step.value * 0.62)))

const rendered = computed(() =>
  visible.value.map((candle, index) => {
    const centerX = padding.left + step.value * (index + 0.5)
    const up = candle.close >= candle.open
    const top = scaleY(Math.max(candle.open, candle.close))
    const bottom = scaleY(Math.min(candle.open, candle.close))
    return {
      key: start.value + index,
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
  // Drop the axis labels that would print under the price markers already in the gutter:
  // the scrubbed candle's close, and the position's P&L tag.
  const occupied = [markerY.value, entryLine.value?.y].filter(
    (y): y is number => typeof y === 'number',
  )
  return lines.filter((line) => occupied.every((y) => Math.abs(line.y - y) > 11))
})

const activeCandle = computed(() => {
  const list = visible.value
  if (!list.length) return null
  const index = activeIndex.value
  return index === null ? list[list.length - 1] : (list[index] ?? list[list.length - 1])
})
const isFollowingLatest = computed(
  () => activeIndex.value === null && start.value + count.value === props.candles.length,
)

function visiblePriceY(value: number): number | null {
  const y = scaleY(value)
  if (priceScale.value === 1) return y
  return y >= padding.top && y <= props.height - padding.bottom ? y : null
}

const markerY = computed(() =>
  activeCandle.value ? visiblePriceY(activeCandle.value.close) : null,
)
const markerX = computed(() => {
  const index = activeIndex.value
  if (index === null) return null
  return padding.left + step.value * (index + 0.5)
})

/** Profit is green, loss is red, and an unknown P&L stays neutral. */
function toneColor(tone: CandleEntry['tone']): string {
  if (tone === 'good') return 'var(--long)'
  if (tone === 'bad') return 'var(--short)'
  return 'var(--text-3)'
}

const entryLine = computed(() => {
  const entry = validEntry.value
  if (!entry) return null
  const y = visiblePriceY(entry.price)
  return y === null ? null : { y, ...entry, color: toneColor(entry.tone) }
})

/**
 * The triangles drawn on the candles. A signal rides against its candle — up under the low
 * for a buy, down over the high for a sell — while a fill points right, at the price it
 * actually traded at, just left of its candle. They shrink with the candles, so a dense chart
 * does not turn into a wall of triangles.
 */
const markShapes = computed(() => {
  const size = Math.max(2.5, Math.min(5, step.value * 0.5))
  return visibleMarks.value.flatMap((mark, at) => {
    const candle = rendered.value[mark.index - start.value]
    if (!candle) return []
    const colour = mark.side === 'buy' ? 'var(--long)' : 'var(--short)'
    let points: string
    if (mark.kind === 'fill') {
      if (!Number.isFinite(mark.price)) return []
      const tipX = candle.x - bodyWidth.value / 2 - 2
      const y = scaleY(Number(mark.price))
      points = `${tipX},${y} ${tipX - size * 1.6},${y - size} ${tipX - size * 1.6},${y + size}`
    } else {
      const y = mark.side === 'buy' ? candle.wickBottom + size + 1 : candle.wickTop - size - 1
      const wing = mark.side === 'buy' ? size * 1.4 : -size * 1.4
      points = `${candle.x},${y} ${candle.x - size},${y + wing} ${candle.x + size},${y + wing}`
    }
    return [
      {
        key: `${mark.kind}-${mark.side}-${mark.index}-${at}`,
        kind: mark.kind,
        side: mark.side,
        points,
        colour,
        label: markLabel(mark),
      },
    ]
  })
})

/** What a mark says when the pointer rests on it, and to a screen reader. */
function markLabel(mark: CandleMark): string {
  if (mark.kind === 'fill') return t(mark.side === 'buy' ? 'market.buyFill' : 'market.sellFill')
  return t(mark.side === 'buy' ? 'market.buySignals' : 'market.sellSignals')
}

/** Change against the previous close, the way an exchange readout shows it. */
const activeChange = computed(() => {
  const index = start.value + (activeIndex.value ?? count.value - 1)
  const candle = props.candles[index]
  const previous = props.candles[index - 1]
  if (!candle) return null
  const base = previous ? previous.close : candle.open
  if (!base) return null
  return (candle.close - base) / base
})

function plotRatio(clientX: number): number {
  const rect = host.value?.getBoundingClientRect()
  if (!rect || rect.width <= padding.left + padding.right) return 0.5
  return (clientX - rect.left - padding.left) / (rect.width - padding.left - padding.right)
}

function scrub(clientX: number) {
  const ratio = plotRatio(clientX)
  if (ratio < 0 || ratio > 1 || !count.value) return
  activeIndex.value = Math.min(count.value - 1, Math.floor(ratio * count.value))
}

function setRange(first: number, size: number) {
  const total = props.candles.length
  const bounded = Math.min(total - size, Math.max(0, Math.round(first)))

  range.value =
    size === total
      ? null
      : {
          start: bounded,
          count: size,
          anchor: props.candles[bounded]?.time ?? null,
          follow: bounded === total - size,
        }
  activeIndex.value = null
}

function zoom(factor: number, from: number, to = from) {
  const total = props.candles.length
  if (!total) return
  const size = Math.min(total, Math.max(Math.min(8, total), Math.round(count.value * factor)))
  setRange(start.value + from * count.value - to * size, size)
}

function onWheel(event: WheelEvent) {
  const ratio = plotRatio(event.clientX)
  if (ratio < 0 || ratio > 1 || event.deltaY === 0 || event.ctrlKey) return
  event.preventDefault()
  zoom(event.deltaY < 0 ? 0.85 : 1 / 0.85, ratio)
}

function onRangeInput(event: Event) {
  setRange((event.target as HTMLInputElement).valueAsNumber, count.value)
}

function resetZoom() {
  setRange(0, props.candles.length)
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0 || pointers.size >= 2) return
  const ratio = plotRatio(event.clientX)
  if (ratio < 0 || ratio > 1) return
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  dragRemainder = 0
  ;(event.currentTarget as SVGElement).setPointerCapture?.(event.pointerId)
  if (pointers.size === 1) scrub(event.clientX)
}

function onPointerMove(event: PointerEvent) {
  const previous = pointers.get(event.pointerId)
  if (!previous) {
    if (event.pointerType === 'mouse') scrub(event.clientX)
    return
  }
  const x = event.clientX
  const y = event.clientY
  if (pointers.size === 2) {
    const other = [...pointers].find(([id]) => id !== event.pointerId)?.[1]
    if (!other) return
    const before = Math.hypot(previous.x - other.x, previous.y - other.y)
    const after = Math.hypot(x - other.x, y - other.y)
    if (before < 4 || after < 4) return
    // Keep the last applied positions so small pinch movements can accumulate.
    const nextCount = Math.round(count.value * (before / after))
    if (nextCount === count.value) return
    zoom(before / after, plotRatio((previous.x + other.x) / 2), plotRatio((x + other.x) / 2))
  } else if (range.value) {
    dragRemainder += (plotRatio(previous.x) - plotRatio(x)) * count.value
    const shift = Math.trunc(dragRemainder)
    if (shift) {
      setRange(start.value + shift, count.value)
      dragRemainder -= shift
    }
  } else {
    scrub(x)
  }
  pointers.set(event.pointerId, { x, y })
}

function onPointerEnd(event: PointerEvent) {
  pointers.delete(event.pointerId)
  if (event.type === 'pointercancel') activeIndex.value = null
}

function onPointerLeave(event: PointerEvent) {
  if (event.pointerType === 'mouse' && !pointers.has(event.pointerId)) activeIndex.value = null
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Home' || event.key === '+' || event.key === '=' || event.key === '-') {
    event.preventDefault()
    if (event.key === 'Home') resetZoom()
    else zoom(event.key === '-' ? 1 / 0.85 : 0.85, 0.5)
    return
  }
  const last = count.value - 1
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
  <!-- `data-scrub` tells the shell this region owns sideways drags. -->
  <div ref="host" class="candles" data-scrub>
    <svg
      :viewBox="`0 0 ${width} ${height}`"
      :style="{ height: `${height}px` }"
      tabindex="0"
      role="img"
      :aria-label="t('market.candleChart')"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerEnd"
      @pointercancel="onPointerEnd"
      @lostpointercapture="onPointerEnd"
      @wheel="onWheel"
      @dblclick="resetZoom"
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

      <g :clip-path="priceScale === 1 ? undefined : `url(#${priceClipId})`">
        <g v-for="candle in rendered" :key="candle.key" class="candles__candle">
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

        <g class="candles__marks">
          <polygon
            v-for="shape in markShapes"
            :key="shape.key"
            :points="shape.points"
            :fill="shape.colour"
            :data-kind="shape.kind"
            :data-side="shape.side"
          >
            <title>{{ shape.label }}</title>
          </polygon>
        </g>
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

      <g v-if="entryLine" class="candles__entry">
        <line
          :x1="padding.left"
          :x2="width - padding.right"
          :y1="entryLine.y"
          :y2="entryLine.y"
          :stroke="entryLine.color"
          stroke-width="1"
          stroke-dasharray="6 3"
        />
        <text
          v-if="entryLine.label"
          :x="width - 2"
          :y="entryLine.y + 3.5"
          class="candles__entry-label"
          :class="`candles__entry-label--${entryLine.tone}`"
        >
          {{ entryLine.label }}
        </text>
      </g>
      <defs>
        <clipPath :id="priceClipId">
          <rect :x="padding.left" :y="padding.top" :width="plotWidth" :height="plotHeight" />
        </clipPath>
      </defs>
    </svg>
    <button
      type="button"
      class="candles__price-axis"
      :style="{ height: `${height}px` }"
      :aria-label="t('market.priceScale')"
      :title="t('market.priceScale')"
      @pointerdown="startPriceDrag"
      @pointermove="movePriceDrag"
      @pointerup="endPriceDrag"
      @pointercancel="endPriceDrag"
      @lostpointercapture="endPriceDrag"
      @dblclick="priceScale = 1"
      @click="resetPriceFromKeyboard"
      @keydown.up.prevent="scalePrice(priceScale * 0.85)"
      @keydown.down.prevent="scalePrice(priceScale / 0.85)"
      @keydown.home.prevent="priceScale = 1"
    />
    <input
      class="candles__range"
      type="range"
      min="0"
      :max="maxStart"
      :value="start"
      :disabled="maxStart === 0"
      :aria-label="t('market.candleRange')"
      :style="{ '--thumb-width': thumbWidth }"
      @input="onRangeInput"
    />

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
  touch-action: none;
  cursor: crosshair;
  outline-offset: 2px;
}

.candles__price-axis {
  position: absolute;
  inset: 0 0 auto auto;
  width: 58px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: ns-resize;
  touch-action: none;
}

.candles__range {
  appearance: none;
  display: block;
  width: calc(100% - 62px);
  height: 20px;
  margin: 0 58px 0 4px;
  background: transparent;
  cursor: ew-resize;
}

.candles__range:disabled {
  cursor: default;
  opacity: 0.5;
}

.candles__range::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 3px;
  background: var(--line);
}

.candles__range::-moz-range-track {
  height: 6px;
  border-radius: 3px;
  background: var(--line);
}

.candles__range::-webkit-slider-thumb {
  appearance: none;
  width: clamp(16px, var(--thumb-width), 100%);
  height: 6px;
  border-radius: 3px;
  background: var(--text-3);
}

.candles__range::-moz-range-thumb {
  width: clamp(16px, var(--thumb-width), 100%);
  height: 6px;
  border: 0;
  border-radius: 3px;
  background: var(--text-3);
}

.candles svg:focus-visible {
  box-shadow: 0 0 0 2px rgb(232 234 237 / 40%);
}

@supports (color: color-mix(in srgb, black, white)) {
  .candles svg:focus-visible {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 40%, transparent);
  }
}

.candles__axis {
  font-family: var(--font-data);
  font-size: 10px;
  fill: var(--text-3);
}

.candles__axis--accent {
  fill: var(--accent);
}

/*
 * The P&L tag lives in the right gutter, tucked against the edge and growing leftwards, so
 * it never covers candles. It is styled entirely here rather than via `.candles__axis`:
 * a CSS declaration beats an SVG presentation attribute, and the shared axis rule was
 * quietly overriding the per-tone `fill` attribute. The tone is carried by the text
 * colour, over a 1px outline that keeps it readable against candles behind it.
 */
.candles__entry-label {
  font-family: var(--font-data);
  font-size: 10px;
  text-anchor: end;
  paint-order: stroke fill;
  /* Hairline outline only: a 1px stroke cannot carry a filled block, so the tone is the
     text itself. */
  stroke: var(--ink-900);
  stroke-width: 1px;
  stroke-linejoin: round;
}

.candles__entry-label--good {
  fill: var(--long);
}

.candles__entry-label--bad {
  fill: var(--short);
}

.candles__entry-label--flat {
  fill: var(--text-3);
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
  background: rgb(15 15 15 / 88%);
  -webkit-backdrop-filter: blur(3px);
  backdrop-filter: blur(3px);
  pointer-events: none;
}

@supports (color: color-mix(in srgb, black, white)) {
  .candles__readout {
    background: color-mix(in srgb, var(--ink-850) 88%, transparent);
  }
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

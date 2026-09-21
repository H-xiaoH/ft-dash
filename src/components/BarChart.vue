<script setup lang="ts">
import { computed, ref } from 'vue'
import { niceTicks, signedDomain, valueToPercent } from '@/lib/scale'
import type { BarItem } from './charts'

const props = withDefaults(
  defineProps<{
    items: BarItem[]
    height?: number
    maxLabels?: number
    /** Currency or unit shown above the value axis. */
    unit?: string
    /** Formats axis ticks; defaults to a plain number. */
    axisFormat?: (value: number) => string
  }>(),
  { height: 176, maxLabels: 6, unit: '' },
)

const activeIndex = ref<number | null>(null)

const domain = computed(() => signedDomain(props.items.map((item) => item.value)))
const zeroPercent = computed(() => valueToPercent(0, domain.value.min, domain.value.max))

const tickMarks = computed(() =>
  niceTicks(domain.value.min, domain.value.max, 4).map((value) => ({
    value,
    top: valueToPercent(value, domain.value.min, domain.value.max),
    label: props.axisFormat ? props.axisFormat(value) : String(value),
    isZero: Math.abs(value) < 1e-9,
  })),
)

const slotPercent = computed(() => (props.items.length ? 100 / props.items.length : 100))
const barWidthPercent = computed(() => slotPercent.value * 0.62)

interface Bar {
  index: number
  item: BarItem
  left: number
  width: number
  top: number
  height: number
  positive: boolean
}

const bars = computed<Bar[]>(() =>
  props.items.map((item, index) => {
    const valuePercent = valueToPercent(item.value, domain.value.min, domain.value.max)
    return {
      index,
      item,
      left: slotPercent.value * (index + 0.5) - barWidthPercent.value / 2,
      width: barWidthPercent.value,
      top: Math.min(valuePercent, zeroPercent.value),
      // A flat day still shows a nub so the series reads as intentional.
      height: Math.max(0.8, Math.abs(valuePercent - zeroPercent.value)),
      positive: item.value >= 0,
    }
  }),
)

const activeBar = computed(() => (activeIndex.value === null ? null : bars.value[activeIndex.value]))

/** Keeps the tooltip inside the plot when the active bar sits near an edge. */
const tooltipStyle = computed(() => {
  const bar = activeBar.value
  if (!bar) return {}
  const center = bar.left + bar.width / 2
  if (center < 18) return { left: '0%' }
  if (center > 82) return { left: '100%', transform: 'translateX(-100%)' }
  return { left: `${center}%`, transform: 'translateX(-50%)' }
})

const labelStep = computed(() =>
  Math.max(1, Math.ceil(props.items.length / Math.max(2, props.maxLabels))),
)

const visibleLabels = computed(() =>
  bars.value.filter((bar) => bar.index % labelStep.value === 0),
)

function select(index: number | null) {
  activeIndex.value = index
}

function onBackgroundPointer(event: PointerEvent) {
  // Only a tap on empty plot space clears; taps on a bar are handled by the bar.
  if (event.target === event.currentTarget) select(null)
}

function onPointerLeave(event: PointerEvent) {
  // Touch fires pointerleave when the finger lifts; that must not dismiss the tooltip.
  if (event.pointerType === 'mouse') select(null)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    select(null)
    return
  }
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  const step = event.key === 'ArrowRight' ? 1 : -1
  const current = activeIndex.value ?? (step > 0 ? -1 : 0)
  select(Math.min(props.items.length - 1, Math.max(0, current + step)))
}
</script>

<template>
  <div class="chart" :style="{ '--chart-height': `${height}px` }">
    <div
      class="chart__plot"
      tabindex="0"
      role="img"
      :aria-label="unit ? `Bar chart in ${unit}` : 'Bar chart'"
      @pointerleave="onPointerLeave"
      @keydown="onKeydown"
    >
      <div class="chart__grid" aria-hidden="true">
        <div
          v-for="tick in tickMarks"
          :key="`tick-${tick.value}`"
          class="chart__tick"
          :class="{ 'chart__tick--zero': tick.isZero }"
          :style="{ top: `${tick.top}%` }"
        >
          <span class="chart__tick-label num">{{ tick.label }}</span>
        </div>
        <span v-if="unit" class="chart__unit num">{{ unit }}</span>
      </div>

      <div class="chart__bars" @pointerdown="onBackgroundPointer">
        <div
          v-for="bar in bars"
          :key="`hit-${bar.index}`"
          class="chart__hit"
          :style="{ left: `${bar.left - (slotPercent - bar.width) / 2}%`, width: `${slotPercent}%` }"
          @pointerenter="select(bar.index)"
          @pointerdown.stop="select(bar.index)"
        />
        <div
          v-for="bar in bars"
          :key="`bar-${bar.index}`"
          class="chart__bar"
          :class="[
            bar.positive ? 'chart__bar--up' : 'chart__bar--down',
            { 'is-active': activeIndex === bar.index },
          ]"
          :style="{
            left: `${bar.left}%`,
            width: `${bar.width}%`,
            top: `${bar.top}%`,
            height: `${bar.height}%`,
          }"
        />
      </div>

      <div
        v-if="activeBar"
        class="chart__tooltip"
        :style="tooltipStyle"
        role="status"
        aria-live="polite"
      >
        <span v-if="activeBar.item.tooltip" class="chart__tooltip-title">
          {{ activeBar.item.tooltip }}
        </span>
        <span class="chart__tooltip-value num">{{ activeBar.item.display }}</span>
        <span v-if="activeBar.item.sub" class="chart__tooltip-sub num muted">
          {{ activeBar.item.sub }}
        </span>
      </div>
    </div>

    <div class="chart__labels" aria-hidden="true">
      <span v-for="bar in visibleLabels" :key="`label-${bar.index}`" class="chart__label">
        {{ bar.item.label }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.chart {
  --axis-gutter: 62px;
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}

.chart__plot {
  position: relative;
  height: var(--chart-height);
  border-radius: var(--r-1);
  outline-offset: 2px;
}

/* A whole-chart focus ring should read as a hint, not a warning. */
.chart__plot:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 40%, transparent);
}

.chart__grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.chart__tick {
  position: absolute;
  left: 0;
  right: 0;
  border-top: 1px dashed color-mix(in srgb, var(--line) 70%, transparent);
}

.chart__tick--zero {
  border-top: 1px solid var(--line-strong);
}

.chart__tick-label {
  position: absolute;
  right: 0;
  top: -0.8em;
  padding: 0 2px;
  font-size: var(--fs-xs);
  color: var(--text-3);
  background: var(--ink-850);
}

.chart__unit {
  position: absolute;
  right: 0;
  top: -1.35em;
  font-size: var(--fs-xs);
  color: var(--text-3);
}

.chart__bars {
  position: absolute;
  inset: 0 var(--axis-gutter) 0 0;
}

.chart__hit {
  position: absolute;
  top: 0;
  bottom: 0;
  background: transparent;
  cursor: pointer;
  touch-action: manipulation;
}

.chart__bar {
  position: absolute;
  border-radius: 2px;
  pointer-events: none;
  transition:
    opacity 120ms ease,
    filter 120ms ease;
}

.chart__bar--up {
  background: var(--long);
  opacity: 0.85;
}

.chart__bar--down {
  background: var(--short);
  opacity: 0.85;
}

.chart__bar.is-active {
  opacity: 1;
  filter: brightness(1.15);
}

.chart__tooltip {
  position: absolute;
  top: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-width: 190px;
  padding: 6px 9px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-1);
  background: var(--ink-700);
  box-shadow: 0 8px 20px rgb(0 0 0 / 45%);
  pointer-events: none;
}

.chart__tooltip-title {
  font-size: var(--fs-sm);
  color: var(--text-2);
}

.chart__tooltip-value {
  font-size: var(--fs-md);
}

.chart__tooltip-sub {
  font-size: var(--fs-xs);
}

.chart__labels {
  display: flex;
  justify-content: space-between;
  gap: var(--sp-2);
  padding-right: var(--axis-gutter);
  flex: none;
}

.chart__label {
  font-size: var(--fs-xs);
  line-height: 1.4;
  color: var(--text-3);
  font-family: var(--font-data);
  white-space: nowrap;
}
</style>

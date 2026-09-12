<script setup>
import { computed } from 'vue'
import { useSliceSelection } from '@/composables/useChartPointer'
import EmptyState from '../EmptyState.vue'

const props = defineProps({
  /** `[{ label, value, color }]` */
  segments: { type: Array, default: () => [] },
  size: { type: Number, default: 168 },
  thickness: { type: Number, default: 18 },
  centerValue: { type: String, default: '' },
  centerLabel: { type: String, default: '' },
  format: { type: Function, default: (v) => String(v) },
})

const total = computed(() =>
  (props.segments || []).reduce((sum, segment) => sum + (Number(segment.value) || 0), 0),
)

/** Hover widens the stroke, so the radius has to reserve room for the widest state. */
const HOVER_GROW = 4
const maxStroke = computed(() => Number(props.thickness) + HOVER_GROW)

/**
 * The viewBox is 100x100 and an SVG stroke straddles its path, so the ring
 * occupies `radius +/- strokeWidth / 2`. Anything above 50 gets clipped flat by
 * the viewport - derive the radius instead of hard-coding it.
 */
const radius = computed(() => 50 - maxStroke.value / 2 - 1)
const circumference = computed(() => 2 * Math.PI * radius.value)

const arcs = computed(() => {
  if (!total.value) return []
  const c = circumference.value
  let offset = 0
  return (props.segments || [])
    .map((segment, index) => {
      const value = Number(segment.value) || 0
      const fraction = value / total.value
      const arc = {
        index,
        label: segment.label,
        value,
        color: segment.color || 'var(--accent)',
        fraction,
        dash: `${Math.max(0, fraction * c - 2)} ${c}`,
        offset: -offset * c,
      }
      offset += fraction
      return arc
    })
    .filter((arc) => arc.fraction > 0)
})

const active = computed(
  () => arcs.value.find((arc) => arc.index === activeIndex.value) || null,
)

/*
 * Selection lives in a composable so the mouse-vs-touch behaviour is unit tested;
 * getting that wrong is invisible in the source and only shows up on a real phone.
 */
const { activeIndex, toggle, preview, clearOnLeave, clear } = useSliceSelection()
</script>

<template>
  <div class="row" style="gap: 20px; flex-wrap: wrap; align-items: center">
    <EmptyState v-if="!total" icon="pie" title="暂无数据" style="flex: 1" />

    <template v-else>
      <div :style="{ position: 'relative', width: `${size}px`, height: `${size}px`, flex: 'none' }">
        <svg
          viewBox="0 0 100 100"
          :width="size"
          :height="size"
          class="donut-svg"
          style="display: block; transform: rotate(-90deg)"
        >
          <!-- Tapping the hole or outside the ring dismisses the selection. -->
          <circle cx="50" cy="50" r="50" fill="transparent" @click="clear()" />
          <circle
            cx="50"
            cy="50"
            :r="radius"
            fill="none"
            stroke="var(--surface-3)"
            :stroke-width="thickness"
          />
          <circle
            v-for="arc in arcs"
            :key="arc.index"
            cx="50"
            cy="50"
            :r="radius"
            fill="none"
            :stroke="arc.color"
            :stroke-width="activeIndex === arc.index ? maxStroke : thickness"
            :stroke-dasharray="arc.dash"
            :stroke-dashoffset="arc.offset"
            stroke-linecap="butt"
            style="transition: stroke-width 160ms var(--ease), opacity 160ms var(--ease)"
            :opacity="activeIndex === -1 || activeIndex === arc.index ? 1 : 0.42"
            @click="toggle(arc.index)"
            @pointerenter="preview(arc.index, $event)"
            @pointerleave="clearOnLeave($event)"
          />
        </svg>

        <div
          style="
            position: absolute;
            inset: 0;
            display: grid;
            place-content: center;
            text-align: center;
            pointer-events: none;
          "
        >
          <div class="mono strong" style="font-size: 20px; letter-spacing: -0.03em">
            {{ active ? format(active.value) : centerValue }}
          </div>
          <div class="tiny faint upper" style="margin-top: 2px">
            {{ active ? active.label : centerLabel }}
          </div>
        </div>
      </div>

      <div class="col grow" style="gap: 8px; min-width: 150px">
        <button
          v-for="arc in arcs"
          :key="arc.index"
          type="button"
          class="row-between small legend-row"
          :aria-pressed="activeIndex === arc.index"
          :title="`${arc.label} · ${format(arc.value)}`"
          @click="toggle(arc.index)"
          @pointerenter="preview(arc.index, $event)"
          @pointerleave="clearOnLeave($event)"
        >
          <span class="row" style="gap: 7px; min-width: 0">
            <span class="legend-swatch" :style="{ background: arc.color }" />
            <span class="truncate">{{ arc.label }}</span>
          </span>
          <span class="mono faint nowrap">
            {{ format(arc.value) }}
            <span style="opacity: 0.7">· {{ (arc.fraction * 100).toFixed(1) }}%</span>
          </span>
        </button>
      </div>
    </template>
  </div>
</template>

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

/** Visual separation between adjacent slices, in viewBox units. */
const SEGMENT_GAP = 2

/** Point on the ring at `angle`, measured clockwise from 12 o'clock. */
function pointAt(angle) {
  const a = angle - Math.PI / 2
  return [50 + radius.value * Math.cos(a), 50 + radius.value * Math.sin(a)]
}

/**
 * Slices are stroked as explicit arcs rather than dashed circles.
 *
 * A closed `<circle>` with `stroke-dasharray` renders its dash pattern relative to
 * the path start, and the seam where the pattern wraps back to 0 degrees came out
 * measurably narrower than every other gap (measured at ~2.0 degrees against ~2.75
 * for the rest). An arc whose endpoints are explicit has no pattern to wrap, so all
 * gaps are uniform by construction.
 */
function arcPath(from, to) {
  const [x1, y1] = pointAt(from)
  const [x2, y2] = pointAt(to)
  const largeArc = to - from > Math.PI ? 1 : 0
  return `M ${x1} ${y1} A ${radius.value} ${radius.value} 0 ${largeArc} 1 ${x2} ${y2}`
}

const arcs = computed(() => {
  if (!total.value) return []

  const visible = (props.segments || [])
    .map((segment, index) => ({
      index,
      label: segment.label,
      value: Number(segment.value) || 0,
      color: segment.color || 'var(--accent)',
    }))
    .filter((segment) => segment.value > 0)
  if (!visible.length) return []

  // The gap exists to separate slices. With a single slice there is nothing to
  // separate, so it is drawn as a plain closed circle (see the template) - otherwise
  // the gap just leaves the ring visibly unclosed.
  const gapAngle = visible.length > 1 ? SEGMENT_GAP / radius.value : 0

  let angle = 0
  return visible.map((segment) => {
    const fraction = segment.value / total.value
    const sweep = fraction * 2 * Math.PI
    // Never let the gap eat a slice that is barely wider than the gap itself.
    const half = Math.min(gapAngle, sweep * 0.45) / 2
    const from = angle + half
    const to = angle + sweep - half
    angle += sweep

    return {
      ...segment,
      fraction,
      // Half the gap sits at each end, so the gap either side of every boundary is
      // the same - including across the 12 o'clock seam.
      path: sweep >= 2 * Math.PI - 1e-9 ? null : arcPath(from, to),
    }
  })
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
          style="display: block"
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

          <!-- A single slice is a full turn, which no single arc can express. -->
          <circle
            v-if="arcs.length === 1"
            cx="50"
            cy="50"
            :r="radius"
            fill="none"
            :stroke="arcs[0].color"
            :stroke-width="activeIndex === arcs[0].index ? maxStroke : thickness"
            style="transition: stroke-width 160ms var(--ease), opacity 160ms var(--ease)"
            :opacity="activeIndex === -1 || activeIndex === arcs[0].index ? 1 : 0.42"
            @click="toggle(arcs[0].index)"
            @pointerenter="preview(arcs[0].index, $event)"
            @pointerleave="clearOnLeave($event)"
          />

          <path
            v-for="arc in arcs"
            v-else
            :key="arc.index"
            :d="arc.path"
            fill="none"
            :stroke="arc.color"
            :stroke-width="activeIndex === arc.index ? maxStroke : thickness"
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

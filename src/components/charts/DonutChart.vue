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

/** Mid-line radius of the ring, leaving a unit of padding inside the 100x100 viewBox. */
const radius = computed(() => 50 - Number(props.thickness) / 2 - 1)
const ringOuter = computed(() => radius.value + Number(props.thickness) / 2)
const ringInner = computed(() => radius.value - Number(props.thickness) / 2)

/** Width of the slot between two slices, in viewBox units (constant across the ring). */
const SEGMENT_GAP = 2

/** Point on a circle of radius `r` at `angle`, measured clockwise from 12 o'clock. */
function at(r, angle) {
  return [50 + r * Math.sin(angle), 50 - r * Math.cos(angle)]
}

/**
 * A slice as a *filled* annulus sector, not a stroked arc.
 *
 * A stroke's ends are always radial, so a stroke-dasharray-free gap between two arcs
 * is a wedge: with a 3.02 degree gap on a ring of 29..47 units the outer edge
 * measured 2.47 units against 1.53 at the inner edge - a 61% difference, plainly
 * visible as "more gap pixels outside than inside".
 *
 * Here each slice is inset by straight lines *parallel* to the radial direction,
 * offset half the gap to each side. Such a line meets the two circles at different
 * angles - asin(halfGap / r) - so the inner arc gets a wider angular gap than the
 * outer one, which is exactly what keeps the slot a constant width.
 */
function sectorPath(from, to) {
  const ro = ringOuter.value
  const ri = ringInner.value
  const half = SEGMENT_GAP / 2
  const sweep = to - from

  // Keep the slot from swallowing a slice that is barely wider than the slot itself.
  const limit = sweep * 0.45
  const outerShift = Math.min(Math.asin(Math.min(1, half / ro)), limit)
  const innerShift = Math.min(Math.asin(Math.min(1, half / ri)), limit)

  const [ox1, oy1] = at(ro, from + outerShift)
  const [ox2, oy2] = at(ro, to - outerShift)
  const [ix2, iy2] = at(ri, to - innerShift)
  const [ix1, iy1] = at(ri, from + innerShift)
  const large = sweep - 2 * outerShift > Math.PI ? 1 : 0

  return [
    `M ${ox1} ${oy1}`,
    `A ${ro} ${ro} 0 ${large} 1 ${ox2} ${oy2}`,
    `L ${ix2} ${iy2}`,
    `A ${ri} ${ri} 0 ${large} 0 ${ix1} ${iy1}`,
    'Z',
  ].join(' ')
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

  let angle = 0
  return visible.map((segment) => {
    const fraction = segment.value / total.value
    const sweep = fraction * 2 * Math.PI
    const from = angle
    const to = angle + sweep
    angle = to

    return {
      ...segment,
      fraction,
      // A single slice is a full turn, which no arc pair can express - the template
      // draws it as a plain closed circle instead.
      path: visible.length === 1 ? null : sectorPath(from, to),
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

          <!-- A single slice is a full turn, which no arc pair can express. -->
          <circle
            v-if="arcs.length === 1"
            cx="50"
            cy="50"
            :r="radius"
            fill="none"
            :stroke="arcs[0].color"
            :stroke-width="thickness"
            style="transition: opacity 160ms var(--ease)"
            :opacity="activeIndex === -1 || activeIndex === arcs[0].index ? 1 : 0.42"
            @click="toggle(arcs[0].index)"
            @pointerenter="preview(arcs[0].index, $event)"
            @pointerleave="clearOnLeave($event)"
          />

          <!-- Filled sectors, so the slot between them can be a constant width. -->
          <path
            v-for="arc in arcs"
            v-else
            :key="arc.index"
            :d="arc.path"
            :fill="arc.color"
            style="transition: opacity 160ms var(--ease)"
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

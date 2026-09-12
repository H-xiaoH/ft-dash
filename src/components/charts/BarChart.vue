<script setup>
import { computed, ref } from 'vue'
import { useElementSize } from '@/composables/useElementSize'
import { useChartPointer } from '@/composables/useChartPointer'
import EmptyState from '../EmptyState.vue'

const props = defineProps({
  /** `[{ label, value }]` */
  items: { type: Array, default: () => [] },
  height: { type: Number, default: 190 },
  format: { type: Function, default: (v) => String(v) },
  /** Fixed ceiling for values with a known maximum, e.g. CPU percent. */
  max: { type: Number, default: null },
})

const wrap = ref(null)
const width = useElementSize(wrap)

const PAD = { top: 16, right: 8, bottom: 26, left: 8 }

const geometry = computed(() => {
  const items = props.items || []
  const w = width.value || 640
  const innerW = Math.max(10, w - PAD.left - PAD.right)
  const innerH = Math.max(10, props.height - PAD.top - PAD.bottom)
  if (!items.length) return null

  const values = items.map((item) => Number(item.value) || 0)
  // Scaling to the data alone makes a 12% CPU core draw a full-height bar, which
  // reads as "pegged". A caller that knows the ceiling pins it instead; the max
  // of the two keeps an out-of-range value inside the plot.
  const max = props.max > 0 ? Math.max(props.max, Math.max(...values, 0)) : Math.max(...values, 0)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const zeroY = PAD.top + innerH - ((0 - min) / span) * innerH

  const slot = innerW / items.length
  const barW = Math.max(2, Math.min(34, slot * 0.62))

  // A scale to read the bar heights against, like the area chart has.
  const grid = [max, (max + min) / 2, min]
    .map((value) => ({ value, y: PAD.top + innerH - ((value - min) / span) * innerH }))
    // The zero line is already drawn solid; a dashed line on it just doubles up.
    .filter((item) => Math.abs(item.y - zeroY) > 2)

  const bars = items.map((item, index) => {
    const value = values[index]
    const valueY = PAD.top + innerH - ((value - min) / span) * innerH
    const top = Math.min(valueY, zeroY)
    const barHeight = Math.max(1.5, Math.abs(zeroY - valueY))
    return {
      index,
      label: item.label,
      value,
      x: PAD.left + index * slot + (slot - barW) / 2,
      y: top,
      width: barW,
      height: barHeight,
      positive: value >= 0,
    }
  })

  return { bars, zeroY, slot, innerW, grid }
})

// A tap on empty space should dismiss, so return the index only when it hits a bar.
const { hoverIndex, onPointerDown, onPointerMove, onPointerLeave, onPointerCancel } =
  useChartPointer((event) => {
  const geo = geometry.value
  if (!geo) return null
  const rect = event.currentTarget.getBoundingClientRect()
  const index = Math.floor((event.clientX - rect.left - PAD.left) / geo.slot)
  return index >= 0 && index < geo.bars.length ? index : null
})

const active = computed(() => geometry.value?.bars[hoverIndex.value] || null)

const tickLabels = computed(() => {
  const bars = geometry.value?.bars || []
  if (bars.length <= 1) return bars
  const step = Math.ceil(bars.length / 7)
  return bars.filter((bar) => bar.index % step === 0)
})
</script>

<template>
  <div ref="wrap" class="chart-wrap">
    <EmptyState v-if="!geometry" icon="stats" title="暂无数据" />

    <template v-else>
      <svg class="chart" :height="height" :width="width || '100%'">
        <g>
          <line
            v-for="(item, index) in geometry.grid"
            :key="`grid-${index}`"
            :x1="PAD.left"
            :x2="(width || 640) - PAD.right"
            :y1="item.y"
            :y2="item.y"
            stroke="var(--border)"
            stroke-dasharray="3 5"
          />
          <text
            v-for="(item, index) in geometry.grid"
            :key="`grid-label-${index}`"
            :x="(width || 640) - PAD.right"
            :y="item.y - 4"
            text-anchor="end"
            font-size="10"
            fill="var(--text-faint)"
          >
            {{ format(item.value) }}
          </text>
        </g>

        <line
          :x1="PAD.left"
          :x2="(width || 640) - PAD.right"
          :y1="geometry.zeroY"
          :y2="geometry.zeroY"
          stroke="var(--border-strong)"
        />

        <g v-for="bar in geometry.bars" :key="bar.index">
          <rect
            :x="bar.x"
            :y="bar.y"
            :width="bar.width"
            :height="bar.height"
            rx="2.5"
            :fill="bar.positive ? 'var(--profit)' : 'var(--loss)'"
            :opacity="hoverIndex === -1 || hoverIndex === bar.index ? 0.92 : 0.4"
            style="transition: opacity 140ms var(--ease)"
          />
        </g>

        <text
          v-for="bar in tickLabels"
          :key="`t-${bar.index}`"
          :x="bar.x + bar.width / 2"
          :y="height - 8"
          text-anchor="middle"
          font-size="10"
          fill="var(--text-faint)"
        >
          {{ bar.label }}
        </text>

        <rect
          x="0"
          y="0"
          :width="width || 640"
          :height="height"
          fill="transparent"
          class="chart-hit"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerleave="onPointerLeave"
          @pointercancel="onPointerCancel"
        />
      </svg>

      <div
        v-if="active"
        class="chart-tip"
        :style="{
          left: `${Math.min(Math.max(active.x + active.width / 2, 60), (width || 640) - 60)}px`,
          top: `${active.y}px`,
        }"
      >
        <div class="faint tiny">{{ active.label }}</div>
        <div class="mono strong" :class="active.positive ? 'profit' : 'loss'">
          {{ format(active.value) }}
        </div>
      </div>
    </template>
  </div>
</template>

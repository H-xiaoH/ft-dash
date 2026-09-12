<script setup>
import { computed, ref } from 'vue'
import { useElementSize, nextUid } from '@/composables/useElementSize'
import { useChartPointer } from '@/composables/useChartPointer'
import EmptyState from '../EmptyState.vue'

const props = defineProps({
  values: { type: Array, default: () => [] },
  labels: { type: Array, default: () => [] },
  height: { type: Number, default: 200 },
  format: { type: Function, default: (v) => String(v) },
  labelFormat: { type: Function, default: (v) => String(v) },
  /** 'auto' picks profit/loss colouring from the final value. */
  tone: { type: String, default: 'accent' },
  smooth: { type: Boolean, default: true },
})

const wrap = ref(null)
const width = useElementSize(wrap)
const uid = nextUid('area')

const PAD = { top: 16, right: 14, bottom: 24, left: 14 }

const series = computed(() =>
  (props.values || []).map((value) => Number(value)).filter((value) => Number.isFinite(value)),
)

const colors = computed(() => {
  if (props.tone === 'accent') return { from: 'var(--accent)', to: 'var(--accent-2)' }
  const last = series.value[series.value.length - 1] ?? 0
  return last >= 0
    ? { from: 'var(--profit)', to: 'var(--profit)' }
    : { from: 'var(--loss)', to: 'var(--loss)' }
})

const geometry = computed(() => {
  const values = series.value
  const w = width.value || 640
  const innerW = Math.max(10, w - PAD.left - PAD.right)
  const innerH = Math.max(10, props.height - PAD.top - PAD.bottom)
  if (values.length < 2) return null

  let min = Math.min(...values)
  let max = Math.max(...values)
  if (min === max) {
    min -= 1
    max += 1
  }
  const span = max - min
  min -= span * 0.08
  max += span * 0.08

  const x = (i) => PAD.left + (i * innerW) / (values.length - 1)
  const y = (v) => PAD.top + innerH - ((v - min) / (max - min)) * innerH

  const points = values.map((value, i) => [x(i), y(value)])

  let line = `M ${points[0][0]} ${points[0][1]}`
  if (props.smooth) {
    for (let i = 0; i < points.length - 1; i += 1) {
      const p0 = points[i - 1] || points[i]
      const p1 = points[i]
      const p2 = points[i + 1]
      const p3 = points[i + 2] || p2
      const c1x = p1[0] + (p2[0] - p0[0]) / 6
      const c1y = p1[1] + (p2[1] - p0[1]) / 6
      const c2x = p2[0] - (p3[0] - p1[0]) / 6
      const c2y = p2[1] - (p3[1] - p1[1]) / 6
      line += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`
    }
  } else {
    for (let i = 1; i < points.length; i += 1) line += ` L ${points[i][0]} ${points[i][1]}`
  }

  const baseline = PAD.top + innerH
  const area = `${line} L ${points[points.length - 1][0]} ${baseline} L ${points[0][0]} ${baseline} Z`

  const gridValues = [max, (max + min) / 2, min]
  const grid = gridValues.map((value) => ({ value, y: y(value) }))
  const zeroY = min < 0 && max > 0 ? y(0) : null

  return { points, line, area, min, max, baseline, grid, zeroY, innerW, innerH }
})

const activePoint = computed(() => {
  const geo = geometry.value
  if (!geo || hoverIndex.value < 0) return null
  const point = geo.points[hoverIndex.value]
  if (!point) return null
  return {
    x: point[0],
    y: point[1],
    value: series.value[hoverIndex.value],
    label: props.labels[hoverIndex.value] ?? String(hoverIndex.value + 1),
  }
})

// Mouse hover and touch scrubbing share this (see useChartPointer).
const { hoverIndex, onPointerDown, onPointerMove, onPointerLeave, onPointerCancel } =
  useChartPointer((event) => {
  const geo = geometry.value
  if (!geo || series.value.length < 2) return null
  const rect = event.currentTarget.getBoundingClientRect()
  const ratio = (event.clientX - rect.left - PAD.left) / geo.innerW
  const index = Math.round(ratio * (series.value.length - 1))
  return Math.min(series.value.length - 1, Math.max(0, index))
})

const axisLabels = computed(() => {
  const labels = props.labels || []
  const count = series.value.length
  if (!count) return []
  const indexes = [...new Set([0, Math.floor((count - 1) / 2), count - 1])]
  return indexes
    .filter((i) => i >= 0 && i < count)
    .map((i) => ({ x: geometry.value?.points[i]?.[0] ?? 0, text: labels[i] ?? '' }))
})
</script>

<template>
  <div ref="wrap" class="chart-wrap">
    <EmptyState v-if="!geometry" icon="chartLine" title="暂无数据" />

    <template v-else>
      <svg class="chart" :height="height" :width="width || '100%'">
        <defs>
          <linearGradient :id="`${uid}-fill`" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" :stop-color="colors.from" stop-opacity="0.34" />
            <stop offset="100%" :stop-color="colors.from" stop-opacity="0" />
          </linearGradient>
          <linearGradient :id="`${uid}-stroke`" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" :stop-color="colors.from" />
            <stop offset="100%" :stop-color="colors.to" />
          </linearGradient>
        </defs>

        <g>
          <line
            v-for="(item, index) in geometry.grid"
            :key="index"
            :x1="PAD.left"
            :x2="(width || 640) - PAD.right"
            :y1="item.y"
            :y2="item.y"
            stroke="var(--border)"
            stroke-dasharray="3 5"
          />
          <text
            v-for="(item, index) in geometry.grid"
            :key="`t-${index}`"
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
          v-if="geometry.zeroY !== null"
          :x1="PAD.left"
          :x2="(width || 640) - PAD.right"
          :y1="geometry.zeroY"
          :y2="geometry.zeroY"
          stroke="var(--border-strong)"
        />

        <path :d="geometry.area" :fill="`url(#${uid}-fill)`" />
        <path
          :d="geometry.line"
          fill="none"
          :stroke="`url(#${uid}-stroke)`"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />

        <g v-if="activePoint">
          <line
            :x1="activePoint.x"
            :x2="activePoint.x"
            :y1="PAD.top"
            :y2="geometry.baseline"
            stroke="var(--border-strong)"
            stroke-dasharray="3 3"
          />
          <circle
            :cx="activePoint.x"
            :cy="activePoint.y"
            r="4.5"
            :fill="colors.from"
            stroke="var(--surface-solid)"
            stroke-width="2"
          />
        </g>

        <text
          v-for="(item, index) in axisLabels"
          :key="`axis-${index}`"
          :x="item.x"
          :y="height - 7"
          :text-anchor="index === 0 ? 'start' : index === axisLabels.length - 1 ? 'end' : 'middle'"
          font-size="10"
          fill="var(--text-faint)"
        >
          {{ labelFormat(item.text) }}
        </text>

        <rect
          :x="0"
          :y="0"
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
        v-if="activePoint"
        class="chart-tip"
        :style="{
          left: `${Math.min(Math.max(activePoint.x, 72), (width || 640) - 72)}px`,
          top: `${activePoint.y}px`,
        }"
      >
        <div class="faint tiny">{{ activePoint.label }}</div>
        <div class="mono strong" :class="activePoint.value >= 0 ? 'profit' : 'loss'">
          {{ format(activePoint.value) }}
        </div>
      </div>
    </template>
  </div>
</template>

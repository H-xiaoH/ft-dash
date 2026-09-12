<script setup>
import { computed, ref } from 'vue'
import { useElementSize } from '@/composables/useElementSize'
import { fmtDate, fmtNumber } from '@/utils/format'
import EmptyState from '../EmptyState.vue'

const props = defineProps({
  /** `[{ date, open, high, low, close, volume }]` */
  candles: { type: Array, default: () => [] },
  height: { type: Number, default: 380 },
  priceDigits: { type: Number, default: 4 },
})

const wrap = ref(null)
const width = useElementSize(wrap)
const hoverIndex = ref(-1)

const PAD = { top: 12, right: 62, bottom: 22, left: 6 }
const VOLUME_RATIO = 0.22

const geometry = computed(() => {
  const candles = props.candles || []
  const w = width.value || 720
  const innerW = Math.max(10, w - PAD.left - PAD.right)
  const usableH = Math.max(40, props.height - PAD.top - PAD.bottom)
  const volumeH = usableH * VOLUME_RATIO
  const priceH = usableH - volumeH - 10
  if (candles.length < 2) return null

  const highs = candles.map((c) => Number(c.high)).filter(Number.isFinite)
  const lows = candles.map((c) => Number(c.low)).filter(Number.isFinite)
  const volumes = candles.map((c) => Number(c.volume) || 0)
  if (!highs.length || !lows.length) return null

  let max = Math.max(...highs)
  let min = Math.min(...lows)
  if (min === max) {
    min -= 1
    max += 1
  }
  const pad = (max - min) * 0.06
  max += pad
  min -= pad

  const maxVolume = Math.max(...volumes, 1)
  const slot = innerW / candles.length
  const bodyW = Math.max(1, Math.min(13, slot * 0.64))

  const x = (i) => PAD.left + i * slot + slot / 2
  const y = (price) => PAD.top + priceH - ((price - min) / (max - min)) * priceH
  const volumeY = (v) => PAD.top + priceH + 10 + volumeH - (v / maxVolume) * volumeH

  const bars = candles.map((candle, i) => {
    const open = Number(candle.open)
    const close = Number(candle.close)
    const high = Number(candle.high)
    const low = Number(candle.low)
    const volume = Number(candle.volume) || 0
    const up = close >= open
    const top = y(Math.max(open, close))
    const bottom = y(Math.min(open, close))
    return {
      index: i,
      candle,
      x: x(i),
      bodyW,
      up,
      wickTop: y(high),
      wickBottom: y(low),
      bodyTop: top,
      bodyHeight: Math.max(1, bottom - top),
      volumeY: volumeY(volume),
      volumeHeight: Math.max(0.5, PAD.top + priceH + 10 + volumeH - volumeY(volume)),
    }
  })

  return { bars, min, max, slot, priceH, volumeH, x, y }
})

const active = computed(() => geometry.value?.bars[hoverIndex.value] || null)

const priceTicks = computed(() => {
  const geo = geometry.value
  if (!geo) return []
  return [geo.max, (geo.max + geo.min) / 2, geo.min].map((value) => ({
    value,
    y: geo.y(value),
  }))
})

function onMove(event) {
  const geo = geometry.value
  if (!geo) return
  const rect = event.currentTarget.getBoundingClientRect()
  const index = Math.floor((event.clientX - rect.left - PAD.left) / geo.slot)
  hoverIndex.value = index >= 0 && index < geo.bars.length ? index : -1
}

function candleTitle(bar) {
  return fmtDate(bar.candle.date)
}
</script>

<template>
  <div ref="wrap" class="chart-wrap">
    <EmptyState
      v-if="!geometry"
      icon="candles"
      title="没有K线数据"
      message="请先选择交易对与时间周期，机器人需要处于运行状态才能返回实时数据。"
    />

    <template v-else>
      <svg class="chart" :height="height" :width="width || '100%'">
        <!-- price grid -->
        <g v-for="(tick, index) in priceTicks" :key="`grid-${index}`">
          <line
            :x1="PAD.left"
            :x2="(width || 720) - PAD.right"
            :y1="tick.y"
            :y2="tick.y"
            stroke="var(--border)"
            stroke-dasharray="3 5"
          />
          <text
            :x="(width || 720) - PAD.right + 6"
            :y="tick.y + 3.5"
            font-size="10"
            fill="var(--text-faint)"
            class="mono"
          >
            {{ fmtNumber(tick.value, tick.value > 100 ? 2 : priceDigits) }}
          </text>
        </g>

        <!-- candles -->
        <g v-for="bar in geometry.bars" :key="bar.index">
          <line
            :x1="bar.x"
            :x2="bar.x"
            :y1="bar.wickTop"
            :y2="bar.wickBottom"
            :class="bar.up ? 'candle-wick-up' : 'candle-wick-down'"
            stroke-width="1.1"
          />
          <rect
            :x="bar.x - bar.bodyW / 2"
            :y="bar.bodyTop"
            :width="bar.bodyW"
            :height="bar.bodyHeight"
            :class="bar.up ? 'candle-up' : 'candle-down'"
            rx="1"
          />
          <rect
            :x="bar.x - bar.bodyW / 2"
            :y="bar.volumeY"
            :width="bar.bodyW"
            :height="bar.volumeHeight"
            :class="bar.up ? 'candle-up' : 'candle-down'"
            opacity="0.42"
            rx="1"
          />
        </g>

        <!-- time axis -->
        <g v-if="geometry.bars.length">
          <text
            v-for="index in [0, Math.floor(geometry.bars.length / 2), geometry.bars.length - 1]"
            :key="`time-${index}`"
            :x="geometry.bars[index].x"
            :y="height - 6"
            :text-anchor="index === 0 ? 'start' : index === geometry.bars.length - 1 ? 'end' : 'middle'"
            font-size="10"
            fill="var(--text-faint)"
          >
            {{ fmtDate(geometry.bars[index].candle.date, false) }}
          </text>
        </g>

        <!-- crosshair -->
        <g v-if="active">
          <line
            :x1="active.x"
            :x2="active.x"
            :y1="PAD.top"
            :y2="height - PAD.bottom"
            stroke="var(--border-strong)"
            stroke-dasharray="3 3"
          />
          <line
            :x1="PAD.left"
            :x2="(width || 720) - PAD.right"
            :y1="active.bodyTop"
            :y2="active.bodyTop"
            stroke="var(--border-strong)"
            stroke-dasharray="3 3"
          />
        </g>

        <rect
          x="0"
          y="0"
          :width="width || 720"
          :height="height"
          fill="transparent"
          @pointermove="onMove"
          @pointerleave="hoverIndex = -1"
        />
      </svg>

      <div
        v-if="active"
        class="chart-tip"
        :style="{
          left: `${Math.min(Math.max(active.x, 90), (width || 720) - 90)}px`,
          top: `${active.bodyTop}px`,
        }"
      >
        <div class="faint tiny">{{ candleTitle(active) }}</div>
        <div class="row tiny mono" style="gap: 8px; margin-top: 3px">
          <span>开 {{ fmtNumber(active.candle.open, priceDigits) }}</span>
          <span>高 {{ fmtNumber(active.candle.high, priceDigits) }}</span>
        </div>
        <div class="row tiny mono" style="gap: 8px">
          <span>低 {{ fmtNumber(active.candle.low, priceDigits) }}</span>
          <span>收 {{ fmtNumber(active.candle.close, priceDigits) }}</span>
        </div>
        <div class="tiny faint mono" style="margin-top: 2px">
          量 {{ fmtNumber(active.candle.volume, 2) }}
        </div>
      </div>
    </template>
  </div>
</template>

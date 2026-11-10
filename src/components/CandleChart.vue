<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  TickMarkType,
  TrackingModeExitMode,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LogicalRange,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import { parseTimestamp } from '@/lib/format'
import AppIcon from './AppIcon.vue'
import type { Candle, CandleEntry, CandleFormatters } from './charts'

const props = withDefaults(
  defineProps<{
    candles: Candle[]
    entry?: CandleEntry | null
    height?: number
    formatters: CandleFormatters
  }>(),
  { height: 260, entry: null },
)
const { t } = useI18n()
const zoomActions = [
  { axis: 'price', zoomIn: true, label: 'chart.priceZoomIn' },
  { axis: 'price', zoomIn: false, label: 'chart.priceZoomOut' },
  { axis: 'time', zoomIn: true, label: 'chart.timeZoomIn' },
  { axis: 'time', zoomIn: false, label: 'chart.timeZoomOut' },
] as const
const host = ref<HTMLElement | null>(null)
const activeTime = ref<number | null>(null)
const logicalRange = ref<LogicalRange | null>(null)
let chart: IChartApi | undefined
let series: ISeriesApi<'Candlestick'> | undefined
let entryLine: IPriceLine | undefined
let priceDrag: { y: number; height: number; center: number; radius: number } | undefined

const data = computed(() => {
  const rows = new Map<number, { candle: Candle; time: UTCTimestamp }>()
  props.candles.forEach((candle, index) => {
    if (![candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)) return
    const timestamp = parseTimestamp(candle.time ?? null)
    const time = Math.floor(timestamp === null ? index + 1 : timestamp / 1000) as UTCTimestamp
    rows.set(time, { candle, time })
  })
  return [...rows.values()].sort((a, b) => a.time - b.time)
})
const active = computed(
  () => data.value.find((row) => row.time === activeTime.value) ?? data.value.at(-1),
)
const change = computed(() => {
  const candle = active.value?.candle
  return candle && candle.open > 0 ? (candle.close - candle.open) / candle.open : null
})
const rising = computed(
  () => !!active.value && active.value.candle.close >= active.value.candle.open,
)
function tickLabel(time: Time, type: TickMarkType) {
  const unit =
    type === TickMarkType.Year
      ? 'year'
      : type === TickMarkType.Month
        ? 'month'
        : type === TickMarkType.DayOfMonth
          ? 'day'
          : 'time'
  return props.formatters.tickTime?.(Number(time) * 1000, unit) ?? null
}
function syncFormatters() {
  chart?.applyOptions({
    localization: {
      locale: props.formatters.locale,
      priceFormatter: (value: number) => props.formatters.price(value),
      timeFormatter: (time: Time) => props.formatters.time?.(Number(time) * 1000) ?? String(time),
    },
    timeScale: { tickMarkFormatter: (time: Time, type: TickMarkType) => tickLabel(time, type) },
  })
}
const visibleCount = computed(() =>
  logicalRange.value
    ? Math.max(1, logicalRange.value.to - logicalRange.value.from)
    : data.value.length,
)
const maxStart = computed(() => Math.max(0, data.value.length - 1 - visibleCount.value))
const start = computed(() => Math.max(0, logicalRange.value?.from ?? 0))

function setStart(value: number) {
  chart?.timeScale().setVisibleLogicalRange({ from: value, to: value + visibleCount.value })
}
function reset() {
  priceDrag = undefined
  chart?.priceScale('right').applyOptions({ autoScale: true })
  chart?.timeScale().fitContent()
}
function startPriceDrag(event: TouchEvent) {
  priceDrag = undefined
  if (!chart || !host.value || event.touches.length !== 1) return
  const touch = event.touches[0]!
  const rect = host.value.getBoundingClientRect()
  const axis = chart.priceScale('right')
  const width = axis.width()
  const { height } = chart.paneSize()
  const y = touch.clientY - rect.top
  if (width <= 0 || touch.clientX < rect.right - width || y < 0 || y >= height) return
  const range = axis.getVisibleRange()
  if (!range || range.from >= range.to) return
  priceDrag = {
    y: touch.clientY,
    height,
    center: (range.from + range.to) / 2,
    radius: (range.to - range.from) / 2,
  }
}
function movePriceDrag(event: TouchEvent) {
  if (!priceDrag || !event.cancelable || event.touches.length !== 1) return
  // Cancel page scrolling only for gestures that started on the price scale.
  event.preventDefault()
  const { y, height, center, radius } = priceDrag
  const delta = (event.touches[0]!.clientY - y) / height
  const span = radius * Math.exp(-2 * Math.max(-2, Math.min(delta, 2)))
  const from = center - span
  const to = center + span
  if (from < to && Number.isFinite(from) && Number.isFinite(to)) {
    chart?.priceScale('right').setVisibleRange({ from, to })
  }
}
function endPriceDrag() {
  priceDrag = undefined
}
function zoom(axis: 'price' | 'time', zoomIn: boolean) {
  if (!chart) return
  const factor = zoomIn ? 0.85 : 1 / 0.85
  if (axis === 'price') {
    const scale = chart.priceScale('right')
    const range = scale.getVisibleRange()
    if (!range) return
    const center = (range.from + range.to) / 2
    const radius = ((range.to - range.from) * factor) / 2
    const from = center - radius
    const to = center + radius
    if (from < to && Number.isFinite(from) && Number.isFinite(to)) {
      scale.setAutoScale(false)
      scale.setVisibleRange({ from, to })
    }
    return
  }
  const scale = chart.timeScale()
  const range = scale.getVisibleLogicalRange()
  if (!range) return
  const center = (range.from + range.to) / 2
  const radius = Math.max(1, ((range.to - range.from) * factor) / 2)
  scale.setVisibleLogicalRange({ from: center - radius, to: center + radius })
}
function onKeydown(event: KeyboardEvent) {
  if (!chart) return
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    const previous = data.value.findIndex((row) => row.time === activeTime.value)
    const index = Math.max(
      0,
      Math.min(
        data.value.length - 1,
        (previous === -1 ? data.value.length - 1 : previous) + (event.key === 'ArrowLeft' ? -1 : 1),
      ),
    )
    const row = data.value[index]
    if (!row || !series) return
    const range = chart.timeScale().getVisibleLogicalRange()
    if (range && (index < range.from || index > range.to)) {
      const from = index < range.from ? index : index - (range.to - range.from)
      chart.timeScale().setVisibleLogicalRange({ from, to: from + range.to - range.from })
    }
    chart.setCrosshairPosition(row.candle.close, row.time, series)
    activeTime.value = row.time
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    chart.clearCrosshairPosition()
    activeTime.value = null
  } else if (['Home', 'Enter', ' '].includes(event.key)) {
    event.preventDefault()
    reset()
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault()
    zoom('price', event.key === 'ArrowUp')
  } else if (['+', '=', '-'].includes(event.key)) {
    event.preventDefault()
    zoom('time', event.key !== '-')
  }
}
function syncEntry() {
  if (!series) return
  if (entryLine) series.removePriceLine(entryLine)
  entryLine = undefined
  if (!props.entry || !Number.isFinite(props.entry.price) || props.entry.price <= 0) return
  entryLine = series.createPriceLine({
    price: props.entry.price,
    title: props.entry.label,
    color:
      props.entry.tone === 'good' ? '#81D5AA' : props.entry.tone === 'bad' ? '#F2B8B5' : '#CCC2DC',
    lineStyle: LineStyle.Dashed,
    lineWidth: 1,
    axisLabelVisible: true,
  })
}
function syncData(previous: typeof data.value = []) {
  if (!series || !chart) return
  const range = chart.timeScale().getVisibleLogicalRange()
  const following = !range || range.to >= previous.length - 1
  series.setData(
    data.value.map(({ candle, time }) => ({
      time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    })),
  )
  if (previous.length === 0) chart.timeScale().fitContent()
  else if (range) {
    const nextIndices = new Map(data.value.map((row, index) => [row.time, index]))
    const anchor = previous.findIndex(
      (row, index) => index >= Math.max(0, Math.floor(range.from)) && nextIndices.has(row.time),
    )
    if (following || anchor !== -1) {
      const shift = following
        ? data.value.length - previous.length
        : nextIndices.get(previous[anchor]!.time)! - anchor
      chart.timeScale().setVisibleLogicalRange({ from: range.from + shift, to: range.to + shift })
    } else chart.timeScale().fitContent()
  }
}

onMounted(() => {
  if (!host.value) return
  chart = createChart(host.value, {
    width: host.value.clientWidth,
    height: props.height,
    layout: {
      background: { type: ColorType.Solid, color: 'transparent' },
      textColor: '#CAC4D0',
      attributionLogo: true,
    },
    grid: { vertLines: { color: '#49454F44' }, horzLines: { color: '#49454F66' } },
    rightPriceScale: { borderColor: '#49454F', scaleMargins: { top: 0.08, bottom: 0.08 } },
    timeScale: {
      tickMarkFormatter: tickLabel,
      timeVisible: true,
      secondsVisible: false,
      borderColor: '#49454F',
    },
    localization: {
      locale: props.formatters.locale,
      priceFormatter: (value: number) => props.formatters.price(value),
      timeFormatter: (time: Time) => props.formatters.time?.(Number(time) * 1000) ?? String(time),
    },
    crosshair: {
      mode: CrosshairMode.Magnet,
      vertLine: { color: '#CAC4D080', labelVisible: true, labelBackgroundColor: '#49454F' },
      horzLine: { color: '#CAC4D080', labelVisible: true, labelBackgroundColor: '#49454F' },
    },
    trackingMode: { exitMode: TrackingModeExitMode.OnTouchEnd },
    kineticScroll: { mouse: false, touch: true },
    handleScale: {
      axisPressedMouseMove: { price: true, time: true },
      axisDoubleClickReset: true,
      mouseWheel: true,
      pinch: true,
    },
    handleScroll: {
      mouseWheel: false,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false,
    },
  })
  series = chart.addSeries(CandlestickSeries, {
    upColor: '#81D5AA',
    downColor: '#F2B8B5',
    wickUpColor: '#81D5AA',
    wickDownColor: '#F2B8B5',
    borderVisible: false,
    lastValueVisible: true,
    priceLineVisible: true,
    priceFormat: {
      type: 'custom',
      formatter: (value: number) => props.formatters.price(value),
      minMove: 0.00000001,
    },
  })
  chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
    logicalRange.value = range
  })
  chart.subscribeCrosshairMove((event) => {
    activeTime.value = typeof event.time === 'number' ? event.time : null
  })
  syncData()
  syncEntry()
})
useResizeObserver(host, (entries) => {
  const rect = entries[0]?.contentRect
  if (rect && rect.width > 0 && rect.height > 0)
    chart?.resize(Math.floor(rect.width), Math.floor(rect.height))
})
watch(data, (_current, previous) => syncData(previous))
watch(() => props.entry, syncEntry, { deep: true })
watch(() => props.formatters, syncFormatters)
onBeforeUnmount(() => {
  chart?.remove()
  chart = undefined
})
</script>

<template>
  <div class="candles" data-scrub :style="{ height: `${height + 96}px` }">
    <div v-if="active" class="candles__summary num small" aria-live="off">
      <span>{{ formatters.time?.(active.candle.time ?? null) }}</span>
      <span :class="rising ? 'candles__up' : 'candles__down'"
        >{{ t('chart.open') }} {{ formatters.price(active.candle.open) }}</span
      >
      <span :class="rising ? 'candles__up' : 'candles__down'"
        >{{ t('chart.high') }} {{ formatters.price(active.candle.high) }}</span
      >
      <span :class="rising ? 'candles__up' : 'candles__down'"
        >{{ t('chart.low') }} {{ formatters.price(active.candle.low) }}</span
      >
      <span :class="rising ? 'candles__up' : 'candles__down'"
        >{{ t('chart.close') }} {{ formatters.price(active.candle.close) }}</span
      >
      <span class="candles__change" :class="rising ? 'candles__up' : 'candles__down'"
        >{{ t('chart.change') }} {{ change === null ? '—' : formatters.change?.(change) }}</span
      >
      <span v-if="active.candle.volume != null"
        >{{ t('chart.volume') }} {{ formatters.volume?.(active.candle.volume) }}</span
      >
    </div>

    <div
      ref="host"
      class="candles__plot"
      tabindex="0"
      role="group"
      :aria-label="t('market.priceScale')"
      @keydown="onKeydown"
      @touchstart.passive="startPriceDrag"
      @touchmove="movePriceDrag"
      @touchend.passive="endPriceDrag"
      @touchcancel.passive="endPriceDrag"
    />
    <div class="candles__controls">
      <VSlider
        :model-value="Math.min(start, maxStart)"
        :min="0"
        :max="maxStart"
        :step="1"
        :disabled="maxStart <= 0"
        hide-details
        density="compact"
        :aria-label="t('market.candleRange')"
        @update:model-value="setStart"
      />
      <VMenu location="bottom end" :close-on-content-click="false">
        <template #activator="{ props: activatorProps }">
          <VBtn v-bind="activatorProps" type="button" variant="text" size="small">
            {{ t('chart.zoom') }}
            <AppIcon name="chevronDown" :size="14" />
          </VBtn>
        </template>
        <VList role="menu" :aria-label="t('chart.zoom')">
          <VListItem
            v-for="action in zoomActions"
            :key="action.label"
            role="menuitem"
            :title="t(action.label)"
            @click="zoom(action.axis, action.zoomIn)"
          />
        </VList>
      </VMenu>
      <VBtn variant="text" size="small" :aria-label="t('chart.reset')" @click="reset">{{
        t('chart.reset')
      }}</VBtn>
    </div>
    <a
      class="candles__attribution muted"
      href="https://www.tradingview.com/"
      target="_blank"
      rel="noopener noreferrer"
      >TradingView Lightweight Charts™ · Copyright (с) 2025 TradingView, Inc.</a
    >
  </div>
</template>

<style scoped>
.candles {
  min-width: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto auto;
}
.candles__attribution {
  display: block;
  font-size: 10px;
  text-align: end;
  line-height: 16px;
}
.candles__plot {
  width: 100%;
  height: 100%;
  min-height: 0;
}
.candles__summary {
  min-height: 22px;
  line-height: 22px;
  flex-wrap: wrap;
  display: flex;
  white-space: nowrap;
  gap: 0 12px;
  color: var(--text-3);
}
.candles__up {
  color: #81d5aa;
}
.candles__down {
  color: #f2b8b5;
}
.candles__controls {
  display: flex;
  gap: 8px;
  align-items: center;
}
.candles__controls :deep(.v-slider) {
  flex: 1;
  min-width: 0;
  margin: 0;
}
</style>

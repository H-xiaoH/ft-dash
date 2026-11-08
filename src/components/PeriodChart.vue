<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { use } from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, AriaComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'
import VChart from 'vue-echarts'
import { useFormat } from '@/composables/useFormat'
import type { DailyEntry, HistoricBalanceResponse } from '@/lib/types'

use([BarChart, LineChart, GridComponent, TooltipComponent, AriaComponent, CanvasRenderer])
const props = defineProps<{
  entries: DailyEntry[]
  history: HistoricBalanceResponse | null
  currentEquity: number | null
  period: 'daily' | 'weekly' | 'monthly'
  stake: string
  height: number
}>()
const { t } = useI18n()
const format = useFormat()
const rows = computed(() => props.entries.slice(0, 30).reverse())
const equities = computed(() => {
  const history = props.history
  const timeIndex = history?.columns.indexOf('__date_ts') ?? -1
  const equityIndex = history?.columns.indexOf('total_quote') ?? -1
  const samples = (history?.data ?? [])
    .map((row) => ({ time: Number(row[timeIndex]), value: Number(row[equityIndex]) }))
    .filter(
      (row) =>
        Number.isFinite(row.time) &&
        Number.isFinite(row.value) &&
        row.time >= (history?.capture_start_ts ?? 0),
    )
    .sort((a, b) => a.time - b.time)
  return rows.value.map((row) => {
    const start = Date.parse(`${row.date}T00:00:00Z`)
    const endDate = new Date(start)
    if (props.period === 'monthly') endDate.setUTCMonth(endDate.getUTCMonth() + 1)
    else endDate.setUTCDate(endDate.getUTCDate() + (props.period === 'weekly' ? 7 : 1))
    const end = endDate.getTime()
    if (start <= Date.now() && end > Date.now()) return props.currentEquity
    return samples.findLast((sample) => sample.time >= start && sample.time < end)?.value ?? null
  })
})
const option = computed<EChartsOption>(() => ({
  animation: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  animationDurationUpdate: 180,
  aria: { enabled: true, label: { description: t('stats.period') } },
  grid: { top: 28, bottom: 24, left: 66, right: 56 },
  xAxis: {
    type: 'category',
    data: rows.value.map((row) => row.date.slice(5)),
    axisLine: { lineStyle: { color: '#49454F' } },
    axisLabel: { color: '#CAC4D0' },
    axisTick: { show: false },
  },
  yAxis: [
    {
      type: 'value',
      name: t('kpi.equity'),
      scale: true,
      position: 'left',
      axisLabel: { color: '#FFE082', formatter: (value: number) => format.compact(value) },
      nameTextStyle: { color: '#CAC4D0' },
      splitLine: { lineStyle: { color: '#49454F55' } },
    },
    {
      type: 'value',
      name: t('trades.profit'),
      position: 'right',
      axisLabel: { color: '#CAC4D0', formatter: (value: number) => format.compact(value) },
      nameTextStyle: { color: '#CAC4D0' },
      splitLine: { show: false },
    },
  ],
  tooltip: {
    trigger: 'axis',
    renderMode: 'richText',
    confine: true,
    backgroundColor: '#2B2930',
    borderColor: '#49454F',
    textStyle: { color: '#E6E0E9' },
    formatter: (params: unknown) => {
      const index = (params as { dataIndex: number }[])[0]?.dataIndex
      const row = index === undefined ? undefined : rows.value[index]
      if (!row || index === undefined) return ''
      return [
        format.day(row.date),
        `${t('kpi.equity')} ${format.money(equities.value[index], props.stake)}`,
        `${t('trades.profit')} ${format.signedMoney(row.abs_profit, props.stake)} (${format.ratio(row.rel_profit)})`,
        `${t('stats.tradeCount')} ${row.trade_count}`,
      ].join('\n')
    },
  },
  series: [
    {
      name: t('kpi.equity'),
      type: 'line',
      yAxisIndex: 0,
      data: equities.value,
      z: 3,
      symbol: 'circle',
      symbolSize: 4,
      connectNulls: false,
      lineStyle: { color: '#FFE082', width: 2 },
      itemStyle: { color: '#FFE082' },
    },
    {
      name: t('trades.profit'),
      type: 'bar',
      yAxisIndex: 1,
      z: 2,
      barMaxWidth: 22,
      data: rows.value.map((row) => ({
        value: row.abs_profit,
        itemStyle: { color: row.abs_profit >= 0 ? '#81D5AA' : '#F2B8B5' },
      })),
    },
  ],
}))
</script>

<template>
  <VChart
    class="period-chart"
    :option="option"
    :style="{ height: `${height}px` }"
    autoresize
    data-scrub
  />
</template>

<style scoped>
.period-chart {
  width: 100%;
  min-width: 0;
}
</style>

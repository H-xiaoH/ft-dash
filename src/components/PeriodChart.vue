<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { format as echartsFormat, use } from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, AriaComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'
import VChart from 'vue-echarts'
import { useFormat } from '@/composables/useFormat'
import type { PeriodRow } from '@/lib/period-equity'

use([BarChart, LineChart, GridComponent, TooltipComponent, AriaComponent, CanvasRenderer])
const props = defineProps<{
  entries: PeriodRow[]
  stake: string
  height: number
}>()
const { t } = useI18n()
const format = useFormat()
const rows = computed(() => [...props.entries].reverse())
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
    renderMode: 'html',
    className: 'period-tooltip',
    confine: true,
    extraCssText: 'box-sizing:border-box;max-width:100%;white-space:normal;overflow-wrap:anywhere;',
    backgroundColor: '#2B2930',
    borderColor: '#49454F',
    textStyle: { color: '#E6E0E9' },
    formatter: (params: unknown) => {
      const index = (params as { dataIndex: number }[])[0]?.dataIndex
      const row = index === undefined ? undefined : rows.value[index]
      if (!row) return ''
      const escape = echartsFormat.encodeHTML
      const equity = `${t('kpi.equity')} ${format.money(row.equity, props.stake)}`
      const profit = `${t('trades.profit')} ${format.signedMoney(row.abs_profit, props.stake)}`
      return [
        `<div>${escape(format.day(row.date))}</div>`,
        `<div>${escape(equity)}</div>`,
        `<div>${escape(profit)} <span class="period-tooltip__ratio">(${escape(format.ratio(row.rel_profit))})</span></div>`,
        `<div>${escape(`${t('stats.tradeCount')} ${row.trade_count}`)}</div>`,
      ].join('')
    },
  },
  series: [
    {
      name: t('kpi.equity'),
      type: 'line',
      yAxisIndex: 0,
      data: rows.value.map((row) => row.equity),
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
.period-chart :deep(.period-tooltip__ratio) {
  display: inline-block;
  max-width: 100%;
}
</style>

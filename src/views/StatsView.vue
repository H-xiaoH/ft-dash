<script setup>
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useBotStore } from '@/stores/bot'
import {
  fmtAmount,
  fmtNumber,
  fmtPercentRatio,
  fmtSigned,
  profitClass,
} from '@/utils/format'
import AreaChart from '@/components/charts/AreaChart.vue'
import EmptyState from '@/components/EmptyState.vue'
import Icon from '@/components/Icon.vue'
import StatTile from '@/components/StatTile.vue'

const bot = useBotStore()
const { summary, performanceRows, stakeCurrency } = storeToRefs(bot)

const timescale = ref('daily')

/** freqtrade sends `null` for a profit factor that is actually infinite. */
function fmtProfitFactor(value) {
  if (value === null || value === undefined) return '—'
  if (!Number.isFinite(value)) return '∞'
  return fmtNumber(value, 2)
}

const profitFactorTone = computed(() => {
  const value = summary.value.profitFactor
  if (value === null || value === undefined) return 'neutral'
  return value >= 1 ? 'profit' : 'loss'
})

const TIMESCALES = [
  { id: 'daily', label: '每日', endpoint: () => bot.data.daily },
  { id: 'weekly', label: '每周', endpoint: () => bot.data.weekly },
  { id: 'monthly', label: '每月', endpoint: () => bot.data.monthly },
]

const rows = computed(() => {
  // The API returns newest-first, which is what the table wants.
  const source = TIMESCALES.find((item) => item.id === timescale.value)?.endpoint?.() || []
  return [...source]
})

const periodChart = computed(() => {
  // The chart reads left to right, so reverse into chronological order.
  const source = [...(TIMESCALES.find((t) => t.id === timescale.value)?.endpoint?.() || [])].reverse()
  return {
    values: source.map((row) => Number(row.abs_profit) || 0),
    labels: source.map((row) => String(row.date || '')),
  }
})
</script>

<template>
  <div class="page-head">
    <div>
      <h2 class="page-title">统计</h2>
      <p class="page-sub">收益质量与交易对表现</p>
    </div>
    <div class="row" style="gap: 8px">
      <button class="btn btn--sm" :disabled="bot.loading.stats" @click="bot.refreshAnalytics()">
        <Icon name="refresh" :size="14" :class="bot.loading.stats ? 'spin' : ''" />
        刷新统计
      </button>
    </div>
  </div>

  <div class="grid grid-4">
    <StatTile
      label="盈亏比"
      icon="gauge"
      :value="fmtProfitFactor(summary.profitFactor)"
      sub="Profit Factor"
      :tone="profitFactorTone"
      title="总盈利 ÷ 总亏损（没有亏损交易时为 ∞）"
    />
    <StatTile
      label="最大回撤"
      icon="arrowDown"
      :tone="summary.maxDrawdownAbs > 0 ? 'loss' : 'neutral'"
      :value="summary.maxDrawdownAbs === null ? '—' : fmtNumber(summary.maxDrawdownAbs, 2)"
      :sub="summary.maxDrawdown === null ? '' : `${fmtNumber(summary.maxDrawdown * 100, 2)}%`"
    />
    <StatTile
      label="夏普 / 索提诺"
      icon="activity"
      :value="`${summary.sharpe === null ? '—' : fmtNumber(summary.sharpe, 2)} / ${
        summary.sortino === null ? 'N/A' : fmtNumber(summary.sortino, 2)
      }`"
      title="夏普 = 日均收益率 ÷ 收益率标准差 × √365；索提诺 = 日均收益率 ÷ 下行标准差 × √365（无亏损交易时无法计算）；SQN = √笔数 × 单笔平均收益率 ÷ 单笔收益率标准差；CAGR = (期末余额 ÷ 期初余额) ^ (365 ÷ 天数) − 1；Calmar = 年化收益率 ÷ 最大回撤。均由 freqtrade 依据已平仓交易计算"
    >
      <template #foot>
        <span v-if="summary.sqn !== null" class="faint">SQN {{ fmtNumber(summary.sqn, 2) }}</span>
        <span v-if="summary.cagr !== null" class="faint">
          CAGR {{ fmtNumber(summary.cagr, 1) }}%
        </span>
        <span v-if="summary.calmar !== null" class="faint">
          Calmar {{ fmtNumber(summary.calmar, 2) }}
        </span>
      </template>
    </StatTile>
    <StatTile
      label="总交易额"
      icon="database"
      :value="`${fmtAmount(summary.tradingVolume, 0)} ${stakeCurrency}`"
      :sub="`已平仓 ${fmtNumber(summary.closedTradeCount, 0)} 笔`"
    />
  </div>

  <div class="card">
    <div class="card-head" style="flex-wrap: wrap; gap: 10px">
      <div class="segmented">
        <button
          v-for="item in TIMESCALES"
          :key="item.id"
          :class="{ active: timescale === item.id }"
          @click="timescale = item.id"
        >
          {{ item.label }}
        </button>
      </div>
      <span class="tiny faint">{{ rows.length }} 条记录</span>
    </div>

    <div class="card-body">
      <AreaChart
        :values="periodChart.values"
        :labels="periodChart.labels"
        :height="180"
        tone="auto"
        :format="(v) => fmtSigned(v, 2)"
        :label-format="(v) => String(v)"
      />
    </div>

    <div class="card-body card-body--flush">
      <EmptyState v-if="!rows.length" icon="stats" title="暂无收益记录" />
      <div v-else class="table-wrap">
        <table class="table table--compact">
          <thead>
            <tr>
              <th>日期</th>
              <th class="num">盈亏</th>
              <th class="num">收益率</th>
              <th class="num hide-xs">期初余额</th>
              <th class="num">交易数</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.date">
              <td class="mono small">{{ row.date }}</td>
              <td class="num" :class="profitClass(row.abs_profit)">
                {{ fmtSigned(row.abs_profit, 4) }}
              </td>
              <td class="num" :class="profitClass(row.rel_profit)">
                {{ fmtPercentRatio(row.rel_profit) }}
              </td>
              <td class="num hide-xs faint">{{ fmtNumber(row.starting_balance, 2) }}</td>
              <td class="num">{{ fmtNumber(row.trade_count, 0) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-head">
        <div class="card-title"><Icon name="market" :size="16" /> 交易对表现</div>
      </div>
      <div class="card-body card-body--flush">
        <EmptyState v-if="!performanceRows.length" icon="market" title="暂无数据" />
        <div v-else class="table-wrap">
          <table class="table table--compact">
            <thead>
              <tr>
                <th>交易对</th>
                <th class="num">盈亏</th>
                <th class="num">比例</th>
                <th class="num">笔数</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in performanceRows" :key="row.pair">
                <td class="strong">{{ row.pair }}</td>
                <td class="num" :class="profitClass(row.abs)">{{ fmtSigned(row.abs, 4) }}</td>
                <td class="num" :class="profitClass(row.ratio)">{{ fmtPercentRatio(row.ratio) }}</td>
                <td class="num faint">{{ fmtNumber(row.count, 0) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

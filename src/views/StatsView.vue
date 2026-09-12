<script setup>
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { api } from '@/api/endpoints'
import { useBotStore } from '@/stores/bot'
import { useUiStore } from '@/stores/ui'
import {
  fmtAmount,
  fmtDuration,
  fmtNumber,
  fmtPercentRatio,
  fmtSigned,
  profitClass,
} from '@/utils/format'
import AreaChart from '@/components/charts/AreaChart.vue'
import DonutChart from '@/components/charts/DonutChart.vue'
import EmptyState from '@/components/EmptyState.vue'
import Icon from '@/components/Icon.vue'
import StatTile from '@/components/StatTile.vue'

const bot = useBotStore()
const ui = useUiStore()
const { summary, performanceRows, stakeCurrency } = storeToRefs(bot)

const timescale = ref('daily')
const tagTab = ref('exits')
const tagRows = ref([])
const tagLoading = ref(false)
const tagError = ref('')

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

const DURATION_LABELS = { wins: '盈利交易', losses: '亏损交易', draws: '持平', all: '全部交易' }

const durationRows = computed(() =>
  (bot.statsSummary.durations || []).map((row) => ({
    ...row,
    label: DURATION_LABELS[row.key] || row.key,
  })),
)

const exitSegments = computed(() =>
  bot.statsSummary.rows
    .filter((row) => row.trades > 0)
    .slice(0, 7)
    .map((row, index) => ({
      label: row.reason,
      value: row.trades,
      color: [
        'var(--profit)',
        'var(--loss)',
        'var(--accent)',
        'var(--accent-2)',
        'var(--warn)',
        'var(--info)',
        'var(--text-faint)',
      ][index % 7],
    })),
)

async function loadTags() {
  tagLoading.value = true
  tagError.value = ''
  try {
    const fn =
      tagTab.value === 'entries'
        ? api.entries
        : tagTab.value === 'mix'
          ? api.mixTags
          : api.exits
    const result = await fn()
    tagRows.value = Array.isArray(result) ? result : []
  } catch (error) {
    tagError.value = error?.message || '加载失败'
    tagRows.value = []
  } finally {
    tagLoading.value = false
  }
}

async function switchTag(tab) {
  tagTab.value = tab
  await loadTags()
}

function tagRatio(row) {
  const direct = row.profit_ratio ?? row.profit_pct
  if (direct === undefined || direct === null) return null
  return row.profit_ratio !== undefined ? Number(row.profit_ratio) : Number(row.profit_pct) / 100
}
</script>

<template>
  <div class="page-head">
    <div>
      <h2 class="page-title">统计</h2>
      <p class="page-sub">收益质量、交易对表现与退出原因分析</p>
    </div>
    <div class="row" style="gap: 8px">
      <button class="btn btn--sm" :disabled="bot.loading.stats" @click="bot.refreshAnalytics()">
        <Icon name="refresh" :size="14" :class="bot.loading.stats ? 'spin' : ''" />
        刷新统计
      </button>
      <button class="btn btn--sm" @click="switchTag(tagTab)">
        <Icon name="list" :size="14" />
        加载标签数据
      </button>
    </div>
  </div>

  <div class="grid grid-4">
    <StatTile
      label="盈亏比"
      icon="gauge"
      :value="summary.profitFactor === null ? '—' : fmtNumber(summary.profitFactor, 2)"
      sub="Profit Factor"
      :tone="summary.profitFactor >= 1 ? 'profit' : 'loss'"
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

  <div class="grid grid-2">
    <div class="card">
      <div class="card-head">
        <div class="card-title"><Icon name="clock" :size="16" /> 持仓时长</div>
      </div>
      <div class="card-body col" style="gap: 12px">
        <EmptyState v-if="!durationRows.length" icon="clock" title="暂无持仓时长数据" />
        <template v-else>
          <div
            v-for="row in durationRows"
            :key="row.key"
            class="row-between"
            style="padding-bottom: 10px; border-bottom: 1px solid var(--border)"
          >
            <span class="small strong">{{ row.label }}</span>
            <div class="row small" style="gap: 14px">
              <span class="muted">
                平均 <span class="mono">{{ fmtDuration(row.avg) }}</span>
              </span>
              <span v-if="row.max" class="muted hide-xs">
                最长 <span class="mono">{{ fmtDuration(row.max) }}</span>
              </span>
              <span v-if="row.min" class="muted hide-xs">
                最短 <span class="mono">{{ fmtDuration(row.min) }}</span>
              </span>
            </div>
          </div>
        </template>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title"><Icon name="pie" :size="16" /> 退出原因分布</div>
          <div class="card-sub">按交易笔数</div>
        </div>
      </div>
      <div class="card-body">
        <DonutChart
          :segments="exitSegments"
          :center-value="String(bot.statsSummary.totalTrades || 0)"
          center-label="总交易"
          :format="(v) => fmtNumber(v, 0)"
        />
      </div>
    </div>
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

  <div class="grid grid-2">
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

    <div class="card">
      <div class="card-head">
        <div class="card-title"><Icon name="target" :size="16" /> 退出原因明细</div>
      </div>
      <div class="card-body card-body--flush">
        <EmptyState v-if="!bot.statsSummary.rows.length" icon="target" title="暂无退出原因数据" />
        <div v-else class="table-wrap">
          <table class="table table--compact">
            <thead>
              <tr>
                <th>原因</th>
                <th class="num">笔数</th>
                <th class="num">赢 / 亏</th>
                <th class="num">胜率</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in bot.statsSummary.rows" :key="row.reason">
                <td class="strong truncate" style="max-width: 160px">{{ row.reason }}</td>
                <td class="num">{{ fmtNumber(row.trades, 0) }}</td>
                <td class="num">
                  <span class="profit">{{ row.wins }}</span>
                  <span class="faint"> / </span>
                  <span class="loss">{{ row.losses }}</span>
                </td>
                <td class="num" :class="row.winRate >= 50 ? 'profit' : 'loss'">
                  {{ row.winRate === null ? '—' : `${row.winRate.toFixed(0)}%` }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-head" style="flex-wrap: wrap; gap: 10px">
      <div class="segmented">
        <button :class="{ active: tagTab === 'entries' }" @click="switchTag('entries')">入场标签</button>
        <button :class="{ active: tagTab === 'exits' }" @click="switchTag('exits')">出场原因</button>
        <button :class="{ active: tagTab === 'mix' }" @click="switchTag('mix')">组合表现</button>
      </div>
      <button class="btn btn--sm" :disabled="tagLoading" @click="loadTags">
        <Icon name="refresh" :size="14" :class="tagLoading ? 'spin' : ''" />
        刷新
      </button>
    </div>

    <div class="card-body card-body--flush">
      <div v-if="tagError" class="form-error" style="margin: 14px">
        <Icon name="alert" :size="15" style="flex: none" />
        <span>{{ tagError }}</span>
      </div>

      <EmptyState
        v-else-if="!tagRows.length"
        icon="layers"
        title="还没有加载数据"
        message="点击右上角「加载标签数据」或切换标签页。"
      />

      <div v-else class="table-wrap">
        <table class="table table--compact">
          <thead>
            <tr>
              <th>名称</th>
              <th class="num">笔数</th>
              <th class="num">平均收益</th>
              <th class="num">总盈亏</th>
              <th class="num hide-xs">赢 / 亏</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in tagRows" :key="index">
              <td class="strong truncate" style="max-width: 220px">
                {{ row.pair || row.enter_tag || row.exit_reason || row.mix_tag || row.key || '—' }}
              </td>
              <td class="num">{{ fmtNumber(row.count ?? row.trades, 0) }}</td>
              <td class="num" :class="profitClass(tagRatio(row))">
                {{ fmtPercentRatio(tagRatio(row)) }}
              </td>
              <td class="num" :class="profitClass(row.profit_abs)">
                {{ fmtSigned(row.profit_abs, 4) }}
              </td>
              <td class="num hide-xs">
                <span class="profit">{{ fmtNumber(row.wins, 0) }}</span>
                <span class="faint"> / </span>
                <span class="loss">{{ fmtNumber(row.losses, 0) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

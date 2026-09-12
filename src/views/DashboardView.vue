<script setup>
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useBotStore } from '@/stores/bot'
import { useBotActions } from '@/composables/useBotActions'
import {
  fmtAmount,
  fmtDate,
  fmtDuration,
  fmtNumber,
  fmtPercentRatio,
  fmtSigned,
  profitClass,
} from '@/utils/format'
import AreaChart from '@/components/charts/AreaChart.vue'
import BarChart from '@/components/charts/BarChart.vue'
import EmptyState from '@/components/EmptyState.vue'
import Icon from '@/components/Icon.vue'
import StatTile from '@/components/StatTile.vue'
import TradeDetail from '@/components/TradeDetail.vue'
import TradesTable from '@/components/TradesTable.vue'

const bot = useBotStore()
const actions = useBotActions()
const { summary, balanceTotal, stakeCurrency, openTradesCount, maxOpenTrades, performanceRows } =
  storeToRefs(bot)

const selected = ref(null)
const openTrades = computed(() => bot.data.openTrades || [])
const recentClosed = computed(() => (bot.data.trades || []).filter((t) => !t.is_open).slice(0, 8))
const daily = computed(() => bot.profitTrend || [])

const trendSeries = computed(() => daily.value.map((row) => row.cumulative))
const trendLabels = computed(() => daily.value.map((row) => row.date))

const recentBars = computed(() =>
  daily.value.slice(-14).map((row) => ({
    label: String(row.date || '').slice(5),
    value: row.abs,
  })),
)

const topPairs = computed(() => {
  const rows = performanceRows.value.slice(0, 6)
  const max = Math.max(...rows.map((row) => Math.abs(row.abs)), 1)
  return rows.map((row) => ({ ...row, width: (Math.abs(row.abs) / max) * 100 }))
})

const lastDay = computed(() => daily.value[daily.value.length - 1] || null)

const loadingCore = computed(() => !bot.bootstrapped && !bot.data.profit)

const stateLabel = computed(
  () =>
    ({ running: '运行中', paused: '已暂停', stopbuy: '停止开仓', stopped: '已停止' })[
      bot.botState
    ] || '未知',
)
</script>

<template>
  <div class="page-head">
    <div>
      <h2 class="page-title">总览</h2>
      <p class="page-sub">
        {{ bot.data.config?.strategy || '—' }} ·
        {{ bot.data.config?.timeframe || '—' }} ·
        {{ bot.data.config?.exchange || '—' }}
      </p>
    </div>
    <div class="row wrap" style="gap: 8px">
      <button class="btn btn--sm" :disabled="bot.refreshing" @click="bot.refreshAll()">
        <Icon name="refresh" :size="14" :class="bot.refreshing ? 'spin' : ''" />
        刷新
      </button>
      <button
        v-if="bot.botState !== 'running'"
        class="btn btn--sm btn--profit"
        :disabled="!!actions.busy.value"
        @click="actions.start()"
      >
        <Icon name="play" :size="14" />
        启动
      </button>
      <button
        v-else
        class="btn btn--sm btn--warn"
        :disabled="!!actions.busy.value"
        @click="actions.pause()"
      >
        <Icon name="pause" :size="14" />
        暂停
      </button>
      <button
        class="btn btn--sm"
        :disabled="!!actions.busy.value"
        @click="actions.stopBuy()"
      >
        <Icon name="stop" :size="14" />
        停止开仓
      </button>
      <button
        class="btn btn--sm btn--danger"
        :disabled="!!actions.busy.value"
        @click="actions.stop()"
      >
        <Icon name="power" :size="14" />
        停止
      </button>
    </div>
  </div>

  <div class="grid grid-4">
    <StatTile
      label="账户总资产"
      icon="wallet"
      :loading="loadingCore"
      :value="`${fmtNumber(balanceTotal, 2)} ${stakeCurrency}`"
      :sub="summary.startingCapital ? `起始 ${fmtNumber(summary.startingCapital, 2)}` : ''"
    />

    <StatTile
      label="总盈亏"
      icon="percent"
      :loading="loadingCore"
      :tone="profitClass(summary.absAll)"
      :value="`${fmtSigned(summary.absAll, 4)} ${stakeCurrency}`"
    >
      <template #foot>
        <span class="badge" :class="profitClass(summary.pctAll) === 'neutral' ? '' : `badge--${profitClass(summary.pctAll)}`">
          {{ fmtPercentRatio(summary.ratioAll) }}
        </span>
        <span class="faint">已平仓 {{ fmtSigned(summary.absClosed, 4) }}</span>
      </template>
    </StatTile>

    <StatTile
      label="胜率"
      icon="target"
      :loading="loadingCore"
      :tone="summary.winRate >= 50 ? 'profit' : 'loss'"
      :value="summary.winRate === null ? '—' : `${summary.winRate.toFixed(1)}%`"
    >
      <template #foot>
        <span class="profit">{{ fmtNumber(summary.winning, 0) }} 赢</span>
        <span class="faint">/</span>
        <span class="loss">{{ fmtNumber(summary.losing, 0) }} 亏</span>
      </template>
    </StatTile>

    <StatTile
      label="当前持仓"
      icon="layers"
      :loading="loadingCore"
      :value="`${fmtNumber(openTradesCount, 0)}${maxOpenTrades ? ` / ${maxOpenTrades}` : ''}`"
    >
      <template #foot>
        <span class="faint">浮动</span>
        <span :class="profitClass(bot.openTradesProfitAbs)">
          {{ fmtSigned(bot.openTradesProfitAbs, 4) }}
        </span>
      </template>
    </StatTile>
  </div>

  <div class="split">
    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">
            <Icon name="chartLine" :size="16" />
            累计盈亏
          </div>
          <div class="card-sub">按日聚合的已实现盈亏累加（近 30 天）</div>
        </div>
        <div class="row" style="gap: 10px">
          <span v-if="lastDay" class="badge" :class="lastDay.abs >= 0 ? 'badge--profit' : 'badge--loss'">
            最近一日 {{ fmtSigned(lastDay.abs, 4) }}
          </span>
          <button class="icon-btn" title="刷新统计" @click="bot.refreshAnalytics()">
            <Icon name="refresh" :size="15" :class="bot.loading.daily ? 'spin' : ''" />
          </button>
        </div>
      </div>
      <div class="card-body">
        <AreaChart
          :values="trendSeries"
          :labels="trendLabels"
          :height="240"
          tone="auto"
          :format="(v) => fmtSigned(v, 2)"
          :label-format="(v) => String(v).slice(5)"
        />
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-title"><Icon name="gauge" :size="16" /> 机器人</div>
        <span class="badge" :class="bot.botState === 'running' ? 'badge--profit' : 'badge--warn'">
          {{ stateLabel }}
        </span>
      </div>
      <div class="card-body col" style="gap: 2px">
        <div
          v-for="item in [
            { label: '运行模式', value: bot.dryRun ? 'Dry-run 模拟' : '实盘 Live' },
            { label: '策略', value: bot.data.config?.strategy || '—' },
            { label: '时间周期', value: bot.data.config?.timeframe || '—' },
            { label: '最大持仓', value: bot.data.config?.max_open_trades ?? '—' },
            { label: '版本', value: bot.data.version?.version || '—' },
            { label: '平均持仓', value: fmtDuration(summary.avgDuration) },
            { label: '机器人启动', value: fmtDate(summary.botStartDate) },
            { label: '最后心跳', value: fmtDate(bot.data.health?.last_process) },
          ]"
          :key="item.label"
          class="row-between"
          style="padding: 8px 0; border-bottom: 1px solid var(--border)"
        >
          <span class="small muted">{{ item.label }}</span>
          <span class="small mono truncate" style="max-width: 60%">{{ item.value }}</span>
        </div>

        <button
          class="btn btn--sm btn--block"
          style="margin-top: 12px"
          :disabled="!!actions.busy.value"
          @click="actions.reloadConfig()"
        >
          <Icon name="refresh" :size="14" />
          重载配置
        </button>
      </div>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title"><Icon name="stats" :size="16" /> 每日盈亏</div>
          <div class="card-sub">最近 14 个交易日</div>
        </div>
      </div>
      <div class="card-body">
        <BarChart :items="recentBars" :height="200" :format="(v) => fmtSigned(v, 2)" />
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <div>
        <div class="card-title"><Icon name="layers" :size="16" /> 当前持仓</div>
        <div class="card-sub">
          共 {{ openTrades.length }} 个 · 市值 {{ fmtAmount(bot.openTradesValue, 2) }} {{ stakeCurrency }}
        </div>
      </div>
      <RouterLink class="btn btn--sm" :to="{ name: 'trades' }">
        全部交易
        <Icon name="chevronRight" :size="14" />
      </RouterLink>
    </div>
    <div class="card-body card-body--flush">
      <TradesTable
        :trades="openTrades"
        mode="open"
        compact
        empty-title="当前没有持仓"
        empty-message="机器人开仓后会在这里实时显示。"
        @select="selected = $event"
      />
    </div>
  </div>

  <div class="grid grid-2">
    <div class="card">
      <div class="card-head">
        <div class="card-title"><Icon name="trades" :size="16" /> 最近平仓</div>
        <RouterLink class="btn btn--sm btn--ghost" :to="{ name: 'trades' }">
          更多 <Icon name="chevronRight" :size="14" />
        </RouterLink>
      </div>
      <div class="card-body card-body--flush">
        <TradesTable
          :trades="recentClosed"
          mode="closed"
          compact
          :actions="false"
          empty-title="还没有平仓记录"
          @select="selected = $event"
        />
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title"><Icon name="market" :size="16" /> 交易对表现</div>
          <div class="card-sub">按累计盈亏排序（Top 6）</div>
        </div>
      </div>
      <div class="card-body">
        <EmptyState v-if="!topPairs.length" icon="market" title="暂无交易数据" />
        <div v-else class="col" style="gap: 14px">
          <div v-for="row in topPairs" :key="row.pair" class="col" style="gap: 6px">
            <div class="row-between small">
              <span class="truncate strong">{{ row.pair }}</span>
              <span class="mono" :class="profitClass(row.abs)">
                {{ fmtSigned(row.abs, 4) }}
                <span class="faint">· {{ fmtPercentRatio(row.ratio) }}</span>
              </span>
            </div>
            <div class="meter">
              <div
                class="meter-fill"
                :class="row.abs >= 0 ? 'meter-fill--profit' : 'meter-fill--loss'"
                :style="{ width: `${row.width}%` }"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <TradeDetail :trade="selected" @close="selected = null" />
</template>

<style scoped>
.split {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
}

@media (max-width: 1100px) {
  .split {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

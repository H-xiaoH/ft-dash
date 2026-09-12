<script setup>
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useBotStore } from '@/stores/bot'
import { useBotActions } from '@/composables/useBotActions'
import {
  fmtAmount,
  fmtNumber,
  fmtPercentRatio,
  fmtSigned,
  profitClass,
} from '@/utils/format'
import BarChart from '@/components/charts/BarChart.vue'
import Icon from '@/components/Icon.vue'
import StatTile from '@/components/StatTile.vue'
import TradeDetail from '@/components/TradeDetail.vue'
import TradesTable from '@/components/TradesTable.vue'

const bot = useBotStore()
const actions = useBotActions()
const { summary, balanceTotal, stakeCurrency, openTradesCount, maxOpenTrades } = storeToRefs(bot)

const selected = ref(null)
const openTrades = computed(() => bot.data.openTrades || [])
/** Newest first (the API is asked for `order_by_id=false`), capped for the card. */
const recentClosed = computed(() =>
  (bot.data.trades || []).filter((trade) => !trade.is_open).slice(0, 6),
)
const daily = computed(() => bot.profitTrend || [])

const recentBars = computed(() =>
  daily.value.slice(-14).map((row) => ({
    label: String(row.date || '').slice(5),
    value: row.abs,
  })),
)

const loadingCore = computed(() => !bot.bootstrapped && !bot.data.profit)
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

  <div class="grid grid-2">
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

    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title"><Icon name="trades" :size="16" /> 最近平仓</div>
          <div class="card-sub">最近 {{ recentClosed.length }} 笔</div>
        </div>
        <RouterLink class="btn btn--sm" :to="{ name: 'trades' }">
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
  </div>

  <TradeDetail :trade="selected" @close="selected = null" />
</template>

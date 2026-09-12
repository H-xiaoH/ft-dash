<script setup>
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useBotStore } from '@/stores/bot'
import { useBotActions } from '@/composables/useBotActions'
import {
  fmtSigned,
  profitClass,
  tradeProfitAbs,
  tradeProfitRatio,
} from '@/utils/format'
import EmptyState from '@/components/EmptyState.vue'
import Icon from '@/components/Icon.vue'
import TradeDetail from '@/components/TradeDetail.vue'
import TradesTable from '@/components/TradesTable.vue'

const bot = useBotStore()
const actions = useBotActions()
const { summary, stakeCurrency, openTradesCount, maxOpenTrades } = storeToRefs(bot)

const tab = ref('open')
const search = ref('')
/** Field + direction in one value, so there is no second piece of state to get out of sync. */
const sortSpec = ref('open_timestamp:desc')
const selected = ref(null)
const limit = ref(bot.tradeLimit)

const openTrades = computed(() => bot.data.openTrades || [])
const historyTrades = computed(() => bot.data.trades || [])

function matches(trade) {
  const needle = search.value.trim().toUpperCase()
  if (!needle) return true
  return (
    String(trade.pair || '').toUpperCase().includes(needle) ||
    String(trade.enter_tag || '').toUpperCase().includes(needle) ||
    String(trade.exit_reason || '').toUpperCase().includes(needle)
  )
}

function sorted(rows) {
  const [key, dir] = sortSpec.value.split(':')
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    let left = a[key]
    let right = b[key]
    if (key === 'profit') {
      left = tradeProfitAbs(a) ?? tradeProfitRatio(a) ?? 0
      right = tradeProfitAbs(b) ?? tradeProfitRatio(b) ?? 0
    }
    if (left === undefined || left === null) return 1
    if (right === undefined || right === null) return -1
    if (typeof left === 'string') return left.localeCompare(String(right)) * sign
    return (Number(left) - Number(right)) * sign
  })
}

const visibleOpen = computed(() => sorted(openTrades.value.filter(matches)))
const visibleHistory = computed(() => sorted(historyTrades.value.filter(matches)))

const pageStats = computed(() => {
  const rows = visibleHistory.value
  const abs = rows.reduce((sum, t) => sum + (tradeProfitAbs(t) ?? 0), 0)
  const wins = rows.filter((t) => (tradeProfitRatio(t) ?? 0) > 0).length
  return { abs, wins, total: rows.length }
})

async function applyLimit() {
  bot.tradeLimit = Number(limit.value)
  bot.tradesOffset = 0
  await bot.load('trades')
}

async function prevPage() {
  if (bot.tradesOffset === 0) return
  await bot.setTradesPage(Math.max(0, bot.tradesOffset - bot.tradeLimit))
}

async function nextPage() {
  await bot.setTradesPage(bot.tradesOffset + bot.tradeLimit)
}

const pageNumber = computed(() => Math.floor(bot.tradesOffset / bot.tradeLimit) + 1)
</script>

<template>
  <div class="page-head">
    <div>
      <h2 class="page-title">交易</h2>
      <p class="page-sub">
        持仓 {{ openTradesCount }}{{ maxOpenTrades ? ` / ${maxOpenTrades}` : '' }} · 历史记录分页读取
      </p>
    </div>
    <div class="row wrap" style="gap: 8px">
      <button
        v-if="openTrades.length"
        class="btn btn--sm btn--danger"
        :disabled="!!actions.busy.value"
        @click="actions.forceExitAll(openTrades)"
      >
        <Icon name="bolt" :size="14" />
        全部平仓
      </button>
      <button class="btn btn--sm" :disabled="bot.loading.trades" @click="bot.load('trades')">
        <Icon name="refresh" :size="14" :class="bot.loading.trades ? 'spin' : ''" />
        刷新
      </button>
    </div>
  </div>

  <div class="card">
    <div class="card-head" style="flex-wrap: wrap; gap: 10px">
      <div class="segmented">
        <button :class="{ active: tab === 'open' }" @click="tab = 'open'">
          持仓中 ({{ openTrades.length }})
        </button>
        <button :class="{ active: tab === 'history' }" @click="tab = 'history'">
          历史 ({{ bot.tradesTotal ?? historyTrades.length }})
        </button>
      </div>

      <div class="row grow" style="gap: 8px; justify-content: flex-end; min-width: 200px">
        <div class="input-group" style="max-width: 220px">
          <span class="input-icon"><Icon name="search" :size="15" /></span>
          <input v-model="search" class="input" placeholder="搜索交易对 / 标签" />
        </div>

        <select v-model="sortSpec" class="select" style="width: auto">
          <option value="open_timestamp:desc">开仓时间 新→旧</option>
          <option value="open_timestamp:asc">开仓时间 旧→新</option>
          <option value="profit:desc">盈亏 高→低</option>
          <option value="profit:asc">盈亏 低→高</option>
          <option value="pair:asc">交易对 A→Z</option>
          <option value="stake_amount:desc">投入 高→低</option>
        </select>
      </div>
    </div>

    <div class="card-body card-body--flush">
      <TradesTable
        v-if="tab === 'open'"
        :trades="visibleOpen"
        mode="open"
        empty-title="当前没有持仓"
        empty-message="机器人开仓后会在这里显示，可直接市价平仓。"
        @select="selected = $event"
      />

      <template v-else>
        <div v-if="pageStats.total" class="row wrap" style="padding: 10px 16px; gap: 14px; border-bottom: 1px solid var(--border)">
          <span class="small muted">
            本页 <strong class="strong">{{ pageStats.total }}</strong> 笔
          </span>
          <span class="small">
            合计
            <strong class="mono" :class="profitClass(pageStats.abs)">
              {{ fmtSigned(pageStats.abs, 4) }} {{ stakeCurrency }}
            </strong>
          </span>
          <span class="small muted">
            盈利 <strong class="profit">{{ pageStats.wins }}</strong> /
            亏损 <strong class="loss">{{ pageStats.total - pageStats.wins }}</strong>
          </span>
        </div>

        <TradesTable
          :trades="visibleHistory"
          mode="closed"
          :actions="false"
          empty-title="没有历史交易"
          empty-message="完成一笔交易后会出现在这里。"
          @select="selected = $event"
        />

        <div
          class="row-between"
          style="padding: 12px 16px; border-top: 1px solid var(--border); flex-wrap: wrap; gap: 10px"
        >
          <div class="row small muted" style="gap: 8px">
            <span>每页</span>
            <select v-model="limit" class="select" style="width: auto" @change="applyLimit">
              <option :value="25">25</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
              <option :value="200">200</option>
              <option :value="500">500</option>
            </select>
          </div>

          <div class="row" style="gap: 8px">
            <button
              class="btn btn--sm"
              :disabled="bot.tradesOffset === 0 || bot.loading.trades"
              @click="prevPage"
            >
              <Icon name="chevronLeft" :size="14" />
              上一页
            </button>
            <span class="small muted">
              第 {{ pageNumber }} 页<template v-if="bot.tradesTotal"> · 共 {{ bot.tradesTotal }} 笔</template>
            </span>
            <button
              class="btn btn--sm"
              :disabled="!bot.tradesHasMore || bot.loading.trades"
              @click="nextPage"
            >
              下一页
              <Icon name="chevronRight" :size="14" />
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>

  <TradeDetail :trade="selected" @close="selected = null" />
</template>

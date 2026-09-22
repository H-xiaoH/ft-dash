<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import BarChart from '@/components/BarChart.vue'
import SearchToggle from '@/components/SearchToggle.vue'
import SortHeader from '@/components/SortHeader.vue'
import type { BarItem } from '@/components/charts'
import { useFormat } from '@/composables/useFormat'
import { useChartHeight } from '@/composables/useChartHeight'
import { useBotStore } from '@/stores/bot'

type Period = 'daily' | 'weekly' | 'monthly'
type SortKey =
  | 'name'
  | 'count'
  | 'winRate'
  | 'profitAbs'
  | 'avgDuration'
  | 'fees'
  | 'volume'
  | 'lastTrade'

interface Row {
  name: string
  count: number
  profitAbs: number
  profitRatio: number
  /** Derived from the closed trades the API already hands us. */
  wins: number
  losses: number
  winRate: number | null
  avgDuration: number | null
  fees: number
  volume: number
  lastTrade: number | null
}

const { t } = useI18n()
const format = useFormat()
const bot = useBotStore()

const period = ref<Period>('daily')
const search = ref('')
const sortKey = ref<SortKey>('profitAbs')
const sortDir = ref<'asc' | 'desc'>('desc')
const periodChartHeight = useChartHeight(140, 0.19, 220)

const stake = computed(() => bot.stakeCurrency)

/** Closed trades grouped by pair, so per-pair details need no extra API call. */
const tradesByPair = computed(() => {
  const map = new Map<string, typeof bot.closedTrades>()
  for (const trade of bot.closedTrades) {
    const list = map.get(trade.pair) ?? []
    list.push(trade)
    map.set(trade.pair, list)
  }
  return map
})

/** `/performance` keeps the authoritative totals; the trades enrich each row. */
const allRows = computed<Row[]>(() =>
  bot.performance.map((entry) => {
    const trades = tradesByPair.value.get(entry.pair) ?? []
    const wins = trades.filter((trade) => (trade.profit_ratio ?? 0) > 0).length
    const losses = trades.filter((trade) => (trade.profit_ratio ?? 0) < 0).length
    const durations = trades
      .map((trade) => (trade.close_timestamp ?? 0) - trade.open_timestamp)
      .filter((duration) => duration > 0)
    const decided = wins + losses
    return {
      name: entry.pair,
      count: entry.count,
      profitAbs: entry.profit_abs,
      profitRatio: entry.profit_ratio,
      wins,
      losses,
      winRate: decided > 0 ? (wins / decided) * 100 : null,
      avgDuration: durations.length
        ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length
        : null,
      fees: trades.reduce(
        (sum, trade) => sum + (trade.fee_open_cost ?? 0) + (trade.fee_close_cost ?? 0),
        0,
      ),
      volume: trades.reduce((sum, trade) => sum + (trade.open_trade_value ?? 0), 0),
      lastTrade: trades.length
        ? Math.max(...trades.map((trade) => trade.close_timestamp ?? 0)) || null
        : null,
    }
  }),
)

const rows = computed<Row[]>(() => {
  const query = search.value.trim().toLowerCase()
  const filtered = allRows.value.filter((row) => {
    if (query && !row.name.toLowerCase().includes(query)) return false
    return true
  })
  const direction = sortDir.value === 'asc' ? 1 : -1
  return [...filtered].sort((a, b) => {
    switch (sortKey.value) {
      case 'name':
        return a.name.localeCompare(b.name) * direction
      case 'count':
        return (a.count - b.count) * direction
      case 'winRate':
        return ((a.winRate ?? -1) - (b.winRate ?? -1)) * direction
      case 'avgDuration':
        return ((a.avgDuration ?? 0) - (b.avgDuration ?? 0)) * direction
      case 'fees':
        return (a.fees - b.fees) * direction
      case 'volume':
        return (a.volume - b.volume) * direction
      case 'lastTrade':
        return ((a.lastTrade ?? 0) - (b.lastTrade ?? 0)) * direction
      default:
        return (a.profitAbs - b.profitAbs) * direction
    }
  })
})

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
    return
  }
  sortKey.value = key
  sortDir.value = key === 'name' ? 'asc' : 'desc'
}

const periodData = computed(() => {
  const source = period.value === 'daily' ? bot.daily : period.value === 'weekly' ? bot.weekly : bot.monthly
  return source?.data ?? []
})

const periodBars = computed<BarItem[]>(() =>
  [...periodData.value]
    .reverse()
    .slice(-30)
    .map((entry) => ({
      label: entry.date.slice(5),
      tooltip: format.day(entry.date),
      value: entry.abs_profit,
      display: format.signedMoney(entry.abs_profit, stake.value),
      sub: `${entry.trade_count} ${t('stats.tradeCount')}`,
    })),
)

const exitReasonRows = computed(() =>
  Object.entries(bot.tradeStats?.exit_reasons ?? {})
    .map(([reason, stats]) => ({
      reason,
      wins: stats.wins ?? 0,
      losses: stats.losses ?? 0,
      draws: stats.draws ?? 0,
      total: (stats.wins ?? 0) + (stats.losses ?? 0) + (stats.draws ?? 0),
    }))
    .sort((a, b) => b.total - a.total),
)

const summary = computed(() => bot.profit)
const openCount = computed(() => bot.count?.current ?? bot.openTrades.length)
const maxOpen = computed(() => bot.count?.max ?? bot.showConfig?.max_open_trades ?? 0)

</script>

<template>
  <div class="stack">
    <div class="metric-grid stats__summary">
      <div class="metric">
        <span class="metric__label">{{ t('kpi.totalPnl') }}</span>
        <span class="metric__value" :class="format.toneClass(summary?.profit_all_coin)">
          {{ format.signedMoney(summary?.profit_all_coin ?? null, '', 2) }}
          <span class="metric__unit">{{ stake }}</span>
        </span>
        <span class="metric__sub">{{ format.ratio(summary?.profit_all_ratio ?? null) }}</span>
      </div>
      <div class="metric">
        <span class="metric__label">{{ t('kpi.closedPnl') }}</span>
        <span class="metric__value" :class="format.toneClass(summary?.profit_closed_coin)">
          {{ format.signedMoney(summary?.profit_closed_coin ?? null, '', 2) }}
          <span class="metric__unit">{{ stake }}</span>
        </span>
        <span class="metric__sub">{{ format.ratio(summary?.profit_closed_ratio ?? null) }}</span>
      </div>
      <div class="metric">
        <span class="metric__label">{{ t('kpi.availableBalance') }}</span>
        <span class="metric__value">
          {{ format.money(bot.availableBalance, '', 2) }}
          <span class="metric__unit">{{ stake }}</span>
        </span>
        <span class="metric__sub">
          {{ t('kpi.botManaged') }} {{ format.money(bot.balance?.total_bot ?? null, stake) }}
        </span>
      </div>
      <div class="metric">
        <span class="metric__label">{{ t('kpi.positionValue') }}</span>
        <span class="metric__value">
          {{ format.money(bot.positionValue, '', 2) }}
          <span class="metric__unit">{{ stake }}</span>
        </span>
        <span class="metric__sub">{{ openCount }} / {{ maxOpen }}</span>
      </div>
      <div class="metric">
        <span class="metric__label">{{ t('stats.wins') }} / {{ t('stats.losses') }}</span>
        <span class="metric__value">
          {{ summary?.winning_trades ?? 0 }} / {{ summary?.losing_trades ?? 0 }}
        </span>
        <span class="metric__sub">{{ t('kpi.trades') }} {{ summary?.trade_count ?? 0 }}</span>
      </div>
      <div class="metric">
        <span class="metric__label">{{ t('kpi.winRate') }}</span>
        <span class="metric__value">{{ format.percent(bot.winRate) }}</span>
        <span class="metric__sub">
          {{ t('kpi.expectancy') }} {{ format.number(summary?.expectancy ?? null, 3) }}
        </span>
      </div>
      <div class="metric">
        <span class="metric__label">{{ t('kpi.profitFactor') }}</span>
        <span class="metric__value">{{ format.number(summary?.profit_factor ?? null) }}</span>
      </div>
      <div class="metric">
        <span class="metric__label">{{ t('kpi.sharpe') }}</span>
        <span class="metric__value">{{ format.number(summary?.sharpe ?? null) }}</span>
        <span class="metric__sub">
          {{ t('kpi.sqn') }} {{ format.number(summary?.sqn ?? null) }}
        </span>
      </div>
      <div class="metric">
        <span class="metric__label">{{ t('kpi.sortino') }}</span>
        <span class="metric__value">{{ format.number(summary?.sortino ?? null) }}</span>
        <span class="metric__sub">
          {{ t('kpi.calmar') }} {{ format.number(summary?.calmar ?? null) }}
        </span>
      </div>
      <div class="metric">
        <span class="metric__label">{{ t('kpi.maxDrawdown') }}</span>
        <span class="metric__value u-neg">
          {{ format.percent((summary?.max_drawdown ?? null) === null ? null : (summary?.max_drawdown ?? 0) * 100) }}
        </span>
        <span class="metric__sub">
          {{ t('kpi.currentDrawdown') }}
          {{
            format.percent(
              (summary?.current_drawdown ?? null) === null
                ? null
                : (summary?.current_drawdown ?? 0) * 100,
            )
          }}
        </span>
      </div>
      <div class="metric">
        <span class="metric__label">{{ t('kpi.avgDuration') }}</span>
        <span class="metric__value metric__value--sm">{{ summary?.avg_duration ?? '—' }}</span>
        <span class="metric__sub">{{ t('kpi.tradingVolume') }} {{ format.compact(summary?.trading_volume ?? null) }}</span>
      </div>
      <div class="metric">
        <span class="metric__label">{{ t('kpi.bestPair') }}</span>
        <span class="metric__value metric__value--sm">{{ summary?.best_pair ?? '—' }}</span>
        <span class="metric__sub">{{ format.ratio(summary?.best_pair_profit_ratio ?? null) }}</span>
      </div>
    </div>

    <section class="panel">
      <div class="panel__head">
        <span class="panel__title">{{ t('stats.title') }}</span>
        <span class="panel__meta num">{{ rows.length }} / {{ allRows.length }}</span>
        <div class="panel__actions row">
          <SearchToggle v-model="search" :placeholder="t('stats.group')" />
        </div>
      </div>
      <div class="panel__body panel__body--flush">
        <div v-if="!rows.length" class="empty">{{ t('stats.noData') }}</div>
        <div v-else class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>
                  <SortHeader
                    :label="t('stats.byPair')"
                    :active="sortKey === 'name'"
                    :dir="sortDir"
                    @toggle="toggleSort('name')"
                  />
                </th>
                <th>
                  <SortHeader
                    :label="t('stats.count')"
                    :active="sortKey === 'count'"
                    :dir="sortDir"
                    @toggle="toggleSort('count')"
                  />
                </th>
                <th class="num">
                  <SortHeader
                    :label="t('stats.winRate')"
                    :active="sortKey === 'winRate'"
                    :dir="sortDir"
                    @toggle="toggleSort('winRate')"
                  />
                </th>
                <th class="num">
                  <SortHeader
                    :label="t('stats.totalProfit')"
                    :active="sortKey === 'profitAbs'"
                    :dir="sortDir"
                    @toggle="toggleSort('profitAbs')"
                  />
                </th>
                <th class="num">
                  <SortHeader
                    :label="t('kpi.avgDuration')"
                    :active="sortKey === 'avgDuration'"
                    :dir="sortDir"
                    @toggle="toggleSort('avgDuration')"
                  />
                </th>
                <th class="num">
                  <SortHeader
                    :label="t('trades.fees')"
                    :active="sortKey === 'fees'"
                    :dir="sortDir"
                    @toggle="toggleSort('fees')"
                  />
                </th>
                <th class="num">
                  <SortHeader
                    :label="t('kpi.tradingVolume')"
                    :active="sortKey === 'volume'"
                    :dir="sortDir"
                    @toggle="toggleSort('volume')"
                  />
                </th>
                <th class="num">
                  <SortHeader
                    :label="t('stats.lastTrade')"
                    :active="sortKey === 'lastTrade'"
                    :dir="sortDir"
                    @toggle="toggleSort('lastTrade')"
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.name">
                <td>{{ row.name }}</td>
                <td>{{ row.count }}</td>
                <td class="num">
                  {{ format.percent(row.winRate) }}
                  <div class="small muted">{{ row.wins }} / {{ row.losses }}</div>
                </td>
                <td class="num" :class="format.toneClass(row.profitAbs)">
                  {{ format.signedMoney(row.profitAbs, stake) }}
                </td>
                <td class="num">{{ format.duration(row.avgDuration) }}</td>
                <td class="num">{{ format.money(row.fees, stake, 4) }}</td>
                <td class="num">{{ format.money(row.volume, stake) }}</td>
                <td class="num">{{ format.day(row.lastTrade) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel__head">
        <span class="panel__title">{{ t('stats.period') }}</span>
        <div class="seg">
          <button type="button" class="seg__item" :aria-pressed="period === 'daily'" @click="period = 'daily'">
            {{ t('stats.daily') }}
          </button>
          <button type="button" class="seg__item" :aria-pressed="period === 'weekly'" @click="period = 'weekly'">
            {{ t('stats.weekly') }}
          </button>
          <button type="button" class="seg__item" :aria-pressed="period === 'monthly'" @click="period = 'monthly'">
            {{ t('stats.monthly') }}
          </button>
        </div>
      </div>
      <div class="panel__body">
        <BarChart
          v-if="periodBars.length"
          :items="periodBars"
          :height="periodChartHeight"
          :axis-format="(value: number) => format.money(value, '', 2)"
        />
        <p v-else class="empty">{{ t('stats.noData') }}</p>
      </div>
      <div class="panel__body panel__body--flush">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>{{ t('stats.period') }}</th>
                <th class="num">{{ t('stats.profitAbs') }}</th>
                <th class="num">{{ t('stats.relProfit') }}</th>
                <th class="num">{{ t('stats.tradeCount') }}</th>
                <th class="num">{{ t('stats.startingBalance') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in periodData.slice(0, 12)" :key="entry.date">
                <td class="num">{{ format.day(entry.date) }}</td>
                <td class="num" :class="format.toneClass(entry.abs_profit)">
                  {{ format.signedMoney(entry.abs_profit, stake) }}
                </td>
                <td class="num" :class="format.toneClass(entry.rel_profit)">
                  {{ format.ratio(entry.rel_profit) }}
                </td>
                <td class="num">{{ entry.trade_count }}</td>
                <td class="num">{{ format.money(entry.starting_balance, stake) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <div class="grid-2">
      <section class="panel">
        <div class="panel__head">
          <span class="panel__title">{{ t('stats.exitReasons') }}</span>
        </div>
        <div class="panel__body panel__body--flush">
          <div v-if="!exitReasonRows.length" class="empty">{{ t('stats.noData') }}</div>
          <div v-else class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>{{ t('trades.exitReason') }}</th>
                  <th class="num">{{ t('stats.wins') }}</th>
                  <th class="num">{{ t('stats.losses') }}</th>
                  <th class="num">{{ t('stats.draws') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in exitReasonRows" :key="row.reason">
                  <td>{{ row.reason }}</td>
                  <td class="num u-pos">{{ row.wins }}</td>
                  <td class="num u-neg">{{ row.losses }}</td>
                  <td class="num u-flat">{{ row.draws }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel__head">
          <span class="panel__title">{{ t('stats.durations') }}</span>
        </div>
        <div class="panel__body">
          <dl class="dl">
            <dt>{{ t('stats.avgWinDuration') }}</dt>
            <dd>{{ format.duration(bot.tradeStats?.durations?.wins ?? null) }}</dd>
            <dt>{{ t('stats.avgLossDuration') }}</dt>
            <dd>{{ format.duration(bot.tradeStats?.durations?.losses ?? null) }}</dd>
            <dt>{{ t('stats.draws') }}</dt>
            <dd>{{ format.duration(bot.tradeStats?.durations?.draws ?? null) }}</dd>
            <dt>{{ t('stats.firstTrade') }}</dt>
            <dd>{{ format.dateTime(summary?.first_trade_timestamp ?? null) }}</dd>
            <dt>{{ t('stats.lastTrade') }}</dt>
            <dd>{{ format.dateTime(summary?.latest_trade_timestamp ?? null) }}</dd>
          </dl>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
</style>

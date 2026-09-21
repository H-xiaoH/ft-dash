<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import BarChart from '@/components/BarChart.vue'
import AppIcon from '@/components/AppIcon.vue'
import FilterMenu, { type FilterOption } from '@/components/FilterMenu.vue'
import SearchToggle from '@/components/SearchToggle.vue'
import type { BarItem } from '@/components/charts'
import { useFormat } from '@/composables/useFormat'
import { useBotStore } from '@/stores/bot'

type Kind = 'pair' | 'entry' | 'exit' | 'mix'
type Period = 'daily' | 'weekly' | 'monthly'
type SortKey = 'kind' | 'name' | 'count' | 'profitAbs' | 'profitRatio'

interface Row {
  kind: Kind
  name: string
  count: number
  profitAbs: number
  profitRatio: number
}

const { t } = useI18n()
const format = useFormat()
const bot = useBotStore()

const period = ref<Period>('daily')
const search = ref('')
/** One grouping at a time; the kind is chosen from the first column header. */
const kindFilter = ref<string>('pair')
const sortKey = ref<SortKey>('profitAbs')
const sortDir = ref<'asc' | 'desc'>('desc')

const stake = computed(() => bot.stakeCurrency)

const kindOptions = computed<FilterOption[]>(() => [
  { value: 'pair', label: t('stats.byPair') },
  { value: 'entry', label: t('stats.byEnterTag') },
  { value: 'exit', label: t('stats.byExitReason') },
  { value: 'mix', label: t('stats.byMixTag') },
])

/** Every grouping in one grid, so the header clicks do the filtering work. */
const allRows = computed<Row[]>(() => [
  ...bot.performance.map((entry) => ({
    kind: 'pair' as const,
    name: entry.pair,
    count: entry.count,
    profitAbs: entry.profit_abs,
    profitRatio: entry.profit_ratio,
  })),
  ...bot.entryStats.map((entry) => ({
    kind: 'entry' as const,
    name: entry.enter_tag.trim() || '—',
    count: entry.count,
    profitAbs: entry.profit_abs,
    profitRatio: entry.profit_ratio,
  })),
  ...bot.exitStats.map((entry) => ({
    kind: 'exit' as const,
    name: entry.exit_reason,
    count: entry.count,
    profitAbs: entry.profit_abs,
    profitRatio: entry.profit_ratio,
  })),
  ...bot.mixTags.map((entry) => ({
    kind: 'mix' as const,
    name: entry.mix_tag,
    count: entry.count,
    profitAbs: entry.profit_abs,
    profitRatio: entry.profit_ratio,
  })),
])

const rows = computed<Row[]>(() => {
  const query = search.value.trim().toLowerCase()
  const filtered = allRows.value.filter((row) => {
    if (row.kind !== kindFilter.value) return false
    if (query && !row.name.toLowerCase().includes(query)) return false
    return true
  })
  const direction = sortDir.value === 'asc' ? 1 : -1
  return [...filtered].sort((a, b) => {
    switch (sortKey.value) {
      case 'kind':
        return a.kind.localeCompare(b.kind) * direction || a.name.localeCompare(b.name)
      case 'name':
        return a.name.localeCompare(b.name) * direction
      case 'count':
        return (a.count - b.count) * direction
      case 'profitRatio':
        return (a.profitRatio - b.profitRatio) * direction
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
  sortDir.value = key === 'kind' || key === 'name' ? 'asc' : 'desc'
}

const maxAbsProfitRatio = computed(() =>
  Math.max(0.0001, ...rows.value.map((row) => Math.abs(row.profitRatio))),
)

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
        <span class="metric__label">{{ t('kpi.sharpe') }} / {{ t('kpi.sortino') }}</span>
        <span class="metric__value metric__value--sm">
          {{ format.number(summary?.sharpe ?? null) }} / {{ format.number(summary?.sortino ?? null) }}
        </span>
        <span class="metric__sub">
          {{ t('kpi.sqn') }} {{ format.number(summary?.sqn ?? null) }} · {{ t('kpi.calmar') }}
          {{ format.number(summary?.calmar ?? null) }}
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
                  <!-- The header names the grouping and switches it; the arrow hints that. -->
                  <FilterMenu
                    v-model="kindFilter"
                    variant="text"
                    :options="kindOptions"
                    :label="t('stats.kind')"
                  />
                </th>
                <th>
                  <button type="button" class="sort" @click="toggleSort('count')">
                    {{ t('stats.count') }}
                    <AppIcon
                      v-if="sortKey === 'count'"
                      :name="sortDir === 'asc' ? 'chevronUp' : 'chevronDown'"
                      :size="12"
                    />
                  </button>
                </th>
                <th class="num">{{ t('stats.totalProfit') }}</th>
                <th class="num">
                  <button type="button" class="sort" @click="toggleSort('profitRatio')">
                    {{ t('stats.avgProfit') }}
                    <AppIcon
                      v-if="sortKey === 'profitRatio'"
                      :name="sortDir === 'asc' ? 'chevronUp' : 'chevronDown'"
                      :size="12"
                    />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="`${row.kind}-${row.name}`">
                <td>{{ row.name }}</td>
                <td>{{ row.count }}</td>
                <td class="num" :class="format.toneClass(row.profitAbs)">
                  {{ format.signedMoney(row.profitAbs, stake) }}
                </td>
                <td class="num stats__ratio" :class="format.toneClass(row.profitAbs)">
                  <span>{{ format.ratio(row.count ? row.profitRatio : null) }}</span>
                  <div class="meter">
                    <div
                      class="meter__fill"
                      :class="row.profitAbs >= 0 ? 'meter__fill--good' : 'meter__fill--bad'"
                      :style="{ width: `${(Math.abs(row.profitRatio) / maxAbsProfitRatio) * 100}%` }"
                    />
                  </div>
                </td>
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
          :height="170"
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
.stats__summary {
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

.sort {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: 0;
  padding: 0;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.stats__ratio {
  min-width: 120px;
}

.stats__ratio .meter {
  margin-top: 3px;
}
</style>

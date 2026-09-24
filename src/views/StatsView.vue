<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import BarChart from '@/components/BarChart.vue'
import MetricTile from '@/components/MetricTile.vue'
import SearchToggle from '@/components/SearchToggle.vue'
import SortHeader from '@/components/SortHeader.vue'
import type { BarItem } from '@/components/charts'
import { useFormat } from '@/composables/useFormat'
import { useChartHeight } from '@/composables/useChartHeight'
import { toNumber, type Numberish } from '@/lib/format'
import { buildPairStats, type PairStats } from '@/lib/stats'
import { useBotStore } from '@/stores/bot'

type Period = 'daily' | 'weekly' | 'monthly'
type SortKey =
  'name' | 'count' | 'winRate' | 'profitAbs' | 'avgDuration' | 'fees' | 'volume' | 'lastTrade'

const { t } = useI18n()
const format = useFormat()
const bot = useBotStore()

const period = ref<Period>('daily')
const search = ref('')
const sortKey = ref<SortKey>('profitAbs')
const sortDir = ref<'asc' | 'desc'>('desc')
const periodChartHeight = useChartHeight(140, 0.19, 220)
/** The period tables list exactly as many rows as the chart draws bars. */
const PERIOD_ROWS = 30

const stake = computed(() => bot.stakeCurrency)

/** Totals come from `/performance`, per-pair details from the loaded trades. */
const allRows = computed<PairStats[]>(() => buildPairStats(bot.performance, bot.closedTrades))

const rows = computed<PairStats[]>(() => {
  const query = search.value.trim().toLowerCase()
  const filtered = allRows.value.filter((row) => {
    if (query && !row.pair.toLowerCase().includes(query)) return false
    return true
  })
  const direction = sortDir.value === 'asc' ? 1 : -1
  return [...filtered].sort((a, b) => {
    switch (sortKey.value) {
      case 'name':
        return a.pair.localeCompare(b.pair) * direction
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
  const source =
    period.value === 'daily' ? bot.daily : period.value === 'weekly' ? bot.weekly : bot.monthly
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

const summary = computed(() => bot.profit)
const openCount = computed(() => bot.count?.current ?? bot.openTrades.length)
const maxOpen = computed(() => bot.count?.max ?? bot.showConfig?.max_open_trades ?? 0)

/**
 * Win rate is read against the coin-flip line: at or above 50% the strategy wins more
 * often than it loses, below it the edge is negative.
 */
function winRateTone(value: Numberish) {
  const rate = toNumber(value)
  if (rate === null) return ''
  return rate >= 50 ? 'u-pos' : 'u-neg'
}

/**
 * Sharpe and Sortino share the usual reading: below 1 the return does not pay for the
 * risk taken, 1–2 is acceptable, 2 and up is strong. A negative ratio is outright bad.
 */
function riskRatioTone(value: Numberish) {
  const ratio = toNumber(value)
  if (ratio === null) return ''
  if (ratio < 0) return 'u-neg'
  return ratio < 1 ? 'u-warn' : 'u-pos'
}

/** Freqtrade reports drawdown as a ratio; the tiles show percentages. */
function drawdownPercent(value: number | null | undefined) {
  return value === null || value === undefined ? null : value * 100
}
</script>

<template>
  <div class="stack">
    <div class="metric-grid stats__summary">
      <MetricTile
        :label="t('kpi.closedPnl')"
        :value="summary?.profit_closed_coin ?? null"
        kind="money"
        :currency="stake"
        signed
        tone="auto"
        :sub="format.ratio(summary?.profit_closed_ratio ?? null)"
      />
      <MetricTile
        :label="t('kpi.availableBalance')"
        :value="bot.availableBalance"
        kind="money"
        :currency="stake"
        :sub="`${t('kpi.botManaged')} ${format.money(bot.balance?.total_bot ?? null, stake)}`"
      />
      <MetricTile
        :label="t('kpi.positionValue')"
        :value="bot.positionValue"
        kind="money"
        :currency="stake"
        :sub="`${openCount} / ${maxOpen}`"
      />
      <MetricTile
        :label="`${t('stats.wins')} / ${t('stats.losses')}`"
        :sub="`${t('kpi.trades')} ${summary?.trade_count ?? 0}`"
      >
        <template #value>
          <span class="u-pos">{{ summary?.winning_trades ?? 0 }}</span>
          <span class="muted">/</span>
          <span class="u-neg">{{ summary?.losing_trades ?? 0 }}</span>
        </template>
      </MetricTile>
      <MetricTile
        :label="t('kpi.winRate')"
        :value="bot.winRate"
        kind="percent"
        :tone="winRateTone(bot.winRate)"
        :sub="`${t('kpi.expectancy')} ${format.number(summary?.expectancy ?? null, 3)}`"
      />
      <MetricTile :label="t('kpi.profitFactor')" :value="summary?.profit_factor ?? null" />
      <MetricTile
        :label="t('kpi.sharpe')"
        :value="summary?.sharpe ?? null"
        :tone="riskRatioTone(summary?.sharpe)"
        :sub="`${t('kpi.sqn')} ${format.number(summary?.sqn ?? null)}`"
      />
      <MetricTile
        :label="t('kpi.sortino')"
        :value="summary?.sortino ?? null"
        :tone="riskRatioTone(summary?.sortino)"
        :sub="`${t('kpi.calmar')} ${format.number(summary?.calmar ?? null)}`"
      />
      <MetricTile
        :label="t('kpi.maxDrawdown')"
        :value="drawdownPercent(summary?.max_drawdown)"
        kind="percent"
        tone="u-neg"
        :sub="`${t('kpi.currentDrawdown')} ${format.percent(drawdownPercent(summary?.current_drawdown))}`"
      />
      <MetricTile
        :label="t('kpi.avgDuration')"
        :value="summary?.avg_duration ?? '—'"
        kind="text"
        small
        :sub="`${t('kpi.tradingVolume')} ${format.compact(summary?.trading_volume ?? null)}`"
      />
    </div>

    <section class="panel">
      <div class="panel__head">
        <span class="panel__title">{{ t('stats.pairs') }}</span>
        <span class="panel__meta num">{{ rows.length }} / {{ allRows.length }}</span>
        <div class="panel__actions row">
          <SearchToggle v-model="search" :placeholder="t('stats.name')" />
        </div>
      </div>
      <div class="panel__body panel__body--flush">
        <div v-if="!rows.length" class="empty">{{ t('stats.noData') }}</div>
        <div v-else class="table-wrap u-desktop-only">
          <table class="table">
            <thead>
              <tr>
                <th scope="col">
                  <SortHeader
                    :label="t('stats.name')"
                    :active="sortKey === 'name'"
                    :dir="sortDir"
                    @toggle="toggleSort('name')"
                  />
                </th>
                <th scope="col">
                  <SortHeader
                    :label="t('stats.count')"
                    :active="sortKey === 'count'"
                    :dir="sortDir"
                    @toggle="toggleSort('count')"
                  />
                </th>
                <th scope="col" class="num">
                  <SortHeader
                    :label="t('stats.winRate')"
                    :active="sortKey === 'winRate'"
                    :dir="sortDir"
                    @toggle="toggleSort('winRate')"
                  />
                </th>
                <th scope="col" class="num">
                  <SortHeader
                    :label="t('stats.pairProfit')"
                    :active="sortKey === 'profitAbs'"
                    :dir="sortDir"
                    @toggle="toggleSort('profitAbs')"
                  />
                </th>
                <th scope="col" class="num">
                  <SortHeader
                    :label="t('kpi.avgDuration')"
                    :active="sortKey === 'avgDuration'"
                    :dir="sortDir"
                    @toggle="toggleSort('avgDuration')"
                  />
                </th>
                <th scope="col" class="num">
                  <SortHeader
                    :label="t('trades.fees')"
                    :active="sortKey === 'fees'"
                    :dir="sortDir"
                    @toggle="toggleSort('fees')"
                  />
                </th>
                <th scope="col" class="num">
                  <SortHeader
                    :label="t('kpi.tradingVolume')"
                    :active="sortKey === 'volume'"
                    :dir="sortDir"
                    @toggle="toggleSort('volume')"
                  />
                </th>
                <th scope="col" class="num">
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
              <tr v-for="row in rows" :key="row.pair">
                <td>{{ row.pair }}</td>
                <td>{{ row.count }}</td>
                <td class="num" :class="winRateTone(row.winRate)">
                  {{ format.percent(row.winRate) }}
                  <div class="small muted">
                    <span class="u-pos">{{ row.wins }}</span> /
                    <span class="u-neg">{{ row.losses }}</span>
                  </div>
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

        <!-- Narrow screens get cards instead of a horizontally scrolling table. -->
        <ul v-if="rows.length" class="cards u-mobile-only">
          <li v-for="row in rows" :key="row.pair" class="card">
            <div class="card__row">
              <span class="num card__pair">{{ row.pair }}</span>
              <span class="spacer" />
              <span class="num card__pnl" :class="format.toneClass(row.profitAbs)">
                {{ format.signedMoney(row.profitAbs, stake) }}
              </span>
            </div>
            <div class="card__row small muted">
              <span>{{ t('stats.count') }} {{ row.count }}</span>
              <span>{{ t('stats.winRate') }} {{ format.percent(row.winRate) }}</span>
              <span class="spacer" />
              <span>{{ format.duration(row.avgDuration) }}</span>
            </div>
            <div class="card__row small muted">
              <span>{{ t('trades.fees') }} {{ format.money(row.fees, stake, 4) }}</span>
              <span>{{ t('kpi.tradingVolume') }} {{ format.money(row.volume, stake) }}</span>
              <span class="spacer" />
              <span>{{ format.day(row.lastTrade) }}</span>
            </div>
          </li>
        </ul>
      </div>
    </section>

    <section class="panel">
      <div class="panel__head">
        <span class="panel__title">{{ t('stats.period') }}</span>
        <div class="seg">
          <button
            type="button"
            class="seg__item"
            :aria-pressed="period === 'daily'"
            @click="period = 'daily'"
          >
            {{ t('stats.daily') }}
          </button>
          <button
            type="button"
            class="seg__item"
            :aria-pressed="period === 'weekly'"
            @click="period = 'weekly'"
          >
            {{ t('stats.weekly') }}
          </button>
          <button
            type="button"
            class="seg__item"
            :aria-pressed="period === 'monthly'"
            @click="period = 'monthly'"
          >
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
        <div class="table-wrap u-desktop-only">
          <table class="table">
            <thead>
              <tr>
                <th scope="col">{{ t('stats.date') }}</th>
                <th scope="col" class="num">{{ t('stats.profitAbs') }}</th>
                <th scope="col" class="num">{{ t('stats.relProfit') }}</th>
                <th scope="col" class="num">{{ t('stats.tradeCount') }}</th>
                <th scope="col" class="num">{{ t('stats.startingBalance') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in periodData.slice(0, PERIOD_ROWS)" :key="entry.date">
                <td>{{ format.day(entry.date) }}</td>
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

        <ul class="cards u-mobile-only">
          <li v-for="entry in periodData.slice(0, PERIOD_ROWS)" :key="entry.date" class="card">
            <div class="card__row">
              <span class="num">{{ format.day(entry.date) }}</span>
              <span class="spacer" />
              <span class="num" :class="format.toneClass(entry.abs_profit)">
                {{ format.signedMoney(entry.abs_profit, stake) }}
              </span>
            </div>
            <div class="card__row small muted">
              <span>{{ format.ratio(entry.rel_profit) }}</span>
              <span>{{ t('stats.tradeCount') }} {{ entry.trade_count }}</span>
              <span class="spacer" />
              <span>{{ format.money(entry.starting_balance, stake) }}</span>
            </div>
          </li>
        </ul>
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
</template>

<style scoped></style>

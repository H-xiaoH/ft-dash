<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import MetricTile from '@/components/MetricTile.vue'
import SearchToggle from '@/components/SearchToggle.vue'
import SortMenu from '@/components/SortMenu.vue'
import type { FilterOption } from '@/components/FilterMenu.vue'
import { useFormat } from '@/composables/useFormat'
import { hideFreqtradeSentinel, toNumber, type Numberish } from '@/lib/format'
import { RATIO_BANDS, ratioTone, type RatioKey } from '@/lib/ratios'
import { buildPairStats, type PairStats } from '@/lib/stats'
import RatioGuide from '@/components/RatioGuide.vue'
import { useBotStore } from '@/stores/bot'
import { useSettingsStore } from '@/stores/settings'

type SortKey =
  'name' | 'count' | 'winRate' | 'profitAbs' | 'avgDuration' | 'fees' | 'volume' | 'lastTrade'

const { t } = useI18n()
const format = useFormat()
const bot = useBotStore()
const settings = useSettingsStore()

const search = ref('')
const sortKey = ref<SortKey>('profitAbs')
const sortDir = ref<'asc' | 'desc'>('desc')
/** Paged in the browser like the trade list; the size is a setting (default 10). */
const pageSize = computed(() => settings.pairTablePageSize)

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
        return ((a.fees ?? -Infinity) - (b.fees ?? -Infinity)) * direction
      case 'volume':
        return ((a.volume ?? -Infinity) - (b.volume ?? -Infinity)) * direction
      case 'lastTrade':
        return ((a.lastTrade ?? 0) - (b.lastTrade ?? 0)) * direction
      default:
        return (a.profitAbs - b.profitAbs) * direction
    }
  })
})

const pairPage = ref(1)
/** Each ratio tile opens the explanation for that ratio alone. */
const guideFor = ref<RatioKey | null>(null)

/** The four ratios, in the order the tiles show them. */
const RATIO_KEYS: RatioKey[] = ['sharpe', 'sqn', 'sortino', 'calmar']
const ratioTiles = computed(() =>
  RATIO_KEYS.map((key) => {
    const value = summary.value?.[key] ?? null
    return {
      key,
      value,
      label: t(`kpi.${key}`),
      // The aria-label uses the long name from the guide, e.g. SQN（系统质量数）.
      name: t(`stats.ratios.${key}.name`),
      tone: ratioTone(value, RATIO_BANDS[key]),
    }
  }),
)
const pairTotalPages = computed(() => Math.max(1, Math.ceil(rows.value.length / pageSize.value)))
const pagedPairs = computed(() =>
  rows.value.slice((pairPage.value - 1) * pageSize.value, pairPage.value * pageSize.value),
)

/*
 * Only the operator's own choices send the table back to the first page. Watching `rows`
 * instead would do it on every poll — the store refreshes the pairs every few seconds, and the
 * page would be yanked out from under whoever turned it.
 */
watch([search, sortKey, sortDir], () => {
  pairPage.value = 1
})
watch(pairTotalPages, (max) => {
  if (pairPage.value > max) pairPage.value = max
})

const sortOptions = computed<FilterOption<SortKey>[]>(() => [
  { value: 'name', label: t('stats.name') },
  { value: 'count', label: t('stats.count') },
  { value: 'winRate', label: t('stats.winRate') },
  { value: 'profitAbs', label: t('stats.pairProfit') },
  { value: 'avgDuration', label: t('kpi.avgDuration') },
  { value: 'fees', label: t('trades.fees') },
  { value: 'volume', label: t('kpi.tradingVolume') },
  { value: 'lastTrade', label: t('stats.lastTrade') },
])
const sortField = computed<SortKey>({
  get: () => sortKey.value,
  set(key) {
    if (key === sortKey.value) return
    sortKey.value = key
    sortDir.value = key === 'name' ? 'asc' : 'desc'
  },
})

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
        :sub="`${t('kpi.totalFunds')} ${format.money(bot.balance?.total_bot ?? null, stake)}`"
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
      <MetricTile
        :label="t('kpi.profitFactor')"
        :value="hideFreqtradeSentinel(summary?.profit_factor ?? null)"
      />
      <MetricTile
        v-for="tile in ratioTiles"
        :key="tile.key"
        :label="tile.label"
        :value="tile.value"
        :tone="tile.tone"
        interactive
        :aria-label="`${tile.name} — ${t('stats.ratios.open')}`"
        @click="guideFor = tile.key"
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
        :sub="`${t('kpi.tradingVolume')} ${format.money(summary?.trading_volume ?? null, stake)}`"
      />
    </div>

    <section class="panel">
      <div class="panel__head">
        <span class="panel__title">{{ t('stats.pairs') }}</span>
        <div class="panel__actions row">
          <SortMenu v-model="sortField" v-model:direction="sortDir" :options="sortOptions" />
          <SearchToggle v-model="search" :placeholder="t('market.searchPairs')" />
        </div>
      </div>
      <div class="panel__body panel__body--flush">
        <div v-if="!rows.length" class="empty">{{ t('stats.noData') }}</div>
        <div v-else class="table-wrap progressive-table">
          <table class="table">
            <thead>
              <tr>
                <th scope="col">{{ t('stats.name') }}</th>
                <th scope="col" class="col-extra-1">{{ t('stats.count') }}</th>
                <th scope="col" class="num">{{ t('stats.winRate') }}</th>
                <th scope="col" class="num">{{ t('stats.pairProfit') }}</th>
                <th scope="col" class="num col-extra-2">{{ t('kpi.avgDuration') }}</th>
                <th scope="col" class="num col-extra-3">{{ t('trades.fees') }}</th>
                <th scope="col" class="num col-extra-3">{{ t('kpi.tradingVolume') }}</th>
                <th scope="col" class="num col-extra-4">{{ t('stats.lastTrade') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in pagedPairs" :key="row.pair">
                <td>{{ row.pair }}</td>
                <td class="col-extra-1">{{ row.count }}</td>
                <td class="num" :class="winRateTone(row.winRate)">
                  {{ format.percent(row.winRate) }}
                  <div class="small muted pair-count-inline">
                    {{ t('stats.count') }} {{ row.count }}
                  </div>
                  <div v-if="row.lastTrade !== null" class="small muted">
                    <span class="u-pos">{{ row.wins }}</span> /
                    <span class="u-neg">{{ row.losses }}</span>
                  </div>
                </td>
                <td class="num" :class="format.toneClass(row.profitAbs)">
                  {{ format.signedMoney(row.profitAbs, stake) }}
                </td>
                <td class="num col-extra-2">{{ format.duration(row.avgDuration) }}</td>
                <td class="num col-extra-3">{{ format.money(row.fees, stake, 4) }}</td>
                <td class="num col-extra-3">{{ format.money(row.volume, stake) }}</td>
                <td class="num col-extra-4">{{ format.day(row.lastTrade) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel__head panel__pager">
        <span class="panel__meta num">
          {{ t('common.showing', { shown: pagedPairs.length, total: rows.length }) }}
        </span>
        <div class="panel__actions row">
          <button
            type="button"
            class="btn btn--sm"
            :disabled="pairPage <= 1"
            @click="pairPage -= 1"
          >
            <AppIcon name="chevronRight" class="flip" />
            {{ t('common.prev') }}
          </button>
          <span class="num small muted">
            {{ t('common.page', { page: pairPage, pages: pairTotalPages }) }}
          </span>
          <button
            type="button"
            class="btn btn--sm"
            :disabled="pairPage >= pairTotalPages"
            @click="pairPage += 1"
          >
            {{ t('common.next') }}
            <AppIcon name="chevronRight" />
          </button>
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

    <RatioGuide :ratio="guideFor" @close="guideFor = null" />
  </div>
</template>

<style scoped>
@container progressive-columns (min-width: 470px) {
  .pair-count-inline {
    display: none;
  }
}

@supports not (container-type: inline-size) {
  @media (min-width: 594px) {
    .pair-count-inline {
      display: none;
    }
  }
}
</style>

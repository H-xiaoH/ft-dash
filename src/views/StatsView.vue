<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
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
const route = useRoute()
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
  return filtered
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
const tableSort = computed(() => [{ key: sortKey.value, order: sortDir.value }])
const tableHeaders = computed(() => [
  {
    key: 'name',
    value: 'pair',
    sortRaw: (a: PairStats, b: PairStats) => a.pair.localeCompare(b.pair),
  },
  { key: 'count', sortRaw: (a: PairStats, b: PairStats) => a.count - b.count },
  {
    key: 'winRate',
    sortRaw: (a: PairStats, b: PairStats) => (a.winRate ?? -1) - (b.winRate ?? -1),
  },
  { key: 'profitAbs', sortRaw: (a: PairStats, b: PairStats) => a.profitAbs - b.profitAbs },
  {
    key: 'avgDuration',
    sortRaw: (a: PairStats, b: PairStats) => (a.avgDuration ?? 0) - (b.avgDuration ?? 0),
  },
  {
    key: 'fees',
    sortRaw: (a: PairStats, b: PairStats) =>
      (a.fees?.get(stake.value) ?? -Infinity) - (b.fees?.get(stake.value) ?? -Infinity),
  },
  {
    key: 'volume',
    sortRaw: (a: PairStats, b: PairStats) => (a.volume ?? -Infinity) - (b.volume ?? -Infinity),
  },
  {
    key: 'lastTrade',
    sortRaw: (a: PairStats, b: PairStats) => (a.lastTrade ?? 0) - (b.lastTrade ?? 0),
  },
])

/*
 * Only the operator's own choices send the table back to the first page. Watching `rows`
 * instead would do it on every poll — the store refreshes the pairs every few seconds, and the
 * page would be yanked out from under whoever turned it.
 */
watch([search, sortKey, sortDir], () => {
  pairPage.value = 1
})
const sortOptions = computed<FilterOption<SortKey>[]>(() => [
  { value: 'name', label: t('stats.name') },
  { value: 'count', label: t('stats.count') },
  { value: 'winRate', label: t('stats.winRate') },
  { value: 'profitAbs', label: t('stats.pairProfit') },
  { value: 'avgDuration', label: t('kpi.avgDuration') },
  { value: 'fees', label: `${t('trades.fees')} (${stake.value})` },
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

function durationFromSeconds(seconds: number | null | undefined) {
  return format.duration(seconds == null ? null : seconds * 1000)
}
</script>

<template>
  <div class="d-flex flex-column ga-4">
    <VRow dense class="metric-grid stats__summary">
      <VCol cols="6" sm="4" lg="2"
        ><MetricTile
          :label="t('kpi.closedPnl')"
          :value="summary?.profit_closed_coin ?? null"
          kind="money"
          :currency="stake"
          signed
          tone="auto"
          :sub="format.ratio(summary?.profit_closed_ratio ?? null)"
      /></VCol>
      <VCol cols="6" sm="4" lg="2"
        ><MetricTile
          :label="t('kpi.availableBalance')"
          :value="bot.availableBalance"
          kind="money"
          :currency="bot.availableBalanceCurrency"
          :sub="`${t('kpi.totalFunds')} ${format.money(bot.balance?.total_bot ?? null, stake)}`"
      /></VCol>
      <VCol cols="6" sm="4" lg="2"
        ><MetricTile
          :label="t('kpi.positionValue')"
          :value="bot.positionValue"
          kind="money"
          :currency="stake"
          :sub="`${openCount} / ${maxOpen}`"
      /></VCol>
      <VCol cols="6" sm="4" lg="2"
        ><MetricTile
          :label="`${t('stats.wins')} / ${t('stats.losses')}`"
          :sub="`${t('kpi.trades')} ${summary?.trade_count ?? 0}`"
        >
          <template #value>
            <span class="u-pos">{{ bot.tradeOutcomes?.wins ?? '—' }}</span>
            <span class="muted">/</span>
            <span class="u-neg">{{ bot.tradeOutcomes?.losses ?? '—' }}</span>
          </template>
        </MetricTile></VCol
      >
      <VCol cols="6" sm="4" lg="2"
        ><MetricTile
          :label="t('kpi.winRate')"
          :value="bot.winRate"
          kind="percent"
          :tone="winRateTone(bot.winRate)"
          :sub="`${t('kpi.expectancy')} ${format.number(summary?.expectancy ?? null, 3)}`"
      /></VCol>
      <VCol cols="6" sm="4" lg="2"
        ><MetricTile
          :label="t('kpi.profitFactor')"
          :value="hideFreqtradeSentinel(summary?.profit_factor ?? null)"
      /></VCol>
      <VCol v-for="tile in ratioTiles" :key="tile.key" cols="6" sm="4" lg="2"
        ><MetricTile
          :label="tile.label"
          :value="tile.value"
          :tone="tile.tone"
          interactive
          :aria-label="`${tile.name} — ${t('stats.ratios.open')}`"
          @click="guideFor = tile.key"
      /></VCol>
      <VCol cols="6" sm="4" lg="2"
        ><MetricTile
          :label="t('kpi.maxDrawdown')"
          :value="drawdownPercent(summary?.max_drawdown)"
          kind="percent"
          tone="u-neg"
          :sub="`${t('kpi.currentDrawdown')} ${format.percent(drawdownPercent(summary?.current_drawdown))}`"
      /></VCol>
      <VCol cols="6" sm="4" lg="2"
        ><MetricTile
          :label="t('kpi.avgDuration')"
          :value="summary?.avg_duration ?? '—'"
          kind="text"
          small
          :sub="`${t('kpi.tradingVolume')} ${format.money(summary?.trading_volume ?? null, stake)}`"
      /></VCol>
    </VRow>

    <VCard tag="section" class="panel">
      <VCardItem class="panel__head">
        <VCardTitle tag="span" class="panel__title">{{ t('stats.pairs') }}</VCardTitle>
        <div class="panel__actions d-flex align-center ga-2">
          <SortMenu v-model="sortField" v-model:direction="sortDir" :options="sortOptions" />
          <SearchToggle v-model="search" :placeholder="t('market.searchPairs')" />
        </div>
      </VCardItem>
      <VCardText class="panel__body panel__body--flush">
        <div class="table-wrap progressive-table">
          <VDataTable
            v-model:page="pairPage"
            :items="rows"
            :headers="tableHeaders"
            :sort-by="tableSort"
            :items-per-page="pageSize"
            item-value="pair"
            hide-default-header
            hide-default-footer
            class="table"
            :no-data-text="t('stats.noData')"
          >
            <template #thead
              ><thead>
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
              </thead></template
            >
            <template #item="{ item: row }"
              ><tr>
                <td>
                  <span class="num">{{ row.pair }}</span>
                </td>
                <td class="col-extra-1">{{ row.count }}</td>
                <td class="num" :class="winRateTone(row.winRate)">
                  {{ format.percent(row.winRate) }}
                  <div v-if="row.winRate !== null" class="small muted">
                    {{ t('stats.winRateSample', { count: row.wins + row.losses }) }}
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
                <td class="num col-extra-3">
                  <template v-if="row.fees">
                    <div v-for="[currency, amount] in row.fees" :key="currency">
                      {{ format.number(amount, currency === stake ? 4 : 8) }} {{ currency }}
                    </div>
                  </template>
                  <template v-else>—</template>
                </td>
                <td class="num col-extra-3">{{ format.money(row.volume, stake) }}</td>
                <td class="num col-extra-4">{{ format.dateTime(row.lastTrade) }}</td>
              </tr>
            </template>
            <template #bottom="{ pageCount, items }">
              <VCardActions class="panel__pager">
                <span class="panel__meta num">{{
                  t('common.showing', { shown: items.length, total: rows.length })
                }}</span>
                <VPagination
                  v-model="pairPage"
                  :length="pageCount"
                  :total-visible="3"
                  size="small"
                  density="compact"
                  class="ml-auto"
                />
              </VCardActions>
            </template>
          </VDataTable>
        </div>
      </VCardText>
    </VCard>

    <VCard tag="section" class="panel">
      <VCardItem class="panel__head">
        <VCardTitle tag="span" class="panel__title">{{ t('stats.durations') }}</VCardTitle>
      </VCardItem>
      <VCardText class="panel__body">
        <dl class="dl">
          <dt>{{ t('stats.avgWinDuration') }}</dt>
          <dd>{{ durationFromSeconds(bot.tradeStats?.durations.wins) }}</dd>
          <dt>{{ t('stats.avgLossDuration') }}</dt>
          <dd>{{ durationFromSeconds(bot.tradeStats?.durations.losses) }}</dd>
          <dt>{{ t('stats.draws') }}</dt>
          <dd>{{ durationFromSeconds(bot.tradeStats?.durations.draws) }}</dd>
          <dt>{{ t('stats.firstTrade') }}</dt>
          <dd>{{ format.dateTime(summary?.first_trade_timestamp ?? null) }}</dd>
          <dt>{{ t('stats.lastTrade') }}</dt>
          <dd>{{ format.dateTime(summary?.latest_trade_timestamp ?? null) }}</dd>
        </dl>
      </VCardText>
    </VCard>

    <RatioGuide :ratio="route.name === 'stats' ? guideFor : null" @close="guideFor = null" />
  </div>
</template>

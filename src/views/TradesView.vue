<script setup lang="ts">
import CollapseTransition from '@/components/CollapseTransition.vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import FilterMenu, { type FilterOption } from '@/components/FilterMenu.vue'
import SortMenu from '@/components/SortMenu.vue'
import SearchToggle from '@/components/SearchToggle.vue'
import SideBadge from '@/components/SideBadge.vue'
import TradeDetail from '@/components/TradeDetail.vue'
import { useFormat } from '@/composables/useFormat'
import { pushToast } from '@/composables/useToast'
import { downloadCsv } from '@/lib/csv'
import { isStandalone } from '@/lib/navigation'
import type { Trade } from '@/lib/types'
import { useBotStore } from '@/stores/bot'
import { useSettingsStore } from '@/stores/settings'
import { useSegBlock } from '@/composables/useSegBlock'

type Filter = 'open' | 'closed' | 'all'
type SortKey = 'open_timestamp' | 'pair' | 'profit_abs' | 'duration' | 'stake_amount'

const { t } = useI18n()
const format = useFormat()
const bot = useBotStore()
const settings = useSettingsStore()
const route = useRoute()
const router = useRouter()

const filter = ref<Filter>('all')
const search = ref('')
const result = ref<string>('all')
const sortKey = ref<SortKey>('open_timestamp')
const sortDir = ref<'asc' | 'desc'>('desc')
const selected = ref<Trade | null>(null)
const exitTarget = ref<Trade | null>(null)
const filterSeg = ref<HTMLElement | null>(null)
const { blockStyle: filterBlockStyle, blockReady: filterBlockReady } = useSegBlock(
  filterSeg,
  () => filter.value,
)
/** Paging happens in the browser over everything already loaded; the size is a setting. */
const pageSize = computed(() => settings.tradesPageSize)
const page = ref(1)

// The overview links here with ?filter=open|closed; keep the query in step with the tab.
watch(
  () => route.query.filter,
  (value) => {
    filter.value = value === 'open' || value === 'closed' || value === 'all' ? value : 'all'
  },
  { immediate: true },
)
watch(filter, (value) => {
  if (route.query.filter === value) return
  const query = { ...route.query }
  // "all" is the default, so it stays out of the URL instead of being spelled out.
  if (value === 'all') delete query.filter
  else query.filter = value
  void router.replace({ query })
})

const stake = computed(() => bot.stakeCurrency)

/**
 * Freqtrade's `/trades` only returns closed trades, so "all" has to merge the live
 * positions from `/status` — otherwise open trades silently disappear from the list.
 */
const allTrades = computed(() => {
  const byId = new Map<number, Trade>()
  for (const trade of bot.trades) byId.set(trade.trade_id, trade)
  for (const trade of bot.openTrades) byId.set(trade.trade_id, trade)
  return [...byId.values()]
})

const resultOptions = computed<FilterOption[]>(() => [
  { value: 'all', label: t('common.all') },
  { value: 'win', label: t('stats.wins') },
  { value: 'loss', label: t('stats.losses') },
])

function durationOf(trade: Trade): number | null {
  const open = format.timestamp(trade.open_timestamp)
  if (open === null) return null
  const close = format.timestamp(trade.close_timestamp) ?? Date.now()
  return close - open
}

const rows = computed(() => {
  const base =
    filter.value === 'open'
      ? bot.openTrades
      : filter.value === 'closed'
        ? bot.trades.filter((trade) => !trade.is_open)
        : allTrades.value
  const query = search.value.trim().toLowerCase()
  return base
    .filter((trade) => {
      if (filter.value === 'closed' && trade.is_open) return false
      if (query && !trade.pair.toLowerCase().includes(query)) return false
      const ratio = trade.profit_ratio ?? trade.close_profit
      if (result.value === 'win' && !((ratio ?? 0) > 0)) return false
      if (result.value === 'loss' && !((ratio ?? 0) < 0)) return false
      return true
    })
    .sort((a, b) => {
      const direction = sortDir.value === 'asc' ? 1 : -1
      switch (sortKey.value) {
        case 'pair':
          return a.pair.localeCompare(b.pair) * direction
        case 'profit_abs':
          return ((a.profit_abs ?? 0) - (b.profit_abs ?? 0)) * direction
        case 'stake_amount':
          return (a.stake_amount - b.stake_amount) * direction
        case 'duration':
          return ((durationOf(a) ?? 0) - (durationOf(b) ?? 0)) * direction
        default:
          return ((a.open_timestamp ?? 0) - (b.open_timestamp ?? 0)) * direction
      }
    })
})

const filterLabel = computed(() => {
  if (filter.value === 'open') return t('trades.open')
  if (filter.value === 'closed') return t('trades.closed')
  return t('trades.all')
})
const filterStatus = computed(() =>
  t(rows.value.length === 1 ? 'trades.filterStatusOne' : 'trades.filterStatus', {
    filter: filterLabel.value,
    count: rows.value.length,
  }),
)

const openCount = computed(() => bot.openTrades.length)
const closedCount = computed(() => bot.profit?.closed_trade_count ?? bot.closedTrades.length)
const allCount = computed(() => allTrades.value.length)
const totalPages = computed(() =>
  pageSize.value === 0 ? 1 : Math.max(1, Math.ceil(rows.value.length / pageSize.value)),
)
const pagedRows = computed(() =>
  pageSize.value === 0
    ? rows.value
    : rows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value),
)

// Any change to the query or ordering restarts from the first page.
watch([filter, search, result, sortKey, sortDir], () => {
  page.value = 1
})
watch(totalPages, (max) => {
  if (page.value > max) page.value = max
})

const sortOptions = computed<FilterOption<SortKey>[]>(() => [
  { value: 'open_timestamp', label: t('trades.openDate') },
  { value: 'pair', label: t('trades.pair') },
  { value: 'stake_amount', label: t('trades.stake') },
  { value: 'profit_abs', label: t('trades.profit') },
  { value: 'duration', label: t('trades.duration') },
])
const sortField = computed<SortKey>({
  get: () => sortKey.value,
  set: selectSort,
})
function selectSort(key: SortKey) {
  if (sortKey.value === key) return
  sortKey.value = key
  sortDir.value = key === 'pair' ? 'asc' : 'desc'
}

function openTrade(trade: Trade): void {
  selected.value = trade
  void router.push({ query: { ...route.query, trade: String(trade.trade_id) } })
}

function closeDrawer() {
  selected.value = null
  const query = { ...route.query }
  delete query.trade
  if (isStandalone.value) {
    // Detail opened with push: Back removes that entry instead of leaving a duplicate list page.
    void router.back()
    return
  }
  void router.replace({ query })
}

async function confirmExit() {
  const trade = exitTarget.value
  if (!trade) return
  const result = await bot.forceExit(trade.trade_id, 'market')
  pushToast(result ? t('actions.sent') : t('actions.failed'), result ? 'good' : 'bad')
  exitTarget.value = null
}

function exportCsv() {
  const header = [
    t('trades.tradeId'),
    t('trades.pair'),
    t('trades.side'),
    t('trades.amount'),
    t('trades.stake'),
    t('trades.entryPrice'),
    t('trades.exitPrice'),
    t('trades.profit'),
    t('trades.profitPct'),
    t('trades.openDate'),
    t('trades.closeDate'),
    t('trades.duration'),
    t('trades.enterTag'),
    t('trades.exitReason'),
  ]
  const body = rows.value.map((trade) => [
    trade.trade_id,
    trade.pair,
    trade.is_short ? t('trades.short') : t('trades.long'),
    trade.amount,
    trade.stake_amount,
    trade.open_rate,
    trade.close_rate ?? '',
    trade.profit_abs ?? '',
    ((trade.profit_ratio ?? trade.close_profit ?? 0) * 100).toFixed(2),
    trade.open_date,
    trade.close_date ?? '',
    format.duration(durationOf(trade)),
    trade.enter_tag?.trim() ?? '',
    trade.exit_reason ?? '',
  ])
  downloadCsv(`ft-dash-trades-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body])
}

/**
 * The trade named by `?trade=`: derived from the URL *and* from the loaded trades, so a cold
 * start or a reload on such a link opens the drawer once the data arrives. Resolving it once
 * (on mount, or when the query changes) missed every deep link that booted with empty lists.
 */
const linkedTrade = computed(() => {
  const value = route.query.trade
  if (typeof value !== 'string') return null
  const id = Number(value)
  if (!Number.isFinite(id)) return null
  return (
    bot.trades.find((trade) => trade.trade_id === id) ??
    bot.openTrades.find((trade) => trade.trade_id === id) ??
    null
  )
})

watch(linkedTrade, (trade) => (selected.value = trade))
// Set a deep-linked trade after this view mounts so the drawer transition can observe its
// closed -> open edge instead of rendering an already-open drawer in the first frame.
onMounted(() => {
  if (!isStandalone.value || typeof route.query.trade !== 'string') {
    selected.value = linkedTrade.value
    return
  }

  // A standalone deep link has no list entry behind it. Build that one history layer before
  // restoring the detail URL, so the system Back action closes the drawer inside the app.
  const detailQuery = { ...route.query }
  const listQuery = { ...detailQuery }
  delete listQuery.trade
  void router
    .replace({ query: listQuery })
    .then(() => router.push({ query: detailQuery }))
    .catch(() => {
      selected.value = linkedTrade.value
    })
})
</script>

<template>
  <div class="stack">
    <section class="panel responsive-table">
      <div class="panel__head">
        <div ref="filterSeg" class="seg">
          <button
            type="button"
            class="seg__item"
            :aria-pressed="filter === 'open'"
            @click="filter = 'open'"
          >
            {{ t('trades.open') }}
            <span class="small muted">{{ openCount }}</span>
          </button>
          <button
            type="button"
            class="seg__item"
            :aria-pressed="filter === 'closed'"
            @click="filter = 'closed'"
          >
            {{ t('trades.closed') }}
            <span class="small muted">{{ closedCount }}</span>
          </button>
          <button
            type="button"
            class="seg__item"
            :aria-pressed="filter === 'all'"
            @click="filter = 'all'"
          >
            {{ t('trades.all') }}
            <span class="small muted">{{ allCount }}</span>
          </button>
          <span
            class="seg__block"
            :class="{ 'is-ready': filterBlockReady }"
            :style="filterBlockStyle"
          />
        </div>
        <div class="panel__actions row">
          <SearchToggle v-model="search" :placeholder="t('market.searchPairs')" />
          <FilterMenu
            v-model="result"
            :options="resultOptions"
            :prefix="t('trades.profit')"
            :label="t('trades.profit')"
          />
          <SortMenu v-model="sortField" v-model:direction="sortDir" :options="sortOptions" />
          <!-- On a phone this row also carries the sort pair, so the label gives way. -->
          <button
            type="button"
            class="btn btn--sm trades-export"
            :aria-label="t('trades.exportCsv')"
            :title="t('trades.exportCsv')"
            @click="exportCsv"
          >
            <AppIcon name="download" />
            <span class="u-hide-sm">{{ t('trades.exportCsv') }}</span>
          </button>
        </div>
      </div>

      <div class="panel__body panel__body--flush">
        <div class="sr-only" role="status" aria-live="polite" aria-atomic="true" data-filter-status>
          {{ filterStatus }}
        </div>
        <CollapseTransition>
          <div :key="filter" class="trade-filter-content" data-filter-content>
            <div v-if="!rows.length" class="empty">{{ t('empty.table') }}</div>
            <div v-else class="table-wrap progressive-table">
              <table class="table table--clickable">
                <thead>
                  <tr>
                    <th scope="col">{{ t('trades.pair') }}</th>
                    <th scope="col" class="side-col col-extra-4">{{ t('trades.side') }}</th>
                    <th scope="col" class="num col-extra-2">{{ t('trades.stake') }}</th>
                    <th scope="col" class="num col-extra-3">{{ t('trades.entryPrice') }}</th>
                    <th scope="col" class="num col-extra-3">{{ t('trades.currentPrice') }}</th>
                    <th scope="col" class="num">{{ t('trades.profit') }}</th>
                    <th scope="col" class="num col-extra-1">{{ t('trades.duration') }}</th>
                    <th scope="col" class="num col-extra-3">{{ t('trades.openDate') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="trade in pagedRows" :key="trade.trade_id" @click="openTrade(trade)">
                    <td>
                      <div class="table__pair">
                        <span
                          class="table__side"
                          :class="trade.is_short ? 'table__side--short' : 'table__side--long'"
                        />
                        <span class="num">{{ trade.pair }}</span>
                        <SideBadge class="progressive-side" :is-short="trade.is_short" icon-only />
                        <span v-if="trade.is_open" class="chip chip--accent">{{
                          t('trades.open')
                        }}</span>
                      </div>
                    </td>
                    <td class="side-col col-extra-4"><SideBadge :is-short="trade.is_short" /></td>
                    <td class="num col-extra-2">{{ format.money(trade.stake_amount, stake) }}</td>
                    <td class="num col-extra-3">{{ format.price(trade.open_rate) }}</td>
                    <td class="num col-extra-3">
                      {{ format.price(trade.current_rate ?? trade.close_rate ?? null) }}
                    </td>
                    <td
                      class="num"
                      :class="format.toneClass(trade.profit_ratio ?? trade.close_profit)"
                    >
                      {{
                        format.signedMoney(
                          trade.profit_abs ?? trade.close_profit_abs ?? null,
                          stake,
                        )
                      }}
                      <div class="small muted">
                        {{ format.ratio(trade.profit_ratio ?? trade.close_profit) }}
                      </div>
                    </td>
                    <td class="num col-extra-1">{{ format.duration(durationOf(trade)) }}</td>
                    <td class="num col-extra-3">{{ format.dateTime(trade.open_timestamp) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </CollapseTransition>
      </div>

      <div class="panel__head panel__pager">
        <span class="panel__meta num">
          {{ t('common.showing', { shown: pagedRows.length, total: rows.length }) }}
        </span>
        <div class="panel__actions row">
          <button type="button" class="btn btn--sm" :disabled="page <= 1" @click="page -= 1">
            <AppIcon name="chevronRight" class="flip" />
            {{ t('common.prev') }}
          </button>
          <span class="num small muted">{{ t('common.page', { page, pages: totalPages }) }}</span>
          <button
            type="button"
            class="btn btn--sm"
            :disabled="page >= totalPages"
            @click="page += 1"
          >
            {{ t('common.next') }}
            <AppIcon name="chevronRight" />
          </button>
        </div>
      </div>
    </section>

    <TradeDetail
      :trade="selected"
      @close="closeDrawer"
      @force-exit="(trade) => (exitTarget = trade)"
    />

    <ConfirmDialog
      :open="exitTarget !== null"
      tone="danger"
      :title="bot.labelWithBot(t('actions.forceExit'))"
      :body="t('actions.forceExitHint')"
      :confirm-label="t('actions.forceExit')"
      :require-text="exitTarget?.pair ?? ''"
      :pending="bot.actionPending === 'forceExit'"
      @cancel="exitTarget = null"
      @confirm="confirmExit"
    />
  </div>
</template>

<style scoped>
/* Five controls share the phone toolbar: it wraps rather than pushes the row off-screen. */
.panel__actions {
  min-width: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* A phone has to fit that pair on one line, so the gaps give way first. */
@media not all and (min-width: 720px) {
  .panel__actions {
    gap: var(--sp-1);
  }
}

.trade-filter-content {
  min-width: 0;
}

@container table-layout (max-width: 799.98px) {
  .panel__actions {
    width: 100%;
    margin-left: 0;
  }
}

@supports not (container-type: inline-size) {
  @media (max-width: 900px) {
    .panel__actions {
      width: 100%;
      margin-left: 0;
    }
  }
}
</style>

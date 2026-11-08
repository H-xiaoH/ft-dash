<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
/** Paging happens in the browser over everything already loaded; the size is a setting. */
const pageSize = computed(() => settings.tradesPageSize)
const page = ref(1)

// The overview links here with ?filter=open|closed; keep the query in step with the tab.
watch(
  () => [route.name, route.query.filter] as const,
  ([name, value]) => {
    if (name !== 'trades') return
    filter.value = value === 'open' || value === 'closed' || value === 'all' ? value : 'all'
  },
  { immediate: true },
)
watch(filter, (value) => {
  if (route.name !== 'trades' || route.query.filter === value) return
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
const openRows = computed(() => allTrades.value.filter((trade) => trade.is_open))
const closedRows = computed(() => allTrades.value.filter((trade) => !trade.is_open))

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
      ? openRows.value
      : filter.value === 'closed'
        ? closedRows.value
        : allTrades.value
  const query = search.value.trim().toLowerCase()
  return base.filter((trade) => {
    if (query && !trade.pair.toLowerCase().includes(query)) return false
    const ratio = trade.profit_ratio ?? trade.close_profit
    if (result.value === 'win' && !((ratio ?? 0) > 0)) return false
    if (result.value === 'loss' && !((ratio ?? 0) < 0)) return false
    return true
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

const openCount = computed(() => openRows.value.length)
const closedCount = computed(() => closedRows.value.length)
const allCount = computed(() => allTrades.value.length)
const tableSort = computed(() => [{ key: sortKey.value, order: sortDir.value }])
const tableHeaders = [
  { key: 'pair', sortRaw: (a: Trade, b: Trade) => a.pair.localeCompare(b.pair) },
  { key: 'side' },
  { key: 'stake_amount', sortRaw: (a: Trade, b: Trade) => a.stake_amount - b.stake_amount },
  { key: 'open_rate' },
  { key: 'current_rate' },
  { key: 'profit_abs', sortRaw: (a: Trade, b: Trade) => (a.profit_abs ?? 0) - (b.profit_abs ?? 0) },
  { key: 'duration', sortRaw: (a: Trade, b: Trade) => (durationOf(a) ?? 0) - (durationOf(b) ?? 0) },
  {
    key: 'open_timestamp',
    sortRaw: (a: Trade, b: Trade) => (a.open_timestamp ?? 0) - (b.open_timestamp ?? 0),
  },
  { key: 'close_timestamp' },
]

// Any change to the query or ordering restarts from the first page.
watch([filter, search, result, sortKey, sortDir], () => {
  page.value = 1
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
  const compare = tableHeaders.find((header) => header.key === sortKey.value)!.sortRaw!
  const direction = sortDir.value === 'asc' ? 1 : -1
  const sorted = [...rows.value].sort((a, b) => compare(a, b) * direction)
  const body = sorted.map((trade) => [
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
  if (route.name !== 'trades') return null
  const value = route.query.trade
  if (typeof value !== 'string') return null
  const id = Number(value)
  if (!Number.isFinite(id)) return null
  return allTrades.value.find((trade) => trade.trade_id === id) ?? null
})

// Show standalone details only after their return-to-list history entry is committed.
watch(
  [() => route.fullPath, linkedTrade],
  () => {
    if (route.name === 'trades' && isStandalone.value && typeof route.query.trade === 'string') {
      const detail = { path: route.path, query: { ...route.query } }
      const query = { ...route.query }
      delete query.trade
      const list = { path: route.path, query }
      const listPath = router.resolve(list).fullPath
      if (router.options.history.state.back !== listPath) {
        selected.value = null
        void router
          .replace(list)
          .then(() => {
            if (route.fullPath === listPath) return router.push(detail)
          })
          .catch(() => {
            // The router reports failed navigation through its shared error handler.
          })
        return
      }
    }
    selected.value = linkedTrade.value
  },
  { immediate: true },
)
</script>

<template>
  <div class="d-flex flex-column ga-4">
    <VCard tag="section" class="panel responsive-table">
      <VCardItem class="panel__head">
        <VBtnToggle v-model="filter" mandatory divided class="page-tabs">
          <VBtn type="button" variant="outlined" :aria-pressed="filter === 'open'" value="open">
            {{ t('trades.open') }}
            <span class="small muted">{{ openCount }}</span>
          </VBtn>
          <VBtn type="button" variant="outlined" :aria-pressed="filter === 'closed'" value="closed">
            {{ t('trades.closed') }}
            <span class="small muted">{{ closedCount }}</span>
          </VBtn>
          <VBtn type="button" variant="outlined" :aria-pressed="filter === 'all'" value="all">
            {{ t('trades.all') }}
            <span class="small muted">{{ allCount }}</span>
          </VBtn>
        </VBtnToggle>
        <div class="panel__actions d-flex align-center ga-2">
          <SearchToggle v-model="search" :placeholder="t('market.searchPairs')" />
          <FilterMenu
            v-model="result"
            :options="resultOptions"
            :prefix="t('trades.profit')"
            :label="t('trades.profit')"
          />
          <SortMenu v-model="sortField" v-model:direction="sortDir" :options="sortOptions" />
          <!-- On a phone this row also carries the sort pair, so the label gives way. -->
          <VBtn
            type="button"
            class="trades-export"
            :aria-label="t('trades.exportCsv')"
            :title="t('trades.exportCsv')"
            @click="exportCsv"
          >
            <AppIcon name="download" />
            <span class="u-hide-sm">{{ t('trades.exportCsv') }}</span>
          </VBtn>
        </div>
      </VCardItem>

      <VCardText class="panel__body panel__body--flush">
        <div class="sr-only" role="status" aria-live="polite" aria-atomic="true" data-filter-status>
          {{ filterStatus }}
        </div>
        <VExpandTransition>
          <div :key="filter" class="trade-filter-content" data-filter-content>
            <div class="table-wrap progressive-table">
              <VDataTable
                v-model:page="page"
                :items="rows"
                :headers="tableHeaders"
                :sort-by="tableSort"
                :items-per-page="pageSize === 0 ? -1 : pageSize"
                item-value="trade_id"
                hide-default-header
                hide-default-footer
                class="table table--clickable"
                :no-data-text="t('empty.table')"
              >
                <template #thead
                  ><thead>
                    <tr>
                      <th scope="col">{{ t('trades.pair') }}</th>
                      <th scope="col" class="side-col">{{ t('trades.side') }}</th>
                      <th scope="col" class="num col-extra-2">{{ t('trades.stake') }}</th>
                      <th scope="col" class="num col-extra-3">{{ t('trades.entryPrice') }}</th>
                      <th scope="col" class="num col-extra-3">{{ t('trades.currentPrice') }}</th>
                      <th scope="col" class="num">{{ t('trades.profit') }}</th>
                      <th scope="col" class="num col-extra-1">{{ t('trades.duration') }}</th>
                      <th scope="col" class="num col-extra-3">{{ t('trades.openDate') }}</th>
                      <th scope="col" class="num col-extra-4">{{ t('trades.closeDate') }}</th>
                    </tr>
                  </thead></template
                >
                <template #item="{ item: trade }"
                  ><tr @click="openTrade(trade)">
                    <td>
                      <div class="table__pair">
                        <span
                          class="table__side"
                          :class="trade.is_short ? 'table__side--short' : 'table__side--long'"
                        />
                        <VBtn
                          type="button"
                          class="num table__pair-action"
                          variant="text"
                          color="on-surface"
                          height="auto"
                          rounded="0"
                          @click.stop="openTrade(trade)"
                        >
                          {{ trade.pair }}
                        </VBtn>
                        <VChip
                          v-if="trade.is_open"
                          size="x-small"
                          variant="tonal"
                          color="primary"
                          >{{ t('trades.open') }}</VChip
                        >
                      </div>
                    </td>
                    <td class="side-col"><SideBadge :is-short="trade.is_short" /></td>
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
                    <td class="num col-extra-4">
                      {{ format.dateTime(trade.close_timestamp ?? null) }}
                    </td>
                  </tr>
                </template>
                <template #bottom="{ pageCount, items }">
                  <VCardActions class="panel__pager">
                    <span class="panel__meta num">{{
                      t('common.showing', { shown: items.length, total: rows.length })
                    }}</span>
                    <VPagination
                      v-model="page"
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
          </div>
        </VExpandTransition>
      </VCardText>
    </VCard>

    <TradeDetail
      :trade="selected"
      @close="closeDrawer"
      @force-exit="(trade) => (exitTarget = trade)"
    />

    <ConfirmDialog
      :open="route.name === 'trades' && exitTarget !== null"
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

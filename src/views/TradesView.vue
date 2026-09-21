<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import SideBadge from '@/components/SideBadge.vue'
import TradeDetail from '@/components/TradeDetail.vue'
import { useFormat } from '@/composables/useFormat'
import { pushToast } from '@/composables/useToast'
import { downloadCsv } from '@/lib/csv'
import type { Trade } from '@/lib/types'
import { useBotStore } from '@/stores/bot'

type Filter = 'open' | 'closed' | 'all'
type SortKey = 'open_timestamp' | 'pair' | 'profit_abs' | 'duration' | 'stake_amount'

const { t } = useI18n()
const format = useFormat()
const bot = useBotStore()
const route = useRoute()
const router = useRouter()

const filter = ref<Filter>('all')
const search = ref('')
const result = ref<'all' | 'win' | 'loss'>('all')
const sortKey = ref<SortKey>('open_timestamp')
const sortDir = ref<'asc' | 'desc'>('desc')
const selected = ref<Trade | null>(null)
const exitTarget = ref<Trade | null>(null)
const limit = ref(300)

const stake = computed(() => bot.stakeCurrency)

function durationOf(trade: Trade): number | null {
  const open = format.timestamp(trade.open_timestamp)
  if (open === null) return null
  const close = format.timestamp(trade.close_timestamp) ?? Date.now()
  return close - open
}

const rows = computed(() => {
  const base = filter.value === 'open' ? bot.openTrades : bot.trades
  const query = search.value.trim().toLowerCase()
  return base
    .filter((trade) => {
      if (filter.value === 'all' && trade.is_open === false && query === '') {
        // keep everything; filtering happens below
      }
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

const openCount = computed(() => bot.openTrades.length)
const closedCount = computed(() => bot.profit?.closed_trade_count ?? bot.closedTrades.length)

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
    return
  }
  sortKey.value = key
  sortDir.value = key === 'pair' ? 'asc' : 'desc'
}

function openTrade(trade: Trade) {
  selected.value = trade
  void router.replace({ query: { ...route.query, trade: String(trade.trade_id) } })
}

function closeDrawer() {
  selected.value = null
  const query = { ...route.query }
  delete query.trade
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

async function loadMore() {
  limit.value = Math.min(1000, limit.value + 300)
  await bot.fetchTrades(limit.value)
}

watch(
  () => route.query.trade,
  (value) => {
    if (typeof value === 'string') {
      const id = Number(value)
      const found = bot.trades.find((trade) => trade.trade_id === id)
      if (found) selected.value = found
    }
  },
  { immediate: true },
)

onMounted(() => {
  const value = route.query.trade
  if (typeof value === 'string') {
    const id = Number(value)
    const found =
      bot.trades.find((trade) => trade.trade_id === id) ??
      bot.openTrades.find((trade) => trade.trade_id === id)
    if (found) selected.value = found
  }
})
</script>

<template>
  <div class="stack">
    <section class="panel">
      <div class="panel__head">
        <div class="seg">
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
          </button>
        </div>
        <div class="panel__actions row">
          <label class="search">
            <AppIcon name="search" />
            <input
              v-model="search"
              class="search__input"
              type="search"
              :placeholder="t('market.searchPairs')"
            />
          </label>
          <div class="seg">
            <button
              v-for="option in (['all', 'win', 'loss'] as const)"
              :key="option"
              type="button"
              class="seg__item"
              :aria-pressed="result === option"
              @click="result = option"
            >
              {{ option === 'all' ? t('common.all') : option === 'win' ? t('stats.wins') : t('stats.losses') }}
            </button>
          </div>
          <button type="button" class="btn btn--sm" @click="exportCsv">
            <AppIcon name="download" />
            {{ t('trades.exportCsv') }}
          </button>
        </div>
      </div>

      <div class="panel__body panel__body--flush">
        <div v-if="!rows.length" class="empty">{{ t('empty.table') }}</div>
        <div v-else class="table-wrap u-desktop-only">
          <table class="table table--clickable">
            <thead>
              <tr>
                <th>
                  <button type="button" class="sort" @click="toggleSort('pair')">
                    {{ t('trades.pair') }}
                    <AppIcon
                      v-if="sortKey === 'pair'"
                      :name="sortDir === 'asc' ? 'chevronUp' : 'chevronDown'"
                      :size="12"
                    />
                  </button>
                </th>
                <th class="u-hide-sm side-col">{{ t('trades.side') }}</th>
                <th class="num">
                  <button type="button" class="sort" @click="toggleSort('stake_amount')">
                    {{ t('trades.stake') }}
                    <AppIcon
                      v-if="sortKey === 'stake_amount'"
                      :name="sortDir === 'asc' ? 'chevronUp' : 'chevronDown'"
                      :size="12"
                    />
                  </button>
                </th>
                <th class="num">{{ t('trades.entryPrice') }}</th>
                <th class="num">{{ t('trades.currentPrice') }}</th>
                <th class="num">
                  <button type="button" class="sort" @click="toggleSort('profit_abs')">
                    {{ t('trades.profit') }}
                    <AppIcon
                      v-if="sortKey === 'profit_abs'"
                      :name="sortDir === 'asc' ? 'chevronUp' : 'chevronDown'"
                      :size="12"
                    />
                  </button>
                </th>
                <th class="num">
                  <button type="button" class="sort" @click="toggleSort('duration')">
                    {{ t('trades.duration') }}
                    <AppIcon
                      v-if="sortKey === 'duration'"
                      :name="sortDir === 'asc' ? 'chevronUp' : 'chevronDown'"
                      :size="12"
                    />
                  </button>
                </th>
                <th class="num">
                  <button type="button" class="sort" @click="toggleSort('open_timestamp')">
                    {{ t('trades.openDate') }}
                    <AppIcon
                      v-if="sortKey === 'open_timestamp'"
                      :name="sortDir === 'asc' ? 'chevronUp' : 'chevronDown'"
                      :size="12"
                    />
                  </button>
                </th>
                <th>{{ t('trades.exitReason') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="trade in rows" :key="trade.trade_id" @click="openTrade(trade)">
                <td>
                  <div class="table__pair">
                    <span
                      class="table__side"
                      :class="trade.is_short ? 'table__side--short' : 'table__side--long'"
                    />
                    <span class="num">{{ trade.pair }}</span>
                    <SideBadge class="u-inline-sm" :is-short="trade.is_short" />
                    <span v-if="trade.is_open" class="chip chip--accent">{{ t('trades.open') }}</span>
                  </div>
                </td>
                <td class="u-hide-sm side-col"><SideBadge :is-short="trade.is_short" /></td>
                <td class="num">{{ format.money(trade.stake_amount, stake) }}</td>
                <td class="num">{{ format.price(trade.open_rate) }}</td>
                <td class="num">
                  {{ format.price(trade.current_rate ?? trade.close_rate ?? null) }}
                </td>
                <td class="num" :class="format.toneClass(trade.profit_ratio ?? trade.close_profit)">
                  {{ format.signedMoney(trade.profit_abs ?? trade.close_profit_abs ?? null, stake) }}
                  <div class="small muted">
                    {{ format.ratio(trade.profit_ratio ?? trade.close_profit) }}
                  </div>
                </td>
                <td class="num">{{ format.duration(durationOf(trade)) }}</td>
                <td class="num">{{ format.dateTime(trade.open_timestamp) }}</td>
                <td class="table__muted">{{ trade.exit_reason ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Mobile: a card list beats a horizontally scrolling table. -->
      <ul v-if="rows.length" class="cards u-mobile-only">
        <li v-for="trade in rows" :key="trade.trade_id" class="card" @click="openTrade(trade)">
          <div class="card__row">
            <span
              class="table__side"
              :class="trade.is_short ? 'table__side--short' : 'table__side--long'"
            />
            <span class="num card__pair">{{ trade.pair }}</span>
            <span v-if="trade.is_open" class="chip chip--accent">{{ t('trades.open') }}</span>
            <span class="spacer" />
            <span
              class="num card__pnl"
              :class="format.toneClass(trade.profit_ratio ?? trade.close_profit)"
            >
              {{ format.signedMoney(trade.profit_abs ?? trade.close_profit_abs ?? null, stake) }}
              <small>{{ format.ratio(trade.profit_ratio ?? trade.close_profit) }}</small>
            </span>
          </div>
          <div class="card__row small muted">
            <SideBadge :is-short="trade.is_short" />
            <span class="num">
              {{ format.price(trade.open_rate) }} →
              {{ format.price(trade.current_rate ?? trade.close_rate ?? null) }}
            </span>
            <span class="spacer" />
            <span class="num">{{ format.duration(durationOf(trade)) }}</span>
          </div>
          <div v-if="!trade.is_open && trade.exit_reason" class="card__row small muted">
            <span class="card__reason">{{ trade.exit_reason }}</span>
          </div>
        </li>
      </ul>

      <div v-if="bot.tradesTotal > rows.length" class="panel__head trades__more">
        <span class="panel__meta num">
          {{ t('trades.showing', { shown: rows.length, total: bot.tradesTotal }) }}
        </span>
        <div class="panel__actions">
          <button
            type="button"
            class="btn btn--sm"
            :disabled="bot.actionPending === 'loadMore'"
            @click="loadMore"
          >
            {{ t('trades.loadMore') }}
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
      :title="t('actions.forceExit')"
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
.search {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--ink-900);
  border: 1px solid var(--line-strong);
  border-radius: var(--r-1);
  padding: 4px 8px;
  color: var(--text-3);
}

.search__input {
  border: 0;
  background: transparent;
  padding: 3px 0;
  min-width: 140px;
  color: var(--text);
}

.search__input:focus {
  outline: none;
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

.trades__more {
  border-bottom: 0;
  border-top: 1px solid var(--line);
}

.cards {
  list-style: none;
  margin: 0;
  padding: 0;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: var(--sp-3) var(--sp-4);
  border-bottom: 1px solid var(--line);
}

.card:active {
  background: var(--ink-800);
}

.card__row {
  display: flex;
  align-items: baseline;
  gap: var(--sp-2);
  min-width: 0;
}

.card__pair {
  font-size: var(--fs-base);
}

.card__pnl {
  font-size: var(--fs-md);
}

.card__pnl small {
  font-size: var(--fs-sm);
  margin-left: 4px;
}

.card__reason {
  overflow-wrap: anywhere;
}

@media (max-width: 900px) {
  .panel__head {
    flex-wrap: wrap;
  }

  .panel__actions {
    width: 100%;
    margin-left: 0;
  }
}
</style>

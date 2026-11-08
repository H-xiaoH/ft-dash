<script setup lang="ts">
import { useDocumentVisibility } from '@vueuse/core'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import CandleChart from '@/components/CandleChart.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import FilterMenu, { type FilterOption } from '@/components/FilterMenu.vue'
import SearchToggle from '@/components/SearchToggle.vue'
import type { Candle, CandleEntry, CandleFormatters } from '@/components/charts'
import { useFormat } from '@/composables/useFormat'
import { useChartHeight } from '@/composables/useChartHeight'
import { pushToast } from '@/composables/useToast'
import type { Lock } from '@/lib/types'
import { buildEntryMarker } from '@/lib/positions'
import { useBotStore } from '@/stores/bot'
import { useSettingsStore } from '@/stores/settings'

type Tab = 'whitelist' | 'blacklist' | 'locks'

const { t } = useI18n()
const format = useFormat()
const route = useRoute()
const bot = useBotStore()
const settings = useSettingsStore()

const tab = ref<Tab>('whitelist')
/** The block behind the pair-list tabs, which slides to whichever one is active. */
const search = ref('')
const positionsOnly = ref(false)
const selectedPair = ref(bot.openTrades[0]?.pair ?? bot.whitelist?.whitelist[0] ?? '')
const loadingCandles = ref(false)
const blacklistInput = ref('')
const lockTarget = ref<Lock | null>(null)
const blacklistTarget = ref<string | null>(null)
const candleHeight = useChartHeight(200, 0.32, 340)

/** The bot trades a single timeframe, so it is displayed rather than chosen. */
const timeframe = computed(() => String(bot.showConfig?.timeframe ?? '5m'))

const formatters = computed<CandleFormatters>(() => ({
  locale: format.locale(),
  timezone: settings.timezone,
  price: (value) => format.price(value),
  time: (value) => format.stamp(value),
  tickTime: (value, unit) => format.chartTick(value, unit),
  volume: (value) => format.compact(value),
  change: (ratio) => format.percent(ratio * 100, 2, true),
}))

/** One lookup per render instead of a `find` per cell: the list is a few hundred pairs long. */
const profitByPair = computed(
  () => new Map(bot.performance.map((entry) => [entry.pair, entry.profit_abs])),
)

const openPairs = computed(() => new Set(bot.openTrades.map((trade) => trade.pair)))

const pairOptions = computed<FilterOption[]>(() => {
  const pairs = new Set<string>([...openPairs.value, ...(bot.whitelist?.whitelist ?? [])])
  return [...pairs].map((pair) => ({ value: pair, label: pair }))
})

const whitelistRows = computed(() => {
  const query = search.value.trim().toLowerCase()
  return (bot.whitelist?.whitelist ?? []).filter((pair) => {
    if (positionsOnly.value && !openPairs.value.has(pair)) return false
    if (query && !pair.toLowerCase().includes(query)) return false
    return true
  })
})

const blacklistRows = computed(() => {
  const query = search.value.trim().toLowerCase()
  return (bot.blacklist?.blacklist ?? []).filter((entry) =>
    query ? entry.toLowerCase().includes(query) : true,
  )
})

const lockRows = computed(() => {
  const query = search.value.trim().toLowerCase()
  return (bot.locks?.locks ?? []).filter((lock) => lock.pair.toLowerCase().includes(query))
})

const availablePairKey = computed(() => {
  const pairs = new Set<string>([...openPairs.value, ...(bot.whitelist?.whitelist ?? [])])
  return [...pairs].join('\u0000')
})

const candles = computed<Candle[]>(() => {
  const response = bot.candleCache[`${selectedPair.value}|${timeframe.value}`]
  if (!response) return []
  const index = (name: string) => response.columns.indexOf(name)
  const [o, h, l, c, time, volume] = [
    index('open'),
    index('high'),
    index('low'),
    index('close'),
    index('date'),
    index('volume'),
  ]
  if ([o, h, l, c].some((position) => position === -1)) return []
  return response.data.map((row) => ({
    open: Number(row[o]),
    high: Number(row[h]),
    low: Number(row[l]),
    close: Number(row[c]),
    time: time === -1 ? null : (row[time] as string | number | null),
    volume: volume === -1 ? null : Number(row[volume]),
  }))
})

/**
 * The chart's cost-basis line: where the open position was filled on average, tagged with
 * its floating P&L (the same figure the positions table shows). Null when the pair is flat.
 */
const chartEntry = computed<CandleEntry | null>(() => {
  const marker = buildEntryMarker(
    bot.openTrades.filter((trade) => trade.pair === selectedPair.value),
    candles.value.at(-1)?.close ?? null,
  )
  if (!marker) return null
  return {
    price: marker.price,
    label:
      marker.profit === null
        ? t('market.costBasis')
        : `${t('market.costBasis')} ${format.signedMoney(marker.profit, '')}`,
    tone: marker.tone,
  }
})

/**
 * Whether the router is showing this page. Every page but the one on screen is held on the
 * track and therefore mounted too, so a fetch started on mount would run for a page nobody
 * is looking at: the candles are asked for when this page is the one being walked to.
 */
const visibility = useDocumentVisibility()
let disposed = false
const isCurrentPage = () => !disposed && route.name === 'market' && visibility.value !== 'hidden'
onBeforeUnmount(() => {
  disposed = true
  window.clearTimeout(candleRetryTimer)
})

let candleRequestGeneration = 0
/**
 * The cache keeps the last candles for instant paint when a page is walked back to; this is
 * how old each entry is, so landing on the page refreshes a chart that has gone stale instead
 * of showing the candles from twenty minutes ago for the rest of the session.
 */
const CANDLE_TTL_MS = 30_000
/** Retry failures while the chart is on screen. */
const CANDLE_RETRY_MS = 1_000
const candleFetchedAt = new Map<string, number>()
let candleRetryTimer = 0
const candleKey = (pair: string, currentTimeframe: string) => `${pair}|${currentTimeframe}`
const isCandleStale = (pair: string, currentTimeframe: string) =>
  Date.now() - (candleFetchedAt.get(candleKey(pair, currentTimeframe)) ?? 0) > CANDLE_TTL_MS

async function loadCandles(
  pair: string,
  currentTimeframe: string,
  generation: number,
  isCurrent: () => boolean,
) {
  if (!pair || !isCurrentPage() || !isCurrent()) return
  loadingCandles.value = true
  const result = await bot.fetchCandles(pair, currentTimeframe, 180)
  if (
    !isCurrent() ||
    generation !== candleRequestGeneration ||
    !isCurrentPage() ||
    pair !== selectedPair.value ||
    currentTimeframe !== timeframe.value
  ) {
    return
  }
  loadingCandles.value = false
  window.clearTimeout(candleRetryTimer)
  const hasCandles = !!result?.data.length
  if (hasCandles) candleFetchedAt.set(candleKey(pair, currentTimeframe), Date.now())
  scheduleCandleRefresh(pair, currentTimeframe, hasCandles ? CANDLE_TTL_MS : CANDLE_RETRY_MS)
}

function scheduleCandleRefresh(pair: string, currentTimeframe: string, delay: number) {
  window.clearTimeout(candleRetryTimer)
  candleRetryTimer = window.setTimeout(() => {
    if (!isCurrentPage() || pair !== selectedPair.value) return
    const generation = ++candleRequestGeneration
    void loadCandles(pair, currentTimeframe, generation, () => true)
  }, delay)
}

async function submitBlacklist() {
  const value = blacklistInput.value.trim()
  if (!value) return
  const result = await bot.addBlacklist([value])
  if (result) {
    pushToast(t('actions.sent'), 'good')
    blacklistInput.value = ''
  } else {
    pushToast(t('actions.failed'), 'bad')
  }
}

async function confirmBlacklistDelete() {
  const entry = blacklistTarget.value
  if (!entry) return
  const result = await bot.deleteBlacklist([entry])
  pushToast(result ? t('actions.done') : t('actions.failed'), result ? 'good' : 'bad')
  blacklistTarget.value = null
}

async function confirmLockDelete() {
  const lock = lockTarget.value
  if (!lock) return
  const result = await bot.deleteLock({ lockid: lock.id, pair: lock.pair })
  pushToast(result ? t('actions.done') : t('actions.failed'), result ? 'good' : 'bad')
  lockTarget.value = null
}

watch(
  () => [selectedPair.value, timeframe.value, route.name, visibility.value] as const,
  ([pair, currentTimeframe], _, onCleanup) => {
    if (!pair || !isCurrentPage()) return
    const generation = ++candleRequestGeneration
    let cancelled = false
    onCleanup(() => {
      cancelled = true
      window.clearTimeout(candleRetryTimer)
    })
    const cached = bot.candleCache[candleKey(pair, currentTimeframe)]
    if (!cached || isCandleStale(pair, currentTimeframe)) {
      void loadCandles(pair, currentTimeframe, generation, () => !cancelled)
    } else {
      const age = Date.now() - (candleFetchedAt.get(candleKey(pair, currentTimeframe)) ?? 0)
      scheduleCandleRefresh(pair, currentTimeframe, Math.max(1, CANDLE_TTL_MS - age))
    }
  },
  { immediate: true },
)

watch(
  availablePairKey,
  () => {
    if (pairOptions.value.some((option) => option.value === selectedPair.value)) return
    selectedPair.value = bot.openTrades[0]?.pair ?? bot.whitelist?.whitelist[0] ?? ''
  },
  { immediate: true },
)
</script>

<template>
  <div class="d-flex flex-column ga-4 market-page">
    <!-- Candles come first: pick a pair from the selector here or from the list below. -->
    <VCard tag="section" class="panel">
      <VCardItem class="panel__head">
        <VCardTitle tag="span" class="panel__title">{{ t('market.candleChart') }}</VCardTitle>
        <VChip size="x-small" variant="tonal">{{ timeframe }}</VChip>
        <div class="panel__actions d-flex align-center ga-2 flex-wrap">
          <FilterMenu
            v-model="selectedPair"
            :options="pairOptions"
            :prefix="t('market.pair')"
            :label="t('market.pair')"
            align="end"
          />
        </div>
      </VCardItem>
      <VCardText class="panel__body">
        <div
          class="market__plot"
          :style="{ height: `${candleHeight + 96}px` }"
          :aria-busy="loadingCandles"
        >
          <VSkeletonLoader v-if="!candles.length" type="image" height="100%" />
          <CandleChart
            v-else
            :key="`${settings.activeBotId}|${selectedPair}|${timeframe}`"
            :candles="candles"
            :entry="chartEntry"
            :height="candleHeight"
            :formatters="formatters"
          />
        </div>
      </VCardText>
    </VCard>

    <VCard tag="section" class="panel market__pairs">
      <VCardItem class="panel__head">
        <VBtnToggle v-model="tab" mandatory divided class="page-tabs">
          <VBtn
            type="button"
            variant="outlined"
            :aria-pressed="tab === 'whitelist'"
            value="whitelist"
          >
            {{ t('market.whitelist') }}
            <span class="small muted">{{ bot.whitelist?.whitelist.length ?? 0 }}</span>
          </VBtn>
          <VBtn
            type="button"
            variant="outlined"
            :aria-pressed="tab === 'blacklist'"
            value="blacklist"
          >
            {{ t('market.blacklist') }}
            <span class="small muted">{{ bot.blacklist?.blacklist.length ?? 0 }}</span>
          </VBtn>
          <VBtn type="button" variant="outlined" :aria-pressed="tab === 'locks'" value="locks">
            {{ t('market.locks') }}
            <span class="small muted">{{ bot.locks?.lock_count ?? 0 }}</span>
          </VBtn>
        </VBtnToggle>
        <div class="panel__actions d-flex align-center ga-2 flex-wrap">
          <VSwitch v-if="tab === 'whitelist'" v-model="positionsOnly">
            <template #label
              ><span class="d-flex flex-column"
                ><span>{{ t('market.showOnlyPositions') }}</span></span
              ></template
            >
          </VSwitch>
          <SearchToggle v-model="search" :placeholder="t('market.searchPairs')" />
        </div>
      </VCardItem>

      <!-- Keyboard users need a focus stop to scroll this list (WCAG 2.1.1). -->
      <VCardText
        v-if="tab === 'whitelist'"
        class="panel__body panel__body--flush market__scroll"
        tabindex="0"
        role="region"
        :aria-label="t('market.whitelist')"
      >
        <VEmptyState v-if="!whitelistRows.length" :text="t('empty.table')" class="pa-6" />
        <div v-else class="table-wrap market__whitelist">
          <VTable class="table table--clickable">
            <thead>
              <tr>
                <th scope="col">{{ t('market.pair') }}</th>
                <th scope="col">{{ t('trades.open') }}</th>
                <th scope="col" class="num">{{ t('market.closedProfit') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="pair in whitelistRows"
                :key="pair"
                :class="{ 'is-selected': selectedPair === pair }"
                @click="selectedPair = pair"
              >
                <td>{{ pair }}</td>
                <td>
                  <VChip v-if="openPairs.has(pair)" size="x-small" variant="tonal" color="primary">
                    {{ t('trades.open') }}
                  </VChip>
                  <span v-else class="muted small">—</span>
                </td>
                <td class="num" :class="format.toneClass(profitByPair.get(pair))">
                  {{ format.signedMoney(profitByPair.get(pair) ?? null, bot.stakeCurrency) }}
                </td>
              </tr>
            </tbody>
          </VTable>
        </div>
      </VCardText>

      <VCardText
        v-else-if="tab === 'blacklist'"
        class="panel__body d-flex flex-column ga-4 market__scroll"
        tabindex="0"
        role="region"
        :aria-label="t('market.blacklist')"
      >
        <div v-if="bot.writesAllowed" class="d-flex align-center ga-2 flex-wrap">
          <VTextField
            v-model="blacklistInput"
            class="num"
            :placeholder="t('market.addBlacklistPlaceholder')"
            @keyup.enter="submitBlacklist"
          />
          <VBtn
            color="primary"
            variant="flat"
            type="button"
            :disabled="!blacklistInput.trim() || bot.actionPending === 'blacklistAdd'"
            @click="submitBlacklist"
          >
            <AppIcon name="plus" />
            {{ t('actions.blacklistAdd') }}
          </VBtn>
        </div>
        <p v-if="!bot.writesAllowed" class="small muted">
          {{ t('actions.controlsShortHint') }}
        </p>
        <VEmptyState v-if="!blacklistRows.length" :text="t('empty.table')" class="pa-6" />
        <ul v-else class="blist">
          <li v-for="entry in blacklistRows" :key="entry" class="blist__item">
            <span class="num blist__pattern">{{ entry }}</span>
            <VBtn
              v-if="bot.writesAllowed"
              variant="text"
              type="button"
              @click="blacklistTarget = entry"
            >
              <AppIcon name="trash" />
              {{ t('actions.blacklistRemove') }}
            </VBtn>
          </li>
        </ul>
        <VAlert
          v-if="bot.blacklist?.errors && Object.keys(bot.blacklist.errors).length"
          type="warning"
          variant="tonal"
          :text="t('market.blacklistErrors')"
        />
      </VCardText>

      <!-- Keyboard users need a focus stop to scroll this list (WCAG 2.1.1). -->
      <VCardText
        v-else
        class="panel__body panel__body--flush market__scroll responsive-table responsive-table--short"
        tabindex="0"
        role="region"
        :aria-label="t('market.locks')"
      >
        <VEmptyState v-if="!bot.locks?.locks.length" :text="t('market.noLocks')" class="pa-6" />
        <VEmptyState v-else-if="!lockRows.length" :text="t('empty.table')" class="pa-6" />
        <div v-else class="table-wrap u-desktop-only">
          <VTable class="table">
            <thead>
              <tr>
                <th scope="col">{{ t('market.pair') }}</th>
                <th scope="col">{{ t('market.lockUntil') }}</th>
                <th scope="col">{{ t('market.lockReason') }}</th>
                <th scope="col">{{ t('market.locks') }}</th>
                <th v-if="bot.canDeleteLocks" scope="col" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="lock in lockRows" :key="lock.id">
                <td>{{ lock.pair }}</td>
                <td class="num">{{ format.dateTime(lock.lock_end_timestamp) }}</td>
                <td class="table__muted">{{ lock.reason }}</td>
                <td>
                  <VChip
                    size="x-small"
                    variant="tonal"
                    :color="lock.active ? 'warning' : undefined"
                  >
                    {{ lock.active ? t('market.lockActive') : t('market.lockInactive') }}
                  </VChip>
                </td>
                <td v-if="bot.canDeleteLocks">
                  <VBtn v-if="lock.active" color="error" type="button" @click="lockTarget = lock">
                    <AppIcon name="unlock" />
                    {{ t('actions.deleteLock') }}
                  </VBtn>
                </td>
              </tr>
            </tbody>
          </VTable>
        </div>

        <VList v-if="lockRows.length" role="list" class="lock-details u-mobile-only" lines="three">
          <VListItem v-for="lock in lockRows" :key="lock.id" role="listitem" class="border-b">
            <template #title
              ><span class="num">{{ lock.pair }}</span>
              <VChip size="x-small" variant="tonal" :color="lock.active ? 'warning' : undefined">{{
                lock.active ? t('market.lockActive') : t('market.lockInactive')
              }}</VChip></template
            >
            <template #subtitle
              ><span class="d-block"
                >{{ t('market.lockUntil') }} {{ format.dateTime(lock.lock_end_timestamp) }}</span
              ><span class="d-block">{{ lock.reason }}</span></template
            >
            <template #append
              ><VBtn
                v-if="bot.canDeleteLocks && lock.active"
                color="error"
                @click="lockTarget = lock"
                ><AppIcon name="unlock" />{{ t('actions.deleteLock') }}</VBtn
              ></template
            >
          </VListItem>
        </VList>
      </VCardText>
    </VCard>

    <ConfirmDialog
      :open="route.name === 'market' && blacklistTarget !== null"
      tone="danger"
      :title="bot.labelWithBot(t('actions.blacklistRemove'))"
      :body="blacklistTarget ?? ''"
      :require-text="blacklistTarget ?? ''"
      :required-hint="t('actions.pairConfirm', { pair: blacklistTarget })"
      :confirm-label="t('actions.blacklistRemove')"
      :pending="bot.actionPending === 'blacklistDelete'"
      @cancel="blacklistTarget = null"
      @confirm="confirmBlacklistDelete"
    />

    <ConfirmDialog
      :open="route.name === 'market' && lockTarget !== null"
      tone="danger"
      :title="bot.labelWithBot(t('actions.deleteLock'))"
      :body="
        lockTarget ? `${lockTarget.pair} · ${format.dateTime(lockTarget.lock_end_timestamp)}` : ''
      "
      :require-text="lockTarget?.pair ?? ''"
      :required-hint="t('actions.pairConfirm', { pair: lockTarget?.pair })"
      :confirm-label="t('actions.deleteLock')"
      :pending="bot.actionPending === 'lockDelete'"
      @cancel="lockTarget = null"
      @confirm="confirmLockDelete"
    />
  </div>
</template>

<style scoped>
.lock-details :deep(.v-list-item-subtitle) {
  -webkit-line-clamp: unset;
  white-space: normal;
}
.market-page {
  height: 100%;
}

.market__plot {
  flex: none;
}

.market__plot > .v-skeleton-loader {
  width: 100%;
  height: 100%;
}

.market__plot :deep(.v-skeleton-loader__image) {
  height: 100%;
}

/* Let sticky headers follow the outer list's vertical scroll. */
.market__whitelist {
  overflow: visible;
}

.market__whitelist td:first-child {
  font-family: var(--font-data);
}

.market__pairs {
  flex: 1;
  min-height: 0;
}

.market__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.is-selected {
  background: var(--ink-750);
}

.blist {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.blist__item {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: 6px 0;
  border-bottom: 1px solid var(--line);
}

.blist__pattern {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--fs-sm);
}
</style>

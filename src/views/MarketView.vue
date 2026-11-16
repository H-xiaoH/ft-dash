<script setup lang="ts">
import { useDocumentVisibility } from '@vueuse/core'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import CandleChart from '@/components/CandleChart.vue'
import CandleChartHelp from '@/components/CandleChartHelp.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import FilterMenu, { type FilterOption } from '@/components/FilterMenu.vue'
import MarketPairLists from '@/components/market/MarketPairLists.vue'
import type { Candle, CandleEntry, CandleFormatters } from '@/components/charts'
import { useFormat } from '@/composables/useFormat'
import { useChartHeight } from '@/composables/useChartHeight'
import { pushToast } from '@/composables/useToast'
import type { Lock } from '@/lib/types'
import { buildEntryMarker } from '@/lib/positions'
import { useBotStore } from '@/stores/bot'
import { useSettingsStore } from '@/stores/settings'

const { t } = useI18n()
const format = useFormat()
const route = useRoute()
const bot = useBotStore()
const settings = useSettingsStore()

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
    label: marker.profit === null ? '' : format.signedMoney(marker.profit, ''),
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
    loadingCandles.value = false
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
        <div class="d-inline-flex align-center ga-1">
          <VChip size="x-small" variant="tonal">{{ timeframe }}</VChip>
          <CandleChartHelp />
        </div>
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

    <MarketPairLists
      v-model:blacklist-input="blacklistInput"
      :whitelist="bot.whitelist?.whitelist ?? []"
      :blacklist="bot.blacklist?.blacklist ?? []"
      :blacklist-errors="!!bot.blacklist?.errors && !!Object.keys(bot.blacklist.errors).length"
      :locks="bot.locks?.locks ?? []"
      :lock-count="bot.locks?.lock_count ?? 0"
      :open-pairs="openPairs"
      :profit-by-pair="profitByPair"
      :selected-pair="selectedPair"
      :stake-currency="bot.stakeCurrency"
      :writes-allowed="bot.writesAllowed"
      :can-delete-locks="bot.canDeleteLocks"
      :action-pending="bot.actionPending"
      @select-pair="selectedPair = $event"
      @add-blacklist="submitBlacklist"
      @remove-blacklist="blacklistTarget = $event"
      @remove-lock="lockTarget = $event"
    />

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
</style>

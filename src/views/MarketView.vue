<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import CandleChart from '@/components/CandleChart.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import FilterMenu, { type FilterOption } from '@/components/FilterMenu.vue'
import SearchToggle from '@/components/SearchToggle.vue'
import type { Candle, CandleFormatters } from '@/components/charts'
import { useFormat } from '@/composables/useFormat'
import { useChartHeight } from '@/composables/useChartHeight'
import { pushToast } from '@/composables/useToast'
import type { Lock } from '@/lib/types'
import { useBotStore } from '@/stores/bot'
import { useSettingsStore } from '@/stores/settings'

type Tab = 'whitelist' | 'blacklist' | 'locks'

const { t } = useI18n()
const format = useFormat()
const bot = useBotStore()
const settings = useSettingsStore()

const tab = ref<Tab>('whitelist')
const search = ref('')
const positionsOnly = ref(false)
const selectedPair = ref('')
const loadingCandles = ref(false)
const candleError = ref(false)
const blacklistInput = ref('')
const lockTarget = ref<Lock | null>(null)
const blacklistTarget = ref<string | null>(null)
const candleHeight = useChartHeight(200, 0.32, 340)

/** The bot trades a single timeframe, so it is displayed rather than chosen. */
const timeframe = computed(() => String(bot.showConfig?.timeframe ?? '5m'))

const formatters: CandleFormatters = {
  price: (value) => format.price(value),
  time: (value) => format.stamp(value),
  volume: (value) => format.compact(value),
  change: (ratio) => format.ratio(ratio),
}

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

const candleMeta = computed(
  () => bot.candleCache[`${selectedPair.value}|${timeframe.value}`] ?? null,
)

async function loadCandles() {
  if (!selectedPair.value) return
  loadingCandles.value = true
  candleError.value = false
  const result = await bot.fetchCandles(selectedPair.value, timeframe.value, 180)
  candleError.value = !result
  loadingCandles.value = false
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
  () => [selectedPair.value, timeframe.value],
  () => {
    if (selectedPair.value && !bot.candleCache[`${selectedPair.value}|${timeframe.value}`]) {
      void loadCandles()
    }
  },
)

watch(
  () => bot.whitelist?.whitelist.length,
  () => {
    if (!selectedPair.value) {
      selectedPair.value = bot.openTrades[0]?.pair ?? bot.whitelist?.whitelist[0] ?? ''
    }
  },
)

onMounted(() => {
  selectedPair.value = bot.openTrades[0]?.pair ?? bot.whitelist?.whitelist[0] ?? ''
  if (selectedPair.value) void loadCandles()
})
</script>

<template>
  <div class="stack">
    <!-- Candles come first: pick a pair from the selector here or from the list below. -->
    <section class="panel">
      <div class="panel__head">
        <span class="panel__title">{{ t('market.candleChart') }}</span>
        <span class="chip">{{ timeframe }}</span>
        <div class="panel__actions row row--wrap">
          <FilterMenu
            v-model="selectedPair"
            :options="pairOptions"
            :prefix="t('market.pair')"
            :label="t('market.pair')"
            align="end"
          />
          <span v-if="candleMeta?.last_analyzed_ts" class="panel__meta num">
            {{ t('market.lastAnalyzed') }} {{ format.dateTime(candleMeta.last_analyzed_ts) }}
          </span>
        </div>
      </div>
      <div class="panel__body">
        <p v-if="!selectedPair" class="empty">{{ t('market.noCandles') }}</p>
        <div
          v-else-if="loadingCandles && !candles.length"
          class="skeleton"
          :style="{ height: `${candleHeight}px`, width: '100%' }"
        />
        <p v-else-if="candleError || !candles.length" class="empty">{{ t('market.noCandles') }}</p>
        <CandleChart v-else :candles="candles" :height="candleHeight" :formatters="formatters" />
        <div v-if="candleMeta" class="row row--wrap small muted" style="margin-top: 8px">
          <span>{{ candleMeta.strategy }}</span>
          <span v-if="candleMeta.buy_signals !== undefined">
            · {{ t('market.buySignals') }} {{ candleMeta.buy_signals }}
          </span>
          <span v-if="candleMeta.sell_signals !== undefined">
            · {{ t('market.sellSignals') }} {{ candleMeta.sell_signals }}
          </span>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel__head">
        <div class="seg">
          <button
            type="button"
            class="seg__item"
            :aria-pressed="tab === 'whitelist'"
            @click="tab = 'whitelist'"
          >
            {{ t('market.whitelist') }}
            <span class="small muted">{{ bot.whitelist?.whitelist.length ?? 0 }}</span>
          </button>
          <button
            type="button"
            class="seg__item"
            :aria-pressed="tab === 'blacklist'"
            @click="tab = 'blacklist'"
          >
            {{ t('market.blacklist') }}
            <span class="small muted">{{ bot.blacklist?.blacklist.length ?? 0 }}</span>
          </button>
          <button
            type="button"
            class="seg__item"
            :aria-pressed="tab === 'locks'"
            @click="tab = 'locks'"
          >
            {{ t('market.locks') }}
            <span class="small muted">{{ bot.locks?.lock_count ?? 0 }}</span>
          </button>
        </div>
        <div class="panel__actions row row--wrap">
          <label v-if="tab === 'whitelist'" class="switch">
            <input v-model="positionsOnly" type="checkbox" />
            <span class="switch__track" />
            <span class="switch__text">
              <span class="switch__title small">{{ t('market.showOnlyPositions') }}</span>
            </span>
          </label>
          <SearchToggle v-model="search" :placeholder="t('market.searchPairs')" />
        </div>
      </div>

      <!-- Keyboard users need a focus stop to scroll this list (WCAG 2.1.1). -->
      <div
        v-if="tab === 'whitelist'"
        class="panel__body panel__body--flush market__scroll"
        tabindex="0"
        role="region"
        :aria-label="t('market.whitelist')"
      >
        <div v-if="!whitelistRows.length" class="empty">{{ t('empty.table') }}</div>
        <div v-else class="table-wrap u-desktop-only">
          <table class="table table--clickable">
            <thead>
              <tr>
                <th scope="col">{{ t('market.pair') }}</th>
                <th scope="col">{{ t('trades.open') }}</th>
                <th scope="col" class="num">{{ t('stats.totalProfit') }}</th>
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
                  <span v-if="openPairs.has(pair)" class="chip chip--accent">
                    {{ t('trades.open') }}
                  </span>
                  <span v-else class="muted small">—</span>
                </td>
                <td class="num">
                  {{
                    format.signedMoney(
                      bot.performance.find((entry) => entry.pair === pair)?.profit_abs ?? null,
                      bot.stakeCurrency,
                    )
                  }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <ul v-if="whitelistRows.length" class="cards u-mobile-only">
          <li
            v-for="pair in whitelistRows"
            :key="pair"
            class="card card--tappable"
            @click="selectedPair = pair"
          >
            <div class="card__row">
              <span class="num card__pair">{{ pair }}</span>
              <span v-if="openPairs.has(pair)" class="chip chip--accent">
                {{ t('trades.open') }}
              </span>
              <span class="spacer" />
              <span
                class="num"
                :class="
                  format.toneClass(bot.performance.find((entry) => entry.pair === pair)?.profit_abs)
                "
              >
                {{
                  format.signedMoney(
                    bot.performance.find((entry) => entry.pair === pair)?.profit_abs ?? null,
                    bot.stakeCurrency,
                  )
                }}
              </span>
            </div>
          </li>
        </ul>
      </div>

      <div v-else-if="tab === 'blacklist'" class="panel__body stack">
        <div v-if="settings.writesEnabled" class="row row--wrap">
          <input
            v-model="blacklistInput"
            class="input num"
            :placeholder="t('market.addBlacklistPlaceholder')"
            @keyup.enter="submitBlacklist"
          />
          <button
            type="button"
            class="btn btn--primary"
            :disabled="!blacklistInput.trim() || bot.actionPending === 'blacklistAdd'"
            @click="submitBlacklist"
          >
            <AppIcon name="plus" />
            {{ t('actions.blacklistAdd') }}
          </button>
        </div>
        <p v-if="!settings.writesEnabled" class="small muted">
          {{ t('actions.controlsDisabledHint') }}
        </p>
        <div v-if="!blacklistRows.length" class="empty">{{ t('empty.table') }}</div>
        <ul v-else class="blist">
          <li v-for="entry in blacklistRows" :key="entry" class="blist__item">
            <span class="num blist__pattern">{{ entry }}</span>
            <button
              v-if="settings.writesEnabled"
              type="button"
              class="btn btn--sm btn--ghost"
              @click="blacklistTarget = entry"
            >
              <AppIcon name="trash" />
              {{ t('actions.blacklistRemove') }}
            </button>
          </li>
        </ul>
        <p
          v-if="bot.blacklist?.errors && Object.keys(bot.blacklist.errors).length"
          class="banner banner--warn"
        >
          {{ t('market.blacklistErrors') }}
        </p>
      </div>

      <div v-else class="panel__body panel__body--flush">
        <div v-if="!bot.locks?.locks.length" class="empty">{{ t('market.noLocks') }}</div>
        <div v-else class="table-wrap u-desktop-only">
          <table class="table">
            <thead>
              <tr>
                <th scope="col">{{ t('market.pair') }}</th>
                <th scope="col">{{ t('market.lockUntil') }}</th>
                <th scope="col">{{ t('market.lockReason') }}</th>
                <th scope="col">{{ t('market.locks') }}</th>
                <th v-if="settings.writesEnabled" scope="col" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="lock in bot.locks.locks" :key="lock.id">
                <td>{{ lock.pair }}</td>
                <td class="num">{{ format.dateTime(lock.lock_end_timestamp) }}</td>
                <td class="table__muted">{{ lock.reason }}</td>
                <td>
                  <span class="chip" :class="lock.active ? 'chip--warn' : ''">
                    {{ lock.active ? t('market.lockActive') : t('market.lockInactive') }}
                  </span>
                </td>
                <td v-if="settings.writesEnabled">
                  <button type="button" class="btn btn--sm btn--danger" @click="lockTarget = lock">
                    <AppIcon name="unlock" />
                    {{ t('actions.deleteLock') }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <ul v-if="bot.locks?.locks.length" class="cards u-mobile-only">
          <li v-for="lock in bot.locks.locks" :key="lock.id" class="card">
            <div class="card__row">
              <span class="num card__pair">{{ lock.pair }}</span>
              <span class="chip" :class="lock.active ? 'chip--warn' : ''">
                {{ lock.active ? t('market.lockActive') : t('market.lockInactive') }}
              </span>
              <span class="spacer" />
              <button
                v-if="settings.writesEnabled"
                type="button"
                class="btn btn--sm btn--danger"
                @click="lockTarget = lock"
              >
                <AppIcon name="unlock" />
                {{ t('actions.deleteLock') }}
              </button>
            </div>
            <div class="card__row small muted">
              <span
                >{{ t('market.lockUntil') }} {{ format.dateTime(lock.lock_end_timestamp) }}</span
              >
            </div>
            <div class="card__row small muted">
              <span>{{ lock.reason }}</span>
            </div>
          </li>
        </ul>
      </div>
    </section>

    <ConfirmDialog
      :open="blacklistTarget !== null"
      tone="danger"
      :title="t('actions.blacklistRemove')"
      :body="blacklistTarget ?? ''"
      :confirm-label="t('actions.blacklistRemove')"
      :pending="bot.actionPending === 'blacklistDelete'"
      @cancel="blacklistTarget = null"
      @confirm="confirmBlacklistDelete"
    />

    <ConfirmDialog
      :open="lockTarget !== null"
      tone="danger"
      :title="t('actions.deleteLock')"
      :body="
        lockTarget ? `${lockTarget.pair} · ${format.dateTime(lockTarget.lock_end_timestamp)}` : ''
      "
      :confirm-label="t('actions.deleteLock')"
      :pending="bot.actionPending === 'lockDelete'"
      @cancel="lockTarget = null"
      @confirm="confirmLockDelete"
    />
  </div>
</template>

<style scoped>
/* Toolbar controls drop to a second line instead of squeezing the tabs. */
.panel__head {
  flex-wrap: wrap;
  row-gap: var(--sp-2);
}

.seg {
  flex: none;
}

.market__scroll {
  max-height: 62vh;
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
  max-height: min(420px, 50vh);
  overflow-y: auto;
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

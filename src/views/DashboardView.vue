<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import BarChart from '@/components/BarChart.vue'
import type { BarItem } from '@/components/charts'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import EventTape from '@/components/EventTape.vue'
import MetricTile from '@/components/MetricTile.vue'
import SideBadge from '@/components/SideBadge.vue'
import Sparkline from '@/components/Sparkline.vue'
import { useFormat } from '@/composables/useFormat'
import { pushToast } from '@/composables/useToast'
import { toIsoDate } from '@/lib/format'
import type { Trade } from '@/lib/types'
import { useBotStore } from '@/stores/bot'
import { useSettingsStore } from '@/stores/settings'

const { t } = useI18n()
const format = useFormat()
const bot = useBotStore()
const settings = useSettingsStore()
const router = useRouter()

const exitTarget = ref<Trade | null>(null)

const stake = computed(() => bot.stakeCurrency)
const stakeCurrencyRow = computed(() =>
  bot.balance?.currencies.find((currency) => currency.currency === bot.balance?.stake),
)
const available = computed(
  () => stakeCurrencyRow.value?.free ?? bot.balance?.total_bot ?? bot.balance?.total ?? null,
)
const positionValue = computed(() => {
  const rows = bot.balance?.currencies.filter((currency) => currency.is_position) ?? []
  return rows.reduce((sum, row) => sum + (row.est_stake ?? 0), 0)
})

const dailySeries = computed(() => {
  const rows = bot.daily?.data ?? []
  return [...rows].reverse()
})

const todayPnl = computed(() => {
  const today = toIsoDate()
  const row = dailySeries.value.find((entry) => entry.date === today)
  return row ? row.abs_profit : null
})

const cumulative = computed(() => {
  let running = 0
  return dailySeries.value.map((entry) => {
    running += entry.abs_profit
    return running
  })
})

const bars = computed<BarItem[]>(() =>
  dailySeries.value.slice(-30).map((entry) => ({
    label: entry.date.slice(5),
    tooltip: format.day(entry.date),
    value: entry.abs_profit,
    display: format.signedMoney(entry.abs_profit, stake.value),
    sub: `${entry.trade_count} ${t('stats.tradeCount')}`,
  })),
)

const performanceSorted = computed(() =>
  [...bot.performance].sort((a, b) => b.profit_abs - a.profit_abs),
)
const topPairs = computed(() => performanceSorted.value.slice(0, 5))
const worstPairs = computed(() =>
  performanceSorted.value
    .filter((entry) => entry.profit_abs < 0)
    .slice(-5)
    .reverse(),
)

const winRate = computed(() => {
  const profit = bot.profit
  if (!profit) return null
  const total = profit.winning_trades + profit.losing_trades
  return total > 0 ? (profit.winning_trades / total) * 100 : null
})

function durationOf(trade: Trade): number | null {
  const open = format.timestamp(trade.open_timestamp)
  const close = format.timestamp(trade.close_timestamp) ?? Date.now()
  if (open === null) return null
  return close - open
}

async function confirmExit() {
  const trade = exitTarget.value
  if (!trade) return
  const result = await bot.forceExit(trade.trade_id, 'market')
  if (result) pushToast(t('actions.sent'), 'good')
  else pushToast(t('actions.failed'), 'bad')
  exitTarget.value = null
}
</script>

<template>
  <div class="stack">
    <div class="metric-grid">
      <MetricTile
        :label="t('kpi.equity')"
        :value="bot.balance?.total ?? null"
        kind="money"
        :currency="bot.balance?.stake ?? stake"
      >
        <Sparkline :values="cumulative.slice(-30)" :height="26" />
      </MetricTile>
      <MetricTile
        :label="t('kpi.availableBalance')"
        :value="available"
        kind="money"
        :currency="stake"
        :sub="`${t('kpi.botManaged')} ${format.money(bot.balance?.total_bot ?? null, stake)}`"
      />
      <MetricTile
        :label="t('kpi.positionValue')"
        :value="positionValue"
        kind="money"
        :currency="stake"
        :sub="`${bot.count?.current ?? bot.openTrades.length} / ${bot.count?.max ?? bot.showConfig?.max_open_trades ?? 0}`"
      />
      <MetricTile
        :label="t('kpi.openPnl')"
        :value="(bot.profit?.profit_all_coin ?? 0) - (bot.profit?.profit_closed_coin ?? 0)"
        kind="money"
        :currency="stake"
        tone="auto"
        signed
        :sub="t('kpi.unrealized')"
      />
      <MetricTile
        :label="t('kpi.totalPnl')"
        :value="bot.profit?.profit_all_coin ?? null"
        kind="money"
        :currency="stake"
        tone="auto"
        signed
        :sub="format.ratio(bot.profit?.profit_all_ratio ?? null)"
      />
      <MetricTile
        :label="t('kpi.todayPnl')"
        :value="todayPnl"
        kind="money"
        :currency="stake"
        tone="auto"
        signed
      />
      <MetricTile
        :label="t('kpi.winRate')"
        :value="winRate"
        kind="percent"
        :sub="format.number(bot.profit?.expectancy ?? null, 3)"
      />
      <MetricTile
        :label="t('kpi.trades')"
        :value="bot.profit?.trade_count ?? null"
        kind="number"
        :digits="0"
        :sub="`${bot.profit?.winning_trades ?? 0} / ${bot.profit?.losing_trades ?? 0}`"
      />
      <MetricTile
        :label="t('kpi.maxDrawdown')"
        :value="(bot.profit?.max_drawdown ?? null) === null ? null : (bot.profit?.max_drawdown ?? 0) * 100"
        kind="percent"
        :sub="t('kpi.currentDrawdown') + ' ' + format.percent((bot.profit?.current_drawdown ?? null) === null ? null : (bot.profit?.current_drawdown ?? 0) * 100)"
      />
      <MetricTile
        :label="t('kpi.profitFactor')"
        :value="bot.profit?.profit_factor ?? null"
        kind="number"
        :sub="`${t('kpi.sharpe')} ${format.number(bot.profit?.sharpe ?? null, 2)}`"
      />
    </div>

    <div class="dash__grid">
      <div class="dash__main stack">
        <section class="panel">
          <div class="panel__head">
            <span class="panel__title">{{ t('dashboard.dailyPnl') }}</span>
            <span class="panel__meta num">
              {{ format.money(bot.balance?.starting_capital ?? null, stake) }} →
              {{ format.money(bot.balance?.total ?? null, stake) }}
            </span>
            <div class="panel__actions">
              <button type="button" class="link-btn small" @click="router.push('/stats')">
                {{ t('dashboard.viewAll') }}
              </button>
            </div>
          </div>
          <div class="panel__body">
            <BarChart
              v-if="bars.length"
              :items="bars"
              :height="180"
              :unit="stake"
              :axis-format="(value: number) => format.money(value, '', 2)"
            />
            <p v-else class="empty">{{ t('stats.noData') }}</p>
          </div>
        </section>

        <section class="panel">
          <div class="panel__head">
            <span class="panel__title">{{ t('dashboard.openPositions') }}</span>
            <span class="chip">{{ bot.openTrades.length }}</span>
            <div class="panel__actions">
              <button type="button" class="link-btn small" @click="router.push('/trades')">
                {{ t('dashboard.viewAll') }}
              </button>
            </div>
          </div>
          <div class="panel__body panel__body--flush">
            <div v-if="!bot.openTrades.length" class="empty">{{ t('dashboard.noPositions') }}</div>
            <div v-else class="table-wrap">
              <table class="table table--clickable">
                <thead>
                  <tr>
                    <th>{{ t('trades.pair') }}</th>
                    <th class="u-hide-sm side-col">{{ t('trades.side') }}</th>
                    <th class="num u-hide-sm">{{ t('trades.entryPrice') }}</th>
                    <th class="num">{{ t('trades.currentPrice') }}</th>
                    <th class="num u-hide-sm">{{ t('trades.stake') }}</th>
                    <th class="num">{{ t('kpi.unrealized') }}</th>
                    <th class="num">{{ t('trades.duration') }}</th>
                    <th v-if="settings.writesEnabled" />
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="trade in bot.openTrades"
                    :key="trade.trade_id"
                    @click="router.push({ path: '/trades', query: { trade: String(trade.trade_id) } })"
                  >
                    <td>
                      <div class="table__pair">
                        <span
                          class="table__side"
                          :class="trade.is_short ? 'table__side--short' : 'table__side--long'"
                        />
                        <span class="num">{{ trade.pair }}</span>
                        <SideBadge
                          class="u-inline-sm"
                          :is-short="trade.is_short"
                        />
                        <span v-if="trade.leverage && trade.leverage > 1" class="chip">
                          {{ trade.leverage }}x
                        </span>
                      </div>
                    </td>
                    <td class="u-hide-sm side-col"><SideBadge :is-short="trade.is_short" /></td>
                    <td class="num u-hide-sm">{{ format.price(trade.open_rate) }}</td>
                    <td class="num">{{ format.price(trade.current_rate ?? trade.open_rate) }}</td>
                    <td class="num u-hide-sm">{{ format.money(trade.stake_amount, stake) }}</td>
                    <td class="num" :class="format.toneClass(trade.profit_ratio)">
                      {{ format.signedMoney(trade.profit_abs ?? 0, stake) }}
                      <div class="small muted">{{ format.ratio(trade.profit_ratio) }}</div>
                    </td>
                    <td class="num">{{ format.duration(durationOf(trade)) }}</td>
                    <td v-if="settings.writesEnabled">
                      <button
                        type="button"
                        class="btn btn--sm btn--danger"
                        @click.stop="exitTarget = trade"
                      >
                        {{ t('actions.forceExit') }}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel__head">
            <span class="panel__title">{{ t('dashboard.recentTrades') }}</span>
            <div class="panel__actions">
              <button type="button" class="link-btn small" @click="router.push('/trades')">
                {{ t('dashboard.viewAll') }}
              </button>
            </div>
          </div>
          <div class="panel__body panel__body--flush">
            <div v-if="!bot.recentClosed.length" class="empty">{{ t('trades.noClosed') }}</div>
            <div v-else class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>{{ t('trades.pair') }}</th>
                    <th class="u-hide-sm side-col">{{ t('trades.side') }}</th>
                    <th class="num">{{ t('trades.profit') }}</th>
                    <th class="num u-hide-sm">{{ t('trades.exitPrice') }}</th>
                    <th class="u-hide-sm">{{ t('trades.exitReason') }}</th>
                    <th class="num">{{ t('trades.duration') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="trade in bot.recentClosed" :key="trade.trade_id">
                    <td>
                      <div class="table__pair">
                        <span
                          class="table__side"
                          :class="trade.is_short ? 'table__side--short' : 'table__side--long'"
                        />
                        <span class="num">{{ trade.pair }}</span>
                        <SideBadge class="u-inline-sm" :is-short="trade.is_short" />
                      </div>
                    </td>
                    <td class="u-hide-sm side-col"><SideBadge :is-short="trade.is_short" /></td>
                    <td class="num" :class="format.toneClass(trade.profit_ratio)">
                      {{ format.signedMoney(trade.profit_abs ?? 0, stake) }}
                      <div class="small muted">{{ format.ratio(trade.profit_ratio) }}</div>
                    </td>
                    <td class="num u-hide-sm">{{ format.price(trade.close_rate ?? null) }}</td>
                    <td class="table__muted u-hide-sm">{{ trade.exit_reason ?? '—' }}</td>
                    <td class="num">{{ format.duration(durationOf(trade)) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      <aside class="dash__aside stack">
        <div class="u-mobile-only">
          <EventTape compact />
        </div>

        <section class="panel">
          <div class="panel__head">
            <span class="panel__title">{{ t('dashboard.topPairs') }}</span>
          </div>
          <div class="panel__body stack--tight">
            <div v-if="!topPairs.length" class="empty">{{ t('stats.noData') }}</div>
            <div v-for="pair in topPairs" :key="pair.pair" class="pairs__row">
              <span class="num pairs__name">{{ pair.pair }}</span>
              <span class="num" :class="format.toneClass(pair.profit_abs)">
                {{ format.signedMoney(pair.profit_abs, stake) }}
              </span>
              <span class="num small muted">{{ format.ratio(pair.profit_ratio) }}</span>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel__head">
            <span class="panel__title">{{ t('dashboard.worstPairs') }}</span>
          </div>
          <div class="panel__body stack--tight">
            <div v-if="!worstPairs.length" class="empty">{{ t('dashboard.noLosers') }}</div>
            <div v-for="pair in worstPairs" :key="pair.pair" class="pairs__row">
              <span class="num pairs__name">{{ pair.pair }}</span>
              <span class="num" :class="format.toneClass(pair.profit_abs)">
                {{ format.signedMoney(pair.profit_abs, stake) }}
              </span>
              <span class="num small muted">{{ format.ratio(pair.profit_ratio) }}</span>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel__head">
            <span class="panel__title">{{ t('system.health') }}</span>
          </div>
          <div class="panel__body">
            <dl class="dl">
              <dt>{{ t('system.uptime') }}</dt>
              <dd>{{ format.duration(bot.health ? Date.now() - (format.timestamp(bot.health.bot_startup_ts) ?? Date.now()) : null) }}</dd>
              <dt>{{ t('system.botStartup') }}</dt>
              <dd>{{ format.dateTime(bot.health?.bot_startup ?? null) }}</dd>
              <dt>{{ t('system.lastProcess') }}</dt>
              <dd>{{ format.dateTime(bot.health?.last_process ?? null) }}</dd>
              <dt>{{ t('stats.avgWinDuration') }}</dt>
              <dd>{{ format.duration(bot.tradeStats?.durations?.wins ?? null) }}</dd>
              <dt>{{ t('stats.avgLossDuration') }}</dt>
              <dd>{{ format.duration(bot.tradeStats?.durations?.losses ?? null) }}</dd>
            </dl>
          </div>
        </section>

        <section v-if="bot.count" class="panel">
          <div class="panel__head">
            <span class="panel__title">{{ t('kpi.openTrades') }}</span>
          </div>
          <div class="panel__body">
            <div class="meter">
              <div
                class="meter__fill"
                :class="bot.count.current >= bot.count.max ? 'meter__fill--warn' : 'meter__fill--good'"
                :style="{ width: `${bot.count.max ? (bot.count.current / bot.count.max) * 100 : 0}%` }"
              />
            </div>
            <p class="small muted" style="margin-top: 8px">
              {{ bot.count.current }} / {{ bot.count.max }} ·
              {{ format.money(bot.count.total_stake, stake) }}
            </p>
          </div>
        </section>
      </aside>
    </div>

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
.dash__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: var(--sp-4);
  align-items: start;
}

.dash__main,
.dash__aside {
  min-width: 0;
}

.pairs__row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: var(--sp-3);
  align-items: baseline;
  padding: 4px 0;
}

.pairs__name {
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 1080px) {
  .dash__grid {
    grid-template-columns: 1fr;
  }
}
</style>

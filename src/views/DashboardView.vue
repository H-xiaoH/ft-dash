<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import BarChart from '@/components/BarChart.vue'
import type { BarItem } from '@/components/charts'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import MetricTile from '@/components/MetricTile.vue'
import SideBadge from '@/components/SideBadge.vue'
import Sparkline from '@/components/Sparkline.vue'
import { useFormat } from '@/composables/useFormat'
import { pushToast } from '@/composables/useToast'
import { useChartHeight } from '@/composables/useChartHeight'
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
const pnlChartHeight = useChartHeight(150, 0.2, 230)

const stake = computed(() => bot.stakeCurrency)

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
        :label="t('kpi.trades')"
        :value="bot.profit?.trade_count ?? null"
        kind="number"
        :digits="0"
        :sub="`${bot.profit?.winning_trades ?? 0} / ${bot.profit?.losing_trades ?? 0}`"
      />
      <MetricTile
        :label="t('kpi.profitFactor')"
        :value="bot.profit?.profit_factor ?? null"
        kind="number"
        :sub="`${t('kpi.sharpe')} ${format.number(bot.profit?.sharpe ?? null, 2)}`"
      />
    </div>

    <div class="stack">
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
            :height="pnlChartHeight"
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
                  <th scope="col">{{ t('trades.pair') }}</th>
                  <th scope="col" class="u-hide-sm side-col">{{ t('trades.side') }}</th>
                  <th scope="col" class="num u-hide-sm">{{ t('trades.entryPrice') }}</th>
                  <th scope="col" class="num">{{ t('trades.currentPrice') }}</th>
                  <th scope="col" class="num u-hide-sm">{{ t('trades.stake') }}</th>
                  <th scope="col" class="num">{{ t('kpi.unrealized') }}</th>
                  <th scope="col" class="num">{{ t('trades.duration') }}</th>
                  <th v-if="settings.writesEnabled" scope="col" />
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="trade in bot.openTrades"
                  :key="trade.trade_id"
                  @click="
                    router.push({ path: '/trades', query: { trade: String(trade.trade_id) } })
                  "
                >
                  <td>
                    <div class="table__pair">
                      <span
                        class="table__side"
                        :class="trade.is_short ? 'table__side--short' : 'table__side--long'"
                      />
                      <span class="num">{{ trade.pair }}</span>
                      <SideBadge class="u-inline-sm" :is-short="trade.is_short" />
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
          <div v-if="!bot.closedByRecency.length" class="empty">{{ t('trades.noClosed') }}</div>
          <div v-else class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th scope="col">{{ t('trades.pair') }}</th>
                  <th scope="col" class="u-hide-sm side-col">{{ t('trades.side') }}</th>
                  <th scope="col" class="num">{{ t('trades.profit') }}</th>
                  <th scope="col" class="num u-hide-sm">{{ t('trades.exitPrice') }}</th>
                  <th scope="col" class="num">{{ t('trades.duration') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="trade in bot.closedByRecency" :key="trade.trade_id">
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
                  <td class="num">{{ format.duration(durationOf(trade)) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
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
@media (max-width: 1080px) {
  .dash__grid {
    grid-template-columns: 1fr;
  }
}
</style>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import BarChart from '@/components/BarChart.vue'
import type { BarItem } from '@/components/charts'
import { useFormat } from '@/composables/useFormat'
import { useBotStore } from '@/stores/bot'

type Tab = 'pairs' | 'entries' | 'exits' | 'mix'
type Period = 'daily' | 'weekly' | 'monthly'

interface Row {
  key: string
  count: number
  profitAbs: number
  profitRatio: number
}

const { t } = useI18n()
const format = useFormat()
const bot = useBotStore()

const tab = ref<Tab>('pairs')
const period = ref<Period>('daily')
const limit = ref(20)

const stake = computed(() => bot.stakeCurrency)

const rows = computed<Row[]>(() => {
  switch (tab.value) {
    case 'entries':
      return bot.entryStats.map((entry) => ({
        key: entry.enter_tag.trim() || '—',
        count: entry.count,
        profitAbs: entry.profit_abs,
        profitRatio: entry.profit_ratio,
      }))
    case 'exits':
      return bot.exitStats.map((entry) => ({
        key: entry.exit_reason,
        count: entry.count,
        profitAbs: entry.profit_abs,
        profitRatio: entry.profit_ratio,
      }))
    case 'mix':
      return bot.mixTags.map((entry) => ({
        key: entry.mix_tag,
        count: entry.count,
        profitAbs: entry.profit_abs,
        profitRatio: entry.profit_ratio,
      }))
    default:
      return bot.performance.map((entry) => ({
        key: entry.pair,
        count: entry.count,
        profitAbs: entry.profit_abs,
        profitRatio: entry.profit_ratio,
      }))
  }
})

const sortedRows = computed(() =>
  [...rows.value].sort((a, b) => b.profitAbs - a.profitAbs).slice(0, limit.value),
)

const periodData = computed(() => {
  const source = period.value === 'daily' ? bot.daily : period.value === 'weekly' ? bot.weekly : bot.monthly
  return source?.data ?? []
})

const periodBars = computed<BarItem[]>(() =>
  [...periodData.value]
    .reverse()
    .slice(-30)
    .map((entry) => ({
      label: entry.date.slice(5),
      value: entry.abs_profit,
      display: format.signedMoney(entry.abs_profit, stake.value),
      sub: `${entry.trade_count} ${t('stats.tradeCount')}`,
    })),
)

const exitReasonRows = computed(() =>
  Object.entries(bot.tradeStats?.exit_reasons ?? {})
    .map(([reason, stats]) => ({
      reason,
      wins: stats.wins ?? 0,
      losses: stats.losses ?? 0,
      draws: stats.draws ?? 0,
      total: (stats.wins ?? 0) + (stats.losses ?? 0) + (stats.draws ?? 0),
    }))
    .sort((a, b) => b.total - a.total),
)

const summary = computed(() => bot.profit)

const groupLabel = computed(() => {
  switch (tab.value) {
    case 'entries':
      return t('stats.byEnterTag')
    case 'exits':
      return t('stats.byExitReason')
    case 'mix':
      return t('stats.byMixTag')
    default:
      return t('stats.byPair')
  }
})
</script>

<template>
  <div class="stack">
    <div class="metric-grid stats__summary">
      <div class="metric">
        <span class="metric__label">{{ t('kpi.totalPnl') }}</span>
        <span class="metric__value" :class="format.toneClass(summary?.profit_all_coin)">
          {{ format.signedMoney(summary?.profit_all_coin ?? null, '', 2) }}
          <span class="metric__unit">{{ stake }}</span>
        </span>
        <span class="metric__sub">{{ format.ratio(summary?.profit_all_ratio ?? null) }}</span>
      </div>
      <div class="metric">
        <span class="metric__label">{{ t('kpi.closedPnl') }}</span>
        <span class="metric__value" :class="format.toneClass(summary?.profit_closed_coin)">
          {{ format.signedMoney(summary?.profit_closed_coin ?? null, '', 2) }}
          <span class="metric__unit">{{ stake }}</span>
        </span>
        <span class="metric__sub">{{ format.ratio(summary?.profit_closed_ratio ?? null) }}</span>
      </div>
      <div class="metric">
        <span class="metric__label">{{ t('stats.wins') }} / {{ t('stats.losses') }}</span>
        <span class="metric__value">
          {{ summary?.winning_trades ?? 0 }} / {{ summary?.losing_trades ?? 0 }}
        </span>
        <span class="metric__sub">
          {{ t('kpi.winRate') }}
          {{
            format.percent(
              summary && summary.winning_trades + summary.losing_trades > 0
                ? (summary.winning_trades / (summary.winning_trades + summary.losing_trades)) * 100
                : null,
            )
          }}
        </span>
      </div>
      <div class="metric">
        <span class="metric__label">{{ t('kpi.profitFactor') }}</span>
        <span class="metric__value">{{ format.number(summary?.profit_factor ?? null) }}</span>
        <span class="metric__sub">
          {{ t('kpi.expectancy') }} {{ format.number(summary?.expectancy ?? null, 3) }}
        </span>
      </div>
      <div class="metric">
        <span class="metric__label">{{ t('kpi.sharpe') }} / {{ t('kpi.sortino') }}</span>
        <span class="metric__value metric__value--sm">
          {{ format.number(summary?.sharpe ?? null) }} / {{ format.number(summary?.sortino ?? null) }}
        </span>
        <span class="metric__sub">
          {{ t('kpi.sqn') }} {{ format.number(summary?.sqn ?? null) }} · {{ t('kpi.calmar') }}
          {{ format.number(summary?.calmar ?? null) }}
        </span>
      </div>
      <div class="metric">
        <span class="metric__label">{{ t('kpi.maxDrawdown') }}</span>
        <span class="metric__value u-neg">
          {{ format.percent((summary?.max_drawdown ?? null) === null ? null : (summary?.max_drawdown ?? 0) * 100) }}
        </span>
        <span class="metric__sub">
          {{ t('kpi.currentDrawdown') }}
          {{
            format.percent(
              (summary?.current_drawdown ?? null) === null
                ? null
                : (summary?.current_drawdown ?? 0) * 100,
            )
          }}
        </span>
      </div>
      <div class="metric">
        <span class="metric__label">{{ t('kpi.avgDuration') }}</span>
        <span class="metric__value metric__value--sm">{{ summary?.avg_duration ?? '—' }}</span>
        <span class="metric__sub">{{ t('kpi.tradingVolume') }} {{ format.compact(summary?.trading_volume ?? null) }}</span>
      </div>
      <div class="metric">
        <span class="metric__label">{{ t('kpi.bestPair') }}</span>
        <span class="metric__value metric__value--sm">{{ summary?.best_pair ?? '—' }}</span>
        <span class="metric__sub">{{ format.ratio(summary?.best_pair_profit_ratio ?? null) }}</span>
      </div>
    </div>

    <section class="panel">
      <div class="panel__head">
        <span class="panel__title">{{ t('stats.title') }}</span>
        <div class="seg">
          <button type="button" class="seg__item" :aria-pressed="tab === 'pairs'" @click="tab = 'pairs'">
            {{ t('stats.byPair') }}
          </button>
          <button type="button" class="seg__item" :aria-pressed="tab === 'entries'" @click="tab = 'entries'">
            {{ t('stats.byEnterTag') }}
          </button>
          <button type="button" class="seg__item" :aria-pressed="tab === 'exits'" @click="tab = 'exits'">
            {{ t('stats.byExitReason') }}
          </button>
          <button type="button" class="seg__item" :aria-pressed="tab === 'mix'" @click="tab = 'mix'">
            {{ t('stats.byMixTag') }}
          </button>
        </div>
      </div>
      <div class="panel__body panel__body--flush">
        <div v-if="!sortedRows.length" class="empty">{{ t('stats.noData') }}</div>
        <div v-else class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>{{ groupLabel }}</th>
                <th class="num">{{ t('stats.count') }}</th>
                <th class="num">{{ t('stats.totalProfit') }}</th>
                <th class="num">{{ t('stats.avgProfit') }}</th>
                <th class="num">{{ t('stats.winRate') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in sortedRows" :key="row.key">
                <td class="num">{{ row.key }}</td>
                <td class="num">{{ row.count }}</td>
                <td class="num" :class="format.toneClass(row.profitAbs)">
                  {{ format.signedMoney(row.profitAbs, stake) }}
                </td>
                <td class="num" :class="format.toneClass(row.profitAbs)">
                  {{ format.ratio(row.count ? row.profitRatio : null) }}
                </td>
                <td class="num">
                  <div class="meter">
                    <div
                      class="meter__fill"
                      :class="row.profitAbs >= 0 ? 'meter__fill--good' : 'meter__fill--bad'"
                      :style="{ width: `${Math.min(100, Math.abs(row.profitRatio) * 400)}%` }"
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel__head">
        <span class="panel__title">{{ t('stats.period') }}</span>
        <div class="seg">
          <button type="button" class="seg__item" :aria-pressed="period === 'daily'" @click="period = 'daily'">
            {{ t('stats.daily') }}
          </button>
          <button type="button" class="seg__item" :aria-pressed="period === 'weekly'" @click="period = 'weekly'">
            {{ t('stats.weekly') }}
          </button>
          <button type="button" class="seg__item" :aria-pressed="period === 'monthly'" @click="period = 'monthly'">
            {{ t('stats.monthly') }}
          </button>
        </div>
      </div>
      <div class="panel__body">
        <BarChart v-if="periodBars.length" :items="periodBars" :height="150" />
        <p v-else class="empty">{{ t('stats.noData') }}</p>
      </div>
      <div class="panel__body panel__body--flush">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>{{ t('stats.period') }}</th>
                <th class="num">{{ t('stats.profitAbs') }}</th>
                <th class="num">{{ t('stats.relProfit') }}</th>
                <th class="num">{{ t('stats.tradeCount') }}</th>
                <th class="num">{{ t('stats.startingBalance') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in periodData.slice(0, 12)" :key="entry.date">
                <td class="num">{{ entry.date }}</td>
                <td class="num" :class="format.toneClass(entry.abs_profit)">
                  {{ format.signedMoney(entry.abs_profit, stake) }}
                </td>
                <td class="num" :class="format.toneClass(entry.rel_profit)">
                  {{ format.ratio(entry.rel_profit) }}
                </td>
                <td class="num">{{ entry.trade_count }}</td>
                <td class="num">{{ format.money(entry.starting_balance, stake) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <div class="grid-2">
      <section class="panel">
        <div class="panel__head">
          <span class="panel__title">{{ t('stats.exitReasons') }}</span>
        </div>
        <div class="panel__body panel__body--flush">
          <div v-if="!exitReasonRows.length" class="empty">{{ t('stats.noData') }}</div>
          <div v-else class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>{{ t('trades.exitReason') }}</th>
                  <th class="num">{{ t('stats.wins') }}</th>
                  <th class="num">{{ t('stats.losses') }}</th>
                  <th class="num">{{ t('stats.draws') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in exitReasonRows" :key="row.reason">
                  <td>{{ row.reason }}</td>
                  <td class="num u-pos">{{ row.wins }}</td>
                  <td class="num u-neg">{{ row.losses }}</td>
                  <td class="num u-flat">{{ row.draws }}</td>
                </tr>
              </tbody>
            </table>
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
    </div>
  </div>
</template>

<style scoped>
.stats__summary {
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}
</style>

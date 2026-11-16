<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import DashboardPeriod from '@/components/dashboard/DashboardPeriod.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import MetricTile from '@/components/MetricTile.vue'
import SideBadge from '@/components/SideBadge.vue'
import { useFormat } from '@/composables/useFormat'
import { pushToast } from '@/composables/useToast'
import { isStandalone, navigatePage } from '@/lib/navigation'
import { hideFreqtradeSentinel, toIsoDate } from '@/lib/format'
import { equitySamples, periodEquityRows, type ChartPeriod } from '@/lib/period-equity'
import type { Trade } from '@/lib/types'
import { useBotStore } from '@/stores/bot'
import { useSettingsStore } from '@/stores/settings'

const { t } = useI18n()
const format = useFormat()
const bot = useBotStore()
const settings = useSettingsStore()
const router = useRouter()
const route = useRoute()

const exitTarget = ref<Trade | null>(null)
/** Deep-links the overview panels into the matching trades tab. */
function openTradesTab(filter: 'open' | 'closed') {
  void navigatePage(router, { path: '/trades', query: { filter } })
}

async function openOverviewTrade(trade: Trade, filter: 'open' | 'closed'): Promise<void> {
  const detail = {
    path: '/trades',
    query: { filter, trade: String(trade.trade_id) },
  }
  if (!isStandalone.value) {
    await router.push(detail)
    return
  }

  // Keep a real trades-list entry behind the detail so the system Back action closes the drawer.
  await navigatePage(router, { path: '/trades', query: { filter } })
  await router.push(detail)
}
const period = ref<ChartPeriod>('daily')
/** The period tables list exactly as many rows as the chart draws bars. */
const PERIOD_ROWS = 30

/** The overview stays a summary; how long is up to the operator (Settings → Interface). */
const openRows = computed(() => bot.openTrades.slice(0, settings.overviewOpenLimit))
const closedRows = computed(() => bot.closedByRecency.slice(0, settings.overviewClosedLimit))

const stake = computed(() => bot.stakeCurrency)

const dailySeries = computed(() => {
  const rows = bot.daily?.data ?? []
  return [...rows].reverse()
})

const todayPnl = computed(() => {
  // The bot's days are UTC days, so its own day is the one being looked for.
  const today = toIsoDate()
  const row = dailySeries.value.find((entry) => entry.date === today)
  return row ? row.abs_profit : null
})

const samples = computed(() => equitySamples(bot.historicBalance))
const periodRows = computed(() => {
  const source =
    period.value === 'daily' ? bot.daily : period.value === 'weekly' ? bot.weekly : bot.monthly
  return periodEquityRows(
    (source?.data ?? []).slice(0, PERIOD_ROWS),
    samples.value,
    period.value,
    bot.balance?.total_bot ?? bot.balance?.total ?? null,
  )
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
  <div class="d-flex flex-column ga-4">
    <VRow density="compact" class="metric-grid">
      <VCol cols="6" sm="4" lg="2"
        ><MetricTile
          :label="t('kpi.equity')"
          :value="bot.balance?.total_bot ?? bot.balance?.total ?? null"
          kind="money"
          :currency="bot.balance?.stake ?? stake"
      /></VCol>
      <VCol cols="6" sm="4" lg="2"
        ><MetricTile
          :label="t('kpi.openPnl')"
          :value="(bot.profit?.profit_all_coin ?? 0) - (bot.profit?.profit_closed_coin ?? 0)"
          kind="money"
          :currency="stake"
          tone="auto"
          signed
      /></VCol>
      <VCol cols="6" sm="4" lg="2"
        ><MetricTile
          :label="t('kpi.totalPnl')"
          :value="bot.profit?.profit_all_coin ?? null"
          kind="money"
          :currency="stake"
          tone="auto"
          signed
      /></VCol>
      <VCol cols="6" sm="4" lg="2"
        ><MetricTile
          :label="t('kpi.todayPnl')"
          :value="todayPnl"
          kind="money"
          :currency="stake"
          tone="auto"
          signed
      /></VCol>
      <VCol cols="6" sm="4" lg="2"
        ><MetricTile
          :label="t('kpi.trades')"
          :value="bot.profit?.trade_count ?? null"
          kind="number"
          :digits="0"
      /></VCol>
      <VCol cols="6" sm="4" lg="2"
        ><MetricTile
          :label="t('kpi.profitFactor')"
          :value="hideFreqtradeSentinel(bot.profit?.profit_factor ?? null)"
          kind="number"
      /></VCol>
    </VRow>

    <div class="d-flex flex-column ga-4">
      <DashboardPeriod v-model:period="period" :period-rows="periodRows" :stake="stake" />

      <VCard tag="section" class="panel">
        <VCardItem class="panel__head">
          <VCardTitle tag="span" class="panel__title">{{ t('kpi.openTrades') }}</VCardTitle>
          <VChip size="x-small" variant="tonal">{{ bot.openTrades.length }}</VChip>
          <div class="panel__actions">
            <VBtn type="button" @click="openTradesTab('open')">
              <AppIcon name="chevronRight" />
              {{ t('dashboard.viewAll') }}
            </VBtn>
          </div>
        </VCardItem>
        <VCardText class="panel__body panel__body--flush">
          <VEmptyState
            v-if="!bot.openTrades.length"
            :text="t('dashboard.noPositions')"
            class="pa-6"
          />
          <!-- Scrolls sideways on phones: give keyboard users a focus stop (WCAG 2.1.1). -->
          <div
            v-else
            class="table-wrap ov-body"
            tabindex="0"
            role="region"
            :aria-label="t('kpi.openTrades')"
          >
            <VTable
              class="table table--clickable ov-open-table"
              :class="{ 'ov-open-table--controls': bot.writesAllowed }"
            >
              <thead>
                <tr>
                  <th scope="col">{{ t('trades.pair') }}</th>
                  <th scope="col" class="num ov-entry">{{ t('trades.entryPrice') }}</th>
                  <th scope="col" class="num ov-current">{{ t('trades.currentPrice') }}</th>
                  <th scope="col" class="num ov-stake">{{ t('trades.stake') }}</th>
                  <th scope="col" class="num">{{ t('kpi.unrealized') }}</th>
                  <th scope="col" class="num">{{ t('trades.duration') }}</th>
                  <th scope="col" class="num ov-open-date">{{ t('trades.openDate') }}</th>
                  <th v-if="bot.writesAllowed" scope="col" />
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="trade in openRows"
                  :key="trade.trade_id"
                  @click="openOverviewTrade(trade, 'open')"
                >
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
                        @click.stop="openOverviewTrade(trade, 'open')"
                      >
                        {{ trade.pair }}
                      </VBtn>
                      <SideBadge :is-short="trade.is_short" icon-only />
                    </div>
                  </td>
                  <td class="num ov-entry">{{ format.price(trade.open_rate) }}</td>
                  <td class="num ov-current">
                    {{ format.price(trade.current_rate ?? trade.open_rate) }}
                  </td>
                  <td class="num ov-stake">{{ format.money(trade.stake_amount, stake) }}</td>
                  <td class="num" :class="format.toneClass(trade.profit_ratio)">
                    {{ format.signedMoney(trade.profit_abs ?? 0, stake) }}
                    <div class="small muted">{{ format.ratio(trade.profit_ratio) }}</div>
                  </td>
                  <td class="num">{{ format.duration(durationOf(trade)) }}</td>
                  <td class="num ov-open-date">
                    {{ format.dateTimeParts(trade.open_timestamp).date }}
                  </td>
                  <td v-if="bot.writesAllowed">
                    <VBtn color="error" type="button" @click.stop="exitTarget = trade">
                      <AppIcon name="logout" />
                      {{ t('actions.forceExit') }}
                    </VBtn>
                  </td>
                </tr>
              </tbody>
            </VTable>
          </div>
        </VCardText>
      </VCard>

      <VCard tag="section" class="panel">
        <VCardItem class="panel__head">
          <VCardTitle tag="span" class="panel__title">{{ t('dashboard.recentTrades') }}</VCardTitle>
          <div class="panel__actions">
            <VBtn type="button" @click="openTradesTab('closed')">
              <AppIcon name="chevronRight" />
              {{ t('dashboard.viewAll') }}
            </VBtn>
          </div>
        </VCardItem>
        <VCardText class="panel__body panel__body--flush">
          <VEmptyState
            v-if="!bot.closedByRecency.length"
            :text="t('trades.noClosed')"
            class="pa-6"
          />
          <!-- Scrolls sideways on phones: give keyboard users a focus stop (WCAG 2.1.1). -->
          <div
            v-else
            class="table-wrap ov-body"
            tabindex="0"
            role="region"
            :aria-label="t('dashboard.recentTrades')"
          >
            <VTable class="table table--clickable">
              <thead>
                <tr>
                  <th scope="col">{{ t('trades.pair') }}</th>
                  <th scope="col" class="num">{{ t('trades.profit') }}</th>
                  <th scope="col" class="num ov-exit">{{ t('trades.exitPrice') }}</th>
                  <th scope="col" class="num">{{ t('trades.duration') }}</th>
                  <th scope="col" class="num ov-closed-open-date">{{ t('trades.openDate') }}</th>
                  <th scope="col" class="num ov-close-date">{{ t('trades.closeDate') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="trade in closedRows"
                  :key="trade.trade_id"
                  @click="openOverviewTrade(trade, 'closed')"
                >
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
                        @click.stop="openOverviewTrade(trade, 'closed')"
                      >
                        {{ trade.pair }}
                      </VBtn>
                      <SideBadge :is-short="trade.is_short" icon-only />
                    </div>
                  </td>
                  <td class="num" :class="format.toneClass(trade.profit_ratio)">
                    {{ format.signedMoney(trade.profit_abs ?? 0, stake) }}
                    <div class="small muted">{{ format.ratio(trade.profit_ratio) }}</div>
                  </td>
                  <td class="num ov-exit">{{ format.price(trade.close_rate ?? null) }}</td>
                  <td class="num">{{ format.duration(durationOf(trade)) }}</td>
                  <td class="num ov-closed-open-date">
                    {{ format.dateTimeParts(trade.open_timestamp).date }}
                  </td>
                  <td class="num ov-close-date">
                    {{ format.dateTimeParts(trade.close_timestamp ?? null).date }}
                  </td>
                </tr>
              </tbody>
            </VTable>
          </div>
        </VCardText>
      </VCard>
    </div>

    <ConfirmDialog
      :open="route.name === 'dashboard' && exitTarget !== null"
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
/*
 * Which columns the two overview tables carry follows the room they actually have, not the
 * window: a fixed breakpoint drops data that would have fitted, and keeps data that does not.
 * Columns arrive one at a time as the panel widens, so the tables read without sideways
 * scrolling down to a phone.
 */
.ov-body {
  container-type: inline-size;
}

.ov-entry,
.ov-current,
.ov-stake,
.ov-exit,
.ov-open-date,
.ov-closed-open-date,
.ov-close-date {
  display: none;
}

@container (min-width: 470px) {
  .ov-stake {
    display: table-cell;
  }
}

@container (min-width: 580px) {
  .ov-entry {
    display: table-cell;
  }
}

@container (min-width: 700px) {
  .ov-current,
  .ov-exit {
    display: table-cell;
  }
}

@container (min-width: 760px) {
  .ov-close-date {
    display: table-cell;
  }
}
@container (min-width: 960px) {
  .ov-closed-open-date {
    display: table-cell;
  }
}
@container (min-width: 1120px) {
  .ov-open-table:not(.ov-open-table--controls) .ov-open-date {
    display: table-cell;
  }
}
@container (min-width: 1280px) {
  .ov-open-date {
    display: table-cell;
  }
}
</style>

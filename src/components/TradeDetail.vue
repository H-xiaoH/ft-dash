<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/useFormat'
import type { Trade } from '@/lib/types'
import { useBotStore } from '@/stores/bot'
import { useSettingsStore } from '@/stores/settings'

const props = defineProps<{ trade: Trade | null }>()
const emit = defineEmits<{ close: []; forceExit: [trade: Trade] }>()

const { t } = useI18n()
const format = useFormat()
const bot = useBotStore()
const settings = useSettingsStore()

const stake = computed(() => bot.stakeCurrency)

const duration = computed(() => {
  const trade = props.trade
  if (!trade) return null
  const open = format.timestamp(trade.open_timestamp)
  const close = format.timestamp(trade.close_timestamp) ?? Date.now()
  return open === null ? null : close - open
})

const totalFees = computed(() => {
  const trade = props.trade
  if (!trade) return null
  const open = trade.fee_open_cost ?? 0
  const close = trade.fee_close_cost ?? 0
  return open + close
})

const orders = computed(() => props.trade?.orders ?? [])

/** Escape dismisses the drawer, matching the charts and the search box. */
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.trade) emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer-overlay">
      <div v-if="trade" class="overlay overlay--drawer" @click.self="emit('close')">
        <aside class="drawer" role="dialog" aria-modal="true">
          <header class="drawer__head">
            <div>
              <div class="row">
                <span
                  class="table__side"
                  :class="trade.is_short ? 'table__side--short' : 'table__side--long'"
                />
                <span class="drawer__pair num">{{ trade.pair }}</span>
                <span class="chip" :class="trade.is_open ? 'chip--accent' : ''">
                  {{ trade.is_open ? t('trades.open') : t('trades.closed') }}
                </span>
              </div>
              <div class="small muted">
                {{ t('trades.tradeId') }} #{{ trade.trade_id }} · {{ trade.strategy }}
              </div>
            </div>
            <div class="spacer" />
            <button type="button" class="btn btn--ghost" @click="emit('close')">
              {{ t('common.close') }}
            </button>
          </header>

          <div class="drawer__body stack">
            <div class="drawer__pnl">
              <span
                class="num drawer__pnl-value"
                :class="format.toneClass(trade.profit_ratio ?? trade.close_profit)"
              >
                {{ format.signedMoney(trade.profit_abs ?? trade.close_profit_abs ?? 0, stake) }}
              </span>
              <span class="num" :class="format.toneClass(trade.profit_ratio ?? trade.close_profit)">
                {{ format.ratio(trade.profit_ratio ?? trade.close_profit) }}
              </span>
            </div>

            <dl class="dl">
              <dt>{{ t('trades.side') }}</dt>
              <dd>{{ trade.is_short ? t('trades.short') : t('trades.long') }}</dd>
              <dt>{{ t('trades.amount') }}</dt>
              <dd>{{ format.number(trade.amount, 6) }}</dd>
              <dt>{{ t('trades.stake') }}</dt>
              <dd>{{ format.money(trade.stake_amount, stake) }}</dd>
              <dt>{{ t('trades.entryPrice') }}</dt>
              <dd>{{ format.price(trade.open_rate) }}</dd>
              <dt>{{ t('trades.currentPrice') }}</dt>
              <dd>{{ format.price(trade.current_rate ?? trade.close_rate ?? null) }}</dd>
              <dt>{{ t('trades.exitPrice') }}</dt>
              <dd>{{ format.price(trade.close_rate ?? null) }}</dd>
              <dt>{{ t('trades.leverage') }}</dt>
              <dd>{{ trade.leverage ? `${trade.leverage}x` : '—' }}</dd>
              <dt>{{ t('trades.liquidation') }}</dt>
              <dd>{{ format.price(trade.liquidation_price ?? null) }}</dd>
              <dt>{{ t('trades.stoploss') }}</dt>
              <dd>{{ format.price(trade.stop_loss_abs ?? null) }}</dd>
              <dt>{{ t('trades.openDate') }}</dt>
              <dd>{{ format.dateTime(trade.open_timestamp) }}</dd>
              <dt>{{ t('trades.closeDate') }}</dt>
              <dd>{{ format.dateTime(trade.close_timestamp ?? null) }}</dd>
              <dt>{{ t('trades.duration') }}</dt>
              <dd>{{ format.duration(duration) }}</dd>
              <dt>{{ t('trades.enterTag') }}</dt>
              <dd>{{ trade.enter_tag?.trim() || '—' }}</dd>
              <dt>{{ t('trades.exitReason') }}</dt>
              <dd>{{ trade.exit_reason ?? '—' }}</dd>
              <dt>{{ t('trades.fees') }}</dt>
              <dd>{{ format.money(totalFees, stake, 4) }}</dd>
              <dt>{{ t('trades.funding') }}</dt>
              <dd>{{ format.money(trade.funding_fees ?? null, stake, 4) }}</dd>
            </dl>

            <section class="panel">
              <div class="panel__head">
                <span class="panel__title">{{ t('trades.orders') }}</span>
                <div class="panel__actions">
                  <span class="panel__meta num">{{ orders.length }}</span>
                </div>
              </div>
              <div class="panel__body panel__body--flush">
                <div v-if="!orders.length" class="empty">{{ t('trades.noOrders') }}</div>
                <div v-else class="table-wrap">
                  <table class="table">
                    <thead>
                      <tr>
                        <th scope="col">{{ t('trades.orderSide') }}</th>
                        <th scope="col">{{ t('trades.orderType') }}</th>
                        <th scope="col" class="num">{{ t('trades.orderPrice') }}</th>
                        <th scope="col" class="num">{{ t('trades.orderFilled') }}</th>
                        <th scope="col">{{ t('trades.orderStatus') }}</th>
                        <th scope="col">{{ t('trades.orderDate') }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(order, index) in orders" :key="order.order_id ?? index">
                        <td>{{ order.ft_order_side ?? order.side ?? '—' }}</td>
                        <td>{{ order.order_type ?? '—' }}</td>
                        <td class="num">
                          {{ format.price(order.average ?? order.price ?? null) }}
                        </td>
                        <td class="num">
                          {{ format.number(order.filled ?? null, 4) }} /
                          {{ format.number(order.amount ?? null, 4) }}
                        </td>
                        <td>{{ order.status ?? '—' }}</td>
                        <td class="num">{{ format.dateTime(order.order_timestamp ?? null) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>

          <footer v-if="trade.is_open && settings.writesEnabled" class="drawer__foot">
            <button type="button" class="btn btn--danger" @click="emit('forceExit', trade)">
              {{ t('actions.forceExit') }}
            </button>
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.overlay--drawer {
  align-items: stretch;
  justify-content: flex-end;
  padding: 0;
}

.drawer {
  width: min(520px, 100%);
  background: var(--ink-850);
  border-left: 1px solid var(--line-strong);
  display: flex;
  flex-direction: column;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

/* Desktop: slides in from the right. Phones override this to rise from the bottom. */
.drawer-overlay-enter-active,
.drawer-overlay-leave-active {
  transition: opacity 180ms ease;
}

.drawer-overlay-enter-active .drawer,
.drawer-overlay-leave-active .drawer {
  transition: transform 200ms ease;
}

.drawer-overlay-enter-from,
.drawer-overlay-leave-to {
  opacity: 0;
}

.drawer-overlay-enter-from .drawer,
.drawer-overlay-leave-to .drawer {
  transform: translateX(100%);
}

.drawer__head {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: var(--sp-4);
  border-bottom: 1px solid var(--line);
  padding-top: calc(var(--sp-4) + env(safe-area-inset-top, 0px));
}

.drawer__pair {
  font-size: var(--fs-lg);
}

.drawer__body {
  padding: var(--sp-4);
  overflow-y: auto;
}

.drawer__pnl {
  display: flex;
  align-items: baseline;
  gap: var(--sp-3);
}

.drawer__pnl-value {
  font-size: var(--fs-2xl);
}

.drawer__foot {
  padding: var(--sp-4);
  border-top: 1px solid var(--line);
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 900px) {
  /* A bottom sheet should rise from the bottom, not slide in from the side. */
  .drawer-overlay-enter-from .drawer,
  .drawer-overlay-leave-to .drawer {
    transform: translateY(100%);
  }

  .overlay--drawer {
    align-items: flex-end;
  }

  .drawer {
    width: 100%;
    max-height: 92vh;
    border-left: 0;
    border-top: 1px solid var(--line-strong);
    border-radius: var(--r-3) var(--r-3) 0 0;
  }
}
</style>

<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'
import { useMediaQuery } from '@vueuse/core'
import { WIDE_LAYOUT_QUERY } from '@/lib/layout'
import { computed, useId, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/useFormat'
import { sumFeesByCurrency } from '@/lib/stats'
import type { Trade } from '@/lib/types'
import { useBotStore } from '@/stores/bot'

const props = defineProps<{ trade: Trade | null }>()
const trade = shallowRef(props.trade)
watch(
  () => props.trade,
  (value) => {
    if (value) trade.value = value
  },
)
const emit = defineEmits<{ close: []; forceExit: [trade: Trade] }>()

const { t } = useI18n()
const format = useFormat()
const bot = useBotStore()

const dialogTitleId = useId()
const wide = useMediaQuery(WIDE_LAYOUT_QUERY)

const stake = computed(() => bot.stakeCurrency)

const duration = computed(() => {
  const current = trade.value
  if (!current) return null
  const open = format.timestamp(current.open_timestamp)
  const close = format.timestamp(current.close_timestamp) ?? Date.now()
  return open === null ? null : close - open
})

const fees = computed(() => (trade.value ? sumFeesByCurrency([trade.value]) : null))

const orders = computed(() => trade.value?.orders ?? [])
const orderRows = computed(() => {
  const occurrences = new Map<string, number>()
  return orders.value.map((order) => {
    const identity = order.order_id ? `id:${order.order_id}` : `value:${JSON.stringify(order)}`
    const occurrence = occurrences.get(identity) ?? 0
    occurrences.set(identity, occurrence + 1)
    return { key: `${identity}:${occurrence}`, order }
  })
})
const activator = shallowRef<HTMLElement>()
watch(
  () => props.trade !== null,
  (open) => {
    if (open) {
      const active = document.activeElement
      activator.value =
        active instanceof HTMLElement && active !== document.body ? active : undefined
    }
  },
  { immediate: true },
)
</script>

<template>
  <VDialog
    :activator="activator"
    :open-on-click="false"
    :close-on-back="false"
    class="trade-dialog"
    :transition="wide ? 'slide-x-reverse-transition' : 'slide-y-reverse-transition'"
    :model-value="props.trade !== null"
    max-width="560"
    scrollable
    :aria-labelledby="dialogTitleId"
    @after-leave="!props.trade && (trade = null)"
    @update:model-value="!$event && emit('close')"
  >
    <VCard v-if="trade" :key="trade.trade_id" class="trade-detail">
      <VCardItem>
        <template #title>
          <div class="d-flex align-center ga-2">
            <span
              class="table__side"
              :class="trade.is_short ? 'table__side--short' : 'table__side--long'"
            />
            <span :id="dialogTitleId" class="num text-h6">{{ trade.pair }}</span>
            <VChip size="x-small" variant="tonal" :color="trade.is_open ? 'primary' : undefined">{{
              trade.is_open ? t('trades.open') : t('trades.closed')
            }}</VChip>
          </div>
        </template>
        <template #subtitle
          >{{ t('trades.tradeId') }} #{{ trade.trade_id }} · {{ trade.strategy }}</template
        >
        <template #append
          ><VBtn variant="text" :icon="true" :aria-label="t('common.close')" @click="emit('close')"
            ><AppIcon name="close" /></VBtn
        ></template>
      </VCardItem>
      <VDivider />

      <VCardText class="d-flex flex-column ga-4">
        <div class="d-flex align-baseline ga-3">
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
          <dd>
            <template v-if="fees">
              <div v-for="[currency, amount] in fees" :key="currency">
                {{ format.number(amount, currency === stake ? 4 : 8) }} {{ currency }}
              </div>
            </template>
            <template v-else>—</template>
          </dd>
          <dt>{{ t('trades.funding') }}</dt>
          <dd>{{ format.money(trade.funding_fees ?? null, stake, 4) }}</dd>
        </dl>

        <VCard tag="section" class="panel flex-shrink-0">
          <VCardItem class="panel__head">
            <VCardTitle tag="span" class="panel__title">{{ t('trades.orders') }}</VCardTitle>
            <div class="panel__actions">
              <span class="panel__meta num">{{ orders.length }}</span>
            </div>
          </VCardItem>
          <VCardText class="panel__body panel__body--flush">
            <VEmptyState v-if="!orders.length" :text="t('trades.noOrders')" class="pa-6" />
            <!-- The orders table scrolls sideways on phones: give it a focus stop. -->
            <div
              v-else
              class="table-wrap"
              tabindex="0"
              role="region"
              :aria-label="t('trades.orders')"
            >
              <VTable class="table">
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
                  <tr v-for="row in orderRows" :key="row.key">
                    <td>{{ row.order.ft_order_side ?? row.order.side ?? '—' }}</td>
                    <td>{{ row.order.order_type ?? '—' }}</td>
                    <td class="num">
                      {{ format.price(row.order.average ?? row.order.price ?? null) }}
                    </td>
                    <td class="num">
                      {{ format.number(row.order.filled ?? null, 4) }} /
                      {{ format.number(row.order.amount ?? null, 4) }}
                    </td>
                    <td>{{ row.order.status ?? '—' }}</td>
                    <td class="num">
                      {{ format.dateTime(row.order.order_timestamp ?? null) }}
                    </td>
                  </tr>
                </tbody>
              </VTable>
            </div>
          </VCardText>
        </VCard>
      </VCardText>

      <VCardActions v-if="trade.is_open && bot.writesAllowed" class="border-t">
        <VBtn color="error" type="button" @click="emit('forceExit', trade)">
          <AppIcon name="logout" />
          {{ t('actions.forceExit') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.trade-dialog :deep(.v-overlay__content) {
  position: fixed;
  inset: 0 0 0 auto;
  margin: 0;
  width: min(560px, 100%);
  max-width: 100%;
  max-height: 100%;
}
.trade-detail {
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 28px 0 0 28px !important;
}
@media (width < 720px) {
  .trade-dialog :deep(.v-overlay__content) {
    inset: auto 0 0;
    width: 100%;
    max-height: 90dvh;
  }
  .trade-detail {
    border-radius: 28px 28px 0 0 !important;
  }
}

.drawer__pnl-value {
  font-size: var(--fs-2xl);
}
</style>

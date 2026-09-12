<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useBotActions } from '@/composables/useBotActions'
import {
  fmtDuration,
  fmtNumber,
  fmtPercentRatio,
  fmtPrice,
  fmtQuantity,
  fmtSigned,
  isOpenTrade,
  nowSeconds,
  profitClass,
  toEpochSeconds,
  tradeProfitAbs,
  tradeProfitRatio,
} from '@/utils/format'
import Icon from './Icon.vue'
import PairPill from './PairPill.vue'

const props = defineProps({
  trade: { type: Object, default: null },
})

const emit = defineEmits(['close'])
const actions = useBotActions()
const activeTab = ref('overview')

const isOpen = computed(() => isOpenTrade(props.trade))
const ratio = computed(() => tradeProfitRatio(props.trade))
const profitAbs = computed(() => tradeProfitAbs(props.trade))

const duration = computed(() => {
  const trade = props.trade
  const open = toEpochSeconds(trade?.open_timestamp)
  if (!open) return null
  const end = isOpen.value ? nowSeconds() : toEpochSeconds(trade.close_timestamp)
  return end ? Math.max(0, end - open) : null
})

const orders = computed(() => (Array.isArray(props.trade?.orders) ? props.trade.orders : []))

function row(label, value) {
  return { label, value }
}

const fields = computed(() => {
  const t = props.trade
  if (!t) return []
  return [
    row('开仓价', fmtPrice(t.open_rate)),
    row('当前价 / 平仓价', fmtPrice(isOpen.value ? t.current_rate : t.close_rate)),
    row('数量', fmtQuantity(t.amount)),
    row('投入', fmtNumber(t.stake_amount, 4)),
    row('最大投入', fmtNumber(t.max_stake_amount, 4)),
    row('止损价', fmtPrice(t.stop_loss_abs ?? t.initial_stop_loss_abs)),
    row('止损比例', fmtPercentRatio(t.stop_loss_ratio ?? t.initial_stop_loss_ratio)),
    row('杠杆', t.leverage ? `${Number(t.leverage).toFixed(1)}x` : '1x'),
    row('方向', t.is_short ? '做空' : '做多'),
    row('开仓时间', String(t.open_date || '').replace('T', ' ').slice(0, 19)),
    row(
      isOpen.value ? '持仓时长' : '平仓时间',
      isOpen.value ? fmtDuration(duration.value) : String(t.close_date || '').replace('T', ' ').slice(0, 19),
    ),
    row('平仓原因', t.exit_reason || '—'),
    row('开仓标签', t.enter_tag || '—'),
    row('手续费', `${fmtNumber(t.fee_open ?? 0, 4)} / ${fmtNumber(t.fee_close ?? 0, 4)}`),
    row('交易所', t.exchange || '—'),
    row('策略', t.strategy || '—'),
  ]
})

function onKeydown(event) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="trade" class="drawer-backdrop" @click.self="emit('close')">
        <aside class="drawer">
          <div class="modal-head">
            <div class="grow">
              <div class="row" style="gap: 8px">
                <PairPill :pair="trade.pair" />
                <span v-if="trade.is_short" class="badge badge--loss tiny">空</span>
                <span class="badge tiny">#{{ trade.trade_id }}</span>
                <span v-if="isOpen" class="badge badge--accent tiny">持仓中</span>
              </div>
              <div class="row" style="gap: 10px; margin-top: 8px">
                <span
                  class="mono strong"
                  style="font-size: 20px"
                  :class="profitClass(ratio)"
                >
                  {{ fmtPercentRatio(ratio) }}
                </span>
                <span class="mono small" :class="profitClass(profitAbs)">
                  {{ fmtSigned(profitAbs, 4) }}
                </span>
              </div>
            </div>
            <button class="icon-btn" @click="emit('close')">
              <Icon name="close" :size="18" />
            </button>
          </div>

          <div class="modal-body grow">
            <div class="segmented" style="width: 100%">
              <button
                v-for="tab in [
                  { id: 'overview', label: '概览' },
                  { id: 'orders', label: `订单 (${orders.length})` },
                ]"
                :key="tab.id"
                :class="{ active: activeTab === tab.id }"
                style="flex: 1"
                @click="activeTab = tab.id"
              >
                {{ tab.label }}
              </button>
            </div>

            <template v-if="activeTab === 'overview'">
              <div class="col" style="gap: 2px">
                <div
                  v-for="item in fields"
                  :key="item.label"
                  class="row-between"
                  style="padding: 8px 0; border-bottom: 1px solid var(--border)"
                >
                  <span class="small muted">{{ item.label }}</span>
                  <span class="mono small">{{ item.value }}</span>
                </div>
              </div>
            </template>

            <template v-else>
              <div v-if="!orders.length" class="empty small">该交易没有关联订单数据</div>
              <div v-else class="col" style="gap: 10px">
                <div
                  v-for="order in orders"
                  :key="order.order_id"
                  class="card"
                  style="padding: 12px; box-shadow: none"
                >
                  <div class="row-between">
                    <span class="badge" :class="order.ft_order_side === 'buy' ? 'badge--profit' : 'badge--loss'">
                      {{ order.ft_order_side }}
                    </span>
                    <span class="badge tiny">{{ order.status }}</span>
                  </div>
                  <div class="row-between small" style="margin-top: 8px">
                    <span class="muted">成交价</span>
                    <span class="mono">{{ fmtPrice(order.average ?? order.price) }}</span>
                  </div>
                  <div class="row-between small">
                    <span class="muted">数量</span>
                    <span class="mono">{{ fmtQuantity(order.filled ?? order.amount) }}</span>
                  </div>
                  <div class="row-between small">
                    <span class="muted">订单类型</span>
                    <span class="mono">{{ order.order_type || '—' }}</span>
                  </div>
                </div>
              </div>
            </template>
          </div>

          <div class="modal-foot" style="flex-wrap: wrap">
            <button class="btn btn--sm" @click="actions.reloadTrade(trade)">
              <Icon name="refresh" :size="14" />
              同步
            </button>
            <button v-if="isOpen" class="btn btn--sm" @click="actions.cancelOrder(trade)">
              <Icon name="close" :size="14" />
              取消挂单
            </button>
            <button class="btn btn--sm btn--danger" @click="actions.deleteTrade(trade)">
              <Icon name="trash" :size="14" />
              删除记录
            </button>
            <button
              v-if="isOpen"
              class="btn btn--sm btn--primary"
              @click="actions.forceExit(trade)"
            >
              <Icon name="bolt" :size="14" />
              市价平仓
            </button>
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>


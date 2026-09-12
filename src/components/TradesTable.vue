<script setup>
import { computed } from 'vue'
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
import EmptyState from './EmptyState.vue'
import Icon from './Icon.vue'
import PairPill from './PairPill.vue'

const props = defineProps({
  trades: { type: Array, default: () => [] },
  mode: { type: String, default: 'open' }, // open | closed
  actions: { type: Boolean, default: true },
  emptyTitle: { type: String, default: '暂无交易' },
  emptyMessage: { type: String, default: '' },
})

const emit = defineEmits(['select'])

const actionsApi = useBotActions()

const isOpen = computed(() => props.mode === 'open')

function ratioOf(trade) {
  return tradeProfitRatio(trade)
}

function durationOf(trade) {
  const open = toEpochSeconds(trade.open_timestamp)
  const end = isOpenTrade(trade) ? nowSeconds() : toEpochSeconds(trade.close_timestamp)
  if (!open || !end) return null
  return Math.max(0, end - open)
}
</script>

<template>
  <div>
    <EmptyState
      v-if="!trades.length"
      icon="trades"
      :title="emptyTitle"
      :message="emptyMessage"
    />

    <div v-else class="table-wrap">
      <table class="table table--trades table--compact">
        <thead>
          <tr>
            <th>交易对</th>
            <th class="num">开仓价</th>
            <th class="num">{{ isOpen ? '当前价' : '平仓价' }}</th>
            <th class="num hide-xs">数量</th>
            <th class="num hide-xs">投入</th>
            <th class="num">盈亏</th>
            <th class="num">{{ isOpen ? '浮动' : '盈亏额' }}</th>
            <th class="hide-xs">{{ isOpen ? '持仓时长' : '平仓时间' }}</th>
            <th v-if="actions" class="right">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="trade in trades"
            :key="trade.trade_id"
            class="clickable"
            @click="emit('select', trade)"
          >
            <td>
              <div class="row" style="gap: 7px">
                <PairPill :pair="trade.pair" />
                <span v-if="trade.is_short" class="badge badge--loss tiny">空</span>
                <span
                  v-else-if="Number(trade.leverage) > 1"
                  class="badge badge--accent tiny"
                >
                  {{ Number(trade.leverage).toFixed(0) }}x
                </span>
              </div>
              <div class="tiny faint">#{{ trade.trade_id }}</div>
            </td>

            <td class="num">{{ fmtPrice(trade.open_rate) }}</td>
            <td class="num">
              {{ fmtPrice(isOpen ? trade.current_rate : trade.close_rate) }}
            </td>
            <td class="num hide-xs">{{ fmtQuantity(trade.amount) }}</td>
            <td class="num hide-xs">{{ fmtNumber(trade.stake_amount, 2) }}</td>

            <td class="num" :class="profitClass(ratioOf(trade))">
              <span class="strong">{{ fmtPercentRatio(ratioOf(trade)) }}</span>
            </td>
            <td class="num" :class="profitClass(tradeProfitAbs(trade) ?? ratioOf(trade))">
              {{ fmtSigned(tradeProfitAbs(trade), 4) }}
            </td>

            <td class="hide-xs">
              <template v-if="isOpen">
                <span class="muted small">{{ fmtDuration(durationOf(trade)) }}</span>
              </template>
              <template v-else>
                <div class="small">{{ trade.close_date?.slice(0, 16).replace('T', ' ') || '—' }}</div>
                <div class="tiny faint">{{ fmtDuration(durationOf(trade)) }}</div>
              </template>
            </td>

            <td v-if="actions" class="right" @click.stop>
              <div class="row" style="justify-content: flex-end; gap: 4px">
                <button
                  v-if="isOpen"
                  class="btn btn--xs btn--danger"
                  :disabled="actionsApi.running(`exit-${trade.trade_id}`)"
                  title="市价平仓"
                  @click="actionsApi.forceExit(trade)"
                >
                  <Icon
                    name="bolt"
                    :size="13"
                    :class="actionsApi.running(`exit-${trade.trade_id}`) ? 'spin' : ''"
                  />
                  平仓
                </button>
                <button
                  v-else
                  class="btn btn--xs"
                  title="查看详情"
                  @click="emit('select', trade)"
                >
                  <Icon name="eye" :size="13" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

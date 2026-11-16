<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SideBadge from '@/components/SideBadge.vue'
import { useFormat } from '@/composables/useFormat'
import type { Trade } from '@/lib/types'

defineProps<{ trade: Trade; stake: string; durationOf: (trade: Trade) => number | null }>()
const emit = defineEmits<{ open: [trade: Trade] }>()
const { t } = useI18n()
const format = useFormat()
</script>

<template>
  <tr :data-trade-id="trade.trade_id" @click="emit('open', trade)">
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
          @click.stop="emit('open', trade)"
        >
          {{ trade.pair }}
        </VBtn>
        <VChip v-if="trade.is_open" size="x-small" variant="tonal" color="primary">{{
          t('trades.open')
        }}</VChip>
      </div>
    </td>
    <td class="side-col"><SideBadge :is-short="trade.is_short" /></td>
    <td class="num col-extra-2">{{ format.money(trade.stake_amount, stake) }}</td>
    <td class="num col-extra-3">{{ format.price(trade.open_rate) }}</td>
    <td class="num col-extra-3">
      {{ format.price(trade.current_rate ?? trade.close_rate ?? null) }}
    </td>
    <td class="num" :class="format.toneClass(trade.profit_ratio ?? trade.close_profit)">
      {{ format.signedMoney(trade.profit_abs ?? trade.close_profit_abs ?? null, stake) }}
      <div class="small muted">
        {{ format.ratio(trade.profit_ratio ?? trade.close_profit) }}
      </div>
    </td>
    <td class="num col-extra-1">{{ format.duration(durationOf(trade)) }}</td>
    <td class="num col-extra-3">{{ format.dateTime(trade.open_timestamp) }}</td>
    <td class="num col-extra-4">
      {{ format.dateTime(trade.close_timestamp ?? null) }}
    </td>
  </tr>
</template>

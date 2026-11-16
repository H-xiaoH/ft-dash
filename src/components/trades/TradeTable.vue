<script setup lang="ts">
import { computed, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { VDataTable, VDataTableVirtual } from 'vuetify/components'
import TradeTableRow from './TradeTableRow.vue'
import type { Trade } from '@/lib/types'

const props = defineProps<{
  rows: Trade[]
  headers: { key: string; sortRaw?: (a: Trade, b: Trade) => number }[]
  sortBy: { key: string; order: 'asc' | 'desc' }[]
  pageSize: number
  filter: string
  resetKey: string
  stake: string
  durationOf: (trade: Trade) => number | null
}>()
const page = defineModel<number>('page', { required: true })
const emit = defineEmits<{ open: [trade: Trade] }>()
const { t } = useI18n()
const virtual = computed(() => props.pageSize === 0)
watch(
  virtual,
  (allRecords) => {
    if (allRecords) page.value = 1
  },
  { immediate: true },
)
const table = useTemplateRef('table')
watch(
  () => props.resetKey,
  () => {
    if (virtual.value && table.value && 'scrollToIndex' in table.value) {
      table.value.scrollToIndex(0)
    }
  },
  { flush: 'post' },
)
</script>

<template>
  <div class="table-wrap progressive-table">
    <component
      :is="virtual ? VDataTableVirtual : VDataTable"
      ref="table"
      v-model:page="page"
      :items="rows"
      :headers="headers"
      :sort-by="sortBy"
      :items-per-page="virtual ? -1 : pageSize"
      :height="virtual ? 'min(560px, 65dvh)' : undefined"
      :item-height="virtual ? 64 : undefined"
      :data-trade-table="virtual ? 'virtual' : 'paged'"
      item-value="trade_id"
      hide-default-header
      :hide-default-body="!virtual"
      hide-default-footer
      class="table table--clickable"
      :no-data-text="t('empty.table')"
    >
      <template #thead
        ><thead>
          <tr>
            <th scope="col">{{ t('trades.pair') }}</th>
            <th scope="col" class="side-col">{{ t('trades.side') }}</th>
            <th scope="col" class="num col-extra-2">{{ t('trades.stake') }}</th>
            <th scope="col" class="num col-extra-3">{{ t('trades.entryPrice') }}</th>
            <th scope="col" class="num col-extra-3">{{ t('trades.currentPrice') }}</th>
            <th scope="col" class="num">{{ t('trades.profit') }}</th>
            <th scope="col" class="num col-extra-1">{{ t('trades.duration') }}</th>
            <th scope="col" class="num col-extra-3">{{ t('trades.openDate') }}</th>
            <th scope="col" class="num col-extra-4">{{ t('trades.closeDate') }}</th>
          </tr>
        </thead></template
      >

      <template v-if="virtual" #item="slot">
        <TradeTableRow
          :ref="'itemRef' in slot ? slot.itemRef : undefined"
          :trade="slot.item"
          :stake="stake"
          :duration-of="durationOf"
          @open="emit('open', $event)"
        />
      </template>
      <template v-else #tbody="{ items }">
        <Transition name="trade-filter" mode="out-in">
          <tbody :key="filter" data-filter-content>
            <tr v-if="!items.length">
              <td :colspan="headers.length" class="text-center">{{ t('empty.table') }}</td>
            </tr>
            <TradeTableRow
              v-for="trade in items"
              :key="trade.trade_id"
              :trade="trade"
              :stake="stake"
              :duration-of="durationOf"
              @open="emit('open', $event)"
            />
          </tbody>
        </Transition>
      </template>
      <template #bottom="slot">
        <VCardActions class="panel__pager">
          <span class="panel__meta num">{{
            t('common.showing', { shown: slot.items.length, total: rows.length })
          }}</span>
          <VPagination
            v-if="!virtual"
            v-model="page"
            :length="'pageCount' in slot ? slot.pageCount : 1"
            :total-visible="3"
            size="small"
            density="compact"
            class="ml-auto"
          />
        </VCardActions>
      </template>
    </component>
  </div>
</template>

<style scoped>
.table[data-trade-table='virtual'] :deep(.v-table__wrapper) {
  overflow: auto;
}

.trade-filter-enter-active {
  transition:
    clip-path 220ms cubic-bezier(0.2, 0, 0, 1),
    opacity 220ms ease;
}
.trade-filter-enter-from {
  clip-path: inset(0 0 100% 0);
  opacity: 0;
}
.trade-filter-enter-to {
  clip-path: inset(0);
  opacity: 1;
}
.trade-filter-leave-active {
  transition: opacity 80ms ease;
}
.trade-filter-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .trade-filter-enter-active,
  .trade-filter-leave-active {
    transition: none;
  }
}
</style>

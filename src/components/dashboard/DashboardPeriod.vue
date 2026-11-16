<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import PeriodChart from '@/components/PeriodChart.vue'
import { useFormat } from '@/composables/useFormat'
import { useChartHeight } from '@/composables/useChartHeight'
import type { ChartPeriod, PeriodRow } from '@/lib/period-equity'

defineProps<{ periodRows: PeriodRow[]; stake: string }>()
const period = defineModel<ChartPeriod>('period', { required: true })
const { t } = useI18n()
const format = useFormat()
const periodRowsOpen = ref(false)
const periodChartHeight = useChartHeight(140, 0.19, 220)
</script>

<template>
  <VCard tag="section" class="panel">
    <VCardItem class="panel__head">
      <VCardTitle tag="span" class="panel__title">{{ t('stats.period') }}</VCardTitle>
      <VBtnToggle v-model="period" mandatory divided class="page-tabs">
        <VBtn type="button" variant="outlined" :aria-pressed="period === 'daily'" value="daily">
          {{ t('stats.daily') }}
        </VBtn>
        <VBtn type="button" variant="outlined" :aria-pressed="period === 'weekly'" value="weekly">
          {{ t('stats.weekly') }}
        </VBtn>
        <VBtn type="button" variant="outlined" :aria-pressed="period === 'monthly'" value="monthly">
          {{ t('stats.monthly') }}
        </VBtn>
      </VBtnToggle>
      <div class="panel__actions">
        <VBtn
          type="button"
          :aria-expanded="periodRowsOpen"
          :aria-label="t(periodRowsOpen ? 'stats.hidePeriods' : 'stats.showPeriods')"
          :title="t(periodRowsOpen ? 'stats.hidePeriods' : 'stats.showPeriods')"
          @click="periodRowsOpen = !periodRowsOpen"
        >
          <AppIcon :name="periodRowsOpen ? 'chevronUp' : 'chevronDown'" />
          {{ t(periodRowsOpen ? 'stats.hidePeriods' : 'stats.showPeriods') }}
        </VBtn>
      </div>
    </VCardItem>
    <VCardText class="panel__body">
      <PeriodChart
        v-if="periodRows.length"
        :entries="periodRows"
        :stake="stake"
        :height="periodChartHeight"
      />
      <VEmptyState v-else :text="t('stats.noData')" class="pa-6" />
    </VCardText>
    <VExpandTransition>
      <VCardText
        v-if="periodRowsOpen"
        class="panel__body panel__body--flush responsive-table responsive-table--short"
      >
        <div class="table-wrap u-desktop-only">
          <VTable class="table period-table">
            <thead>
              <tr>
                <th scope="col">{{ t('stats.date') }}</th>
                <th scope="col" class="num">{{ t('stats.profitAbs') }}</th>
                <th scope="col" class="num">{{ t('stats.relProfit') }}</th>
                <th scope="col" class="num">{{ t('stats.tradeCount') }}</th>
                <th scope="col" class="num">{{ t('stats.startingBalance') }}</th>
                <th scope="col" class="num">{{ t('kpi.equity') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in periodRows" :key="entry.date">
                <td>{{ format.day(entry.date) }}</td>
                <td class="num" :class="format.toneClass(entry.abs_profit)">
                  {{ format.signedMoney(entry.abs_profit, stake) }}
                </td>
                <td class="num" :class="format.toneClass(entry.rel_profit)">
                  {{ format.ratio(entry.rel_profit) }}
                </td>
                <td class="num">{{ entry.trade_count }}</td>
                <td class="num">{{ format.money(entry.starting_balance, stake) }}</td>
                <td class="num">{{ format.money(entry.equity, stake) }}</td>
              </tr>
            </tbody>
          </VTable>
        </div>

        <VList role="list" class="period-details u-mobile-only" lines="two">
          <VListItem v-for="entry in periodRows" :key="entry.date" role="listitem" class="border-b">
            <template #title
              ><span class="num">{{ format.day(entry.date) }}</span></template
            >
            <template #append
              ><span class="num" :class="format.toneClass(entry.abs_profit)">{{
                format.signedMoney(entry.abs_profit, stake)
              }}</span></template
            >
            <template #subtitle>
              <span class="d-block">
                {{ format.ratio(entry.rel_profit) }} · {{ entry.trade_count }}
                {{ t('stats.tradeCount') }}
              </span>
              <span class="d-block">
                {{ t('kpi.equity') }} {{ format.money(entry.equity, stake) }}
              </span>
              <span class="d-block">
                {{ t('stats.startingBalance') }}
                {{ format.money(entry.starting_balance, stake) }}
              </span>
            </template>
          </VListItem>
        </VList>
      </VCardText>
    </VExpandTransition>
  </VCard>
</template>

<style scoped>
.period-details :deep(.v-list-item-subtitle) {
  -webkit-line-clamp: unset;
  white-space: normal;
  overflow-wrap: anywhere;
}
.period-table :deep(th),
.period-table :deep(td) {
  white-space: normal;
  overflow-wrap: anywhere;
}
</style>

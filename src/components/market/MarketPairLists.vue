<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import SearchToggle from '@/components/SearchToggle.vue'
import { useFormat } from '@/composables/useFormat'
import type { Lock } from '@/lib/types'

const props = defineProps<{
  whitelist: string[]
  blacklist: string[]
  blacklistErrors: boolean
  locks: Lock[]
  lockCount: number
  openPairs: ReadonlySet<string>
  profitByPair: ReadonlyMap<string, number>
  selectedPair: string
  stakeCurrency: string
  writesAllowed: boolean
  canDeleteLocks: boolean
  actionPending: string | null
  blacklistInput: string
}>()
const emit = defineEmits<{
  selectPair: [pair: string]
  'update:blacklistInput': [value: string]
  addBlacklist: []
  removeBlacklist: [entry: string]
  removeLock: [lock: Lock]
}>()
const { t } = useI18n()
const format = useFormat()
const tab = ref<'whitelist' | 'blacklist' | 'locks'>('whitelist')
const search = ref('')
const positionsOnly = ref(false)
const query = computed(() => search.value.trim().toLowerCase())
const whitelistRows = computed(() =>
  props.whitelist.filter(
    (pair) =>
      (!positionsOnly.value || props.openPairs.has(pair)) &&
      pair.toLowerCase().includes(query.value),
  ),
)
const blacklistRows = computed(() =>
  props.blacklist.filter((entry) => entry.toLowerCase().includes(query.value)),
)
const lockRows = computed(() =>
  props.locks.filter((lock) => lock.pair.toLowerCase().includes(query.value)),
)
</script>

<template>
  <VCard tag="section" class="panel market__pairs">
    <VCardItem class="panel__head">
      <VBtnToggle v-model="tab" mandatory divided class="page-tabs">
        <VBtn
          type="button"
          variant="outlined"
          :aria-pressed="tab === 'whitelist'"
          value="whitelist"
        >
          {{ t('market.whitelist') }}
          <span class="small muted">{{ whitelist.length }}</span>
        </VBtn>
        <VBtn
          type="button"
          variant="outlined"
          :aria-pressed="tab === 'blacklist'"
          value="blacklist"
        >
          {{ t('market.blacklist') }}
          <span class="small muted">{{ blacklist.length }}</span>
        </VBtn>
        <VBtn type="button" variant="outlined" :aria-pressed="tab === 'locks'" value="locks">
          {{ t('market.locks') }}
          <span class="small muted">{{ lockCount }}</span>
        </VBtn>
      </VBtnToggle>
      <div class="panel__actions d-flex align-center ga-2 flex-wrap">
        <VSwitch v-if="tab === 'whitelist'" v-model="positionsOnly">
          <template #label
            ><span class="d-flex flex-column"
              ><span>{{ t('market.showOnlyPositions') }}</span></span
            ></template
          >
        </VSwitch>
        <SearchToggle v-model="search" :placeholder="t('market.searchPairs')" />
      </div>
    </VCardItem>

    <!-- Keyboard users need a focus stop to scroll this list (WCAG 2.1.1). -->
    <VCardText
      v-if="tab === 'whitelist'"
      class="panel__body panel__body--flush market__scroll"
      tabindex="0"
      role="region"
      :aria-label="t('market.whitelist')"
    >
      <VEmptyState v-if="!whitelistRows.length" :text="t('empty.table')" class="pa-6" />
      <div v-else class="table-wrap market__whitelist">
        <VTable class="table table--clickable">
          <thead>
            <tr>
              <th scope="col">{{ t('market.pair') }}</th>
              <th scope="col">{{ t('trades.open') }}</th>
              <th scope="col" class="num">{{ t('market.closedProfit') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="pair in whitelistRows"
              :key="pair"
              :class="{ 'is-selected': selectedPair === pair }"
              @click="emit('selectPair', pair)"
            >
              <td>{{ pair }}</td>
              <td>
                <VChip v-if="openPairs.has(pair)" size="x-small" variant="tonal" color="primary">
                  {{ t('trades.open') }}
                </VChip>
                <span v-else class="muted small">—</span>
              </td>
              <td class="num" :class="format.toneClass(profitByPair.get(pair))">
                {{ format.signedMoney(profitByPair.get(pair) ?? null, stakeCurrency) }}
              </td>
            </tr>
          </tbody>
        </VTable>
      </div>
    </VCardText>

    <VCardText
      v-else-if="tab === 'blacklist'"
      class="panel__body d-flex flex-column ga-4 market__scroll"
      tabindex="0"
      role="region"
      :aria-label="t('market.blacklist')"
    >
      <div v-if="writesAllowed" class="d-flex align-center ga-2 flex-wrap">
        <VTextField
          :model-value="blacklistInput"
          class="num"
          :placeholder="t('market.addBlacklistPlaceholder')"
          @update:model-value="emit('update:blacklistInput', $event)"
          @keyup.enter="emit('addBlacklist')"
        />
        <VBtn
          color="primary"
          variant="flat"
          type="button"
          :disabled="!blacklistInput.trim() || actionPending === 'blacklistAdd'"
          @click="emit('addBlacklist')"
        >
          <AppIcon name="plus" />
          {{ t('actions.blacklistAdd') }}
        </VBtn>
      </div>
      <p v-if="!writesAllowed" class="small muted">
        {{ t('actions.controlsShortHint') }}
      </p>
      <VEmptyState v-if="!blacklistRows.length" :text="t('empty.table')" class="pa-6" />
      <ul v-else class="blist">
        <li v-for="entry in blacklistRows" :key="entry" class="blist__item">
          <span class="num blist__pattern">{{ entry }}</span>
          <VBtn
            v-if="writesAllowed"
            variant="text"
            type="button"
            @click="emit('removeBlacklist', entry)"
          >
            <AppIcon name="trash" />
            {{ t('actions.blacklistRemove') }}
          </VBtn>
        </li>
      </ul>
      <VAlert
        v-if="blacklistErrors"
        type="warning"
        variant="tonal"
        :text="t('market.blacklistErrors')"
      />
    </VCardText>

    <!-- Keyboard users need a focus stop to scroll this list (WCAG 2.1.1). -->
    <VCardText
      v-else
      class="panel__body panel__body--flush market__scroll responsive-table responsive-table--short"
      tabindex="0"
      role="region"
      :aria-label="t('market.locks')"
    >
      <VEmptyState v-if="!locks.length" :text="t('market.noLocks')" class="pa-6" />
      <VEmptyState v-else-if="!lockRows.length" :text="t('empty.table')" class="pa-6" />
      <div v-else class="table-wrap u-desktop-only">
        <VTable class="table">
          <thead>
            <tr>
              <th scope="col">{{ t('market.pair') }}</th>
              <th scope="col">{{ t('market.lockUntil') }}</th>
              <th scope="col">{{ t('market.lockReason') }}</th>
              <th scope="col">{{ t('market.locks') }}</th>
              <th v-if="canDeleteLocks" scope="col" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="lock in lockRows" :key="lock.id">
              <td>{{ lock.pair }}</td>
              <td class="num">{{ format.dateTime(lock.lock_end_timestamp) }}</td>
              <td class="table__muted">{{ lock.reason }}</td>
              <td>
                <VChip size="x-small" variant="tonal" :color="lock.active ? 'warning' : undefined">
                  {{ lock.active ? t('market.lockActive') : t('market.lockInactive') }}
                </VChip>
              </td>
              <td v-if="canDeleteLocks">
                <VBtn
                  v-if="lock.active"
                  color="error"
                  type="button"
                  @click="emit('removeLock', lock)"
                >
                  <AppIcon name="unlock" />
                  {{ t('actions.deleteLock') }}
                </VBtn>
              </td>
            </tr>
          </tbody>
        </VTable>
      </div>

      <VList v-if="lockRows.length" role="list" class="lock-details u-mobile-only" lines="three">
        <VListItem v-for="lock in lockRows" :key="lock.id" role="listitem" class="border-b">
          <template #title
            ><span class="num">{{ lock.pair }}</span>
            <VChip size="x-small" variant="tonal" :color="lock.active ? 'warning' : undefined">{{
              lock.active ? t('market.lockActive') : t('market.lockInactive')
            }}</VChip></template
          >
          <template #subtitle
            ><span class="d-block"
              >{{ t('market.lockUntil') }} {{ format.dateTime(lock.lock_end_timestamp) }}</span
            ><span class="d-block">{{ lock.reason }}</span></template
          >
          <template #append
            ><VBtn
              v-if="canDeleteLocks && lock.active"
              color="error"
              @click="emit('removeLock', lock)"
              ><AppIcon name="unlock" />{{ t('actions.deleteLock') }}</VBtn
            ></template
          >
        </VListItem>
      </VList>
    </VCardText>
  </VCard>
</template>

<style scoped>
.lock-details :deep(.v-list-item-subtitle) {
  -webkit-line-clamp: unset;
  white-space: normal;
}
/* Let sticky headers follow the outer list's vertical scroll. */
.market__whitelist {
  overflow: visible;
}

.market__whitelist td:first-child {
  font-family: var(--font-data);
}

.market__pairs {
  flex: 1;
  min-height: 0;
}

.market__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.is-selected {
  background: var(--ink-750);
}

.blist {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.blist__item {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: 6px 0;
  border-bottom: 1px solid var(--line);
}

.blist__pattern {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--fs-sm);
}
</style>

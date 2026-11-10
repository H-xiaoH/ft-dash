<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { VVirtualScroll } from 'vuetify/components/VVirtualScroll'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import FilterMenu, { type FilterOption } from '@/components/FilterMenu.vue'
import SearchToggle from '@/components/SearchToggle.vue'
import { useFormat } from '@/composables/useFormat'
import type { DateTimeParts } from '@/lib/format'
import type { LogsResponse } from '@/lib/types'
import { useBotStore } from '@/stores/bot'

const LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'] as const
type Level = (typeof LEVELS)[number]

const { t } = useI18n()
const format = useFormat()
const bot = useBotStore()

const minLevel = ref<Level>('INFO')
const search = ref('')
const follow = ref(true)
const pausedLogs = shallowRef<LogsResponse['logs'] | null>(null)
const logsRef = useTemplateRef<InstanceType<typeof VVirtualScroll>>('logs')

const levelOptions: FilterOption<Level>[] = LEVELS.map((level) => ({ value: level, label: level }))

function normalizeLevel(level: string): Level | null {
  const normalized = level.trim().toUpperCase()
  if (normalized === 'WARN' || normalized === 'WARNING') return 'WARNING'
  return LEVELS.includes(normalized as Level) ? (normalized as Level) : null
}

interface DisplayLogLine {
  key: string
  line: LogsResponse['logs'][number]
  dateTime: DateTimeParts
}

const lines = computed<DisplayLogLine[]>(() => {
  const minIndex = LEVELS.indexOf(minLevel.value)
  const query = search.value.trim().toLowerCase()
  const rows = pausedLogs.value ?? bot.logs?.logs ?? []
  return rows
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => {
      const level = normalizeLevel(line[3] ?? '')
      const index = level === null ? -1 : LEVELS.indexOf(level)
      // Unknown levels have no defined place in the ordering, so they must not bypass the filter.
      if (index === -1 || index < minIndex) return false
      if (query && !`${line[2]} ${line[4]}`.toLowerCase().includes(query)) return false
      return true
    })
    .slice()
    .reverse()
    .map(({ line, index }) => ({
      key: `${line[1]}:${index}`,
      line,
      dateTime: format.dateTimeParts(line[0]),
    }))
})

watch(lines, async () => {
  if (!follow.value || pausedLogs.value !== null) return
  await nextTick()
  if (follow.value && pausedLogs.value === null) logsRef.value?.scrollToIndex(0)
})

function pauseFollowing() {
  // Hold the visible window even if new logs evict the row being read on the backend.
  pausedLogs.value ??= [...(bot.logs?.logs ?? [])]
}

function onLogScroll(event: Event) {
  if (!(event.currentTarget instanceof HTMLElement) || !follow.value) return
  if (event.currentTarget.scrollTop > 4) pauseFollowing()
  else pausedLogs.value = null
}

async function returnToLatest() {
  pausedLogs.value = null
  follow.value = true
  await nextTick()
  const element = logsRef.value?.$el
  if (element instanceof HTMLElement) {
    element.scrollTop = 0
    element.focus({ preventScroll: true })
  }
}

watch(follow, (enabled) => {
  if (enabled && pausedLogs.value !== null) void returnToLatest()
  else if (!enabled) pauseFollowing()
})

function levelColor(level: string): string {
  const normalized = level.toUpperCase()
  if (normalized.startsWith('ERROR') || normalized.startsWith('CRIT')) return 'error'
  if (normalized.startsWith('WARN')) return 'warning'
  if (normalized.startsWith('DEBUG')) return ''
  return 'primary'
}
</script>

<template>
  <VCard tag="section" class="panel logs-page">
    <VCardItem class="panel__head">
      <VCardTitle tag="span" class="panel__title">{{ t('logs.title') }}</VCardTitle>
      <span class="panel__meta num">{{ t('logs.lines', { n: lines.length }) }}</span>
      <div class="panel__actions d-flex align-center ga-2 flex-wrap">
        <FilterMenu
          v-model="minLevel"
          :options="levelOptions"
          :prefix="t('logs.level')"
          :label="t('logs.filterLevel')"
        />
        <SearchToggle v-model="search" :placeholder="t('logs.searchLogs')" />
        <VSwitch v-model="follow">
          <template #label
            ><span class="d-flex flex-column"
              ><span>{{ t('logs.follow') }}</span></span
            ></template
          >
        </VSwitch>
        <VBtn v-if="pausedLogs !== null" variant="text" type="button" @click="returnToLatest">
          <AppIcon name="chevronUp" />
          {{ t('logs.backToLatest') }}
        </VBtn>
      </div>
    </VCardItem>
    <VCardText class="panel__body panel__body--flush">
      <VEmptyState v-if="!lines.length" :text="t('logs.empty')" class="pa-6" />
      <VList v-else role="presentation" class="logs pa-0" bg-color="transparent">
        <VVirtualScroll
          ref="logs"
          :items="lines"
          item-key="key"
          :item-height="88"
          tabindex="0"
          role="list"
          :aria-label="t('logs.title')"
          @keydown.stop
          @scroll.passive="onLogScroll"
        >
          <template #default="{ item: entry }">
            <VListItem role="listitem" class="logs__line border-b py-2" :lines="false">
              <template #prepend
                ><span class="num text-caption text-medium-emphasis mr-4"
                  ><span class="d-block">{{ entry.dateTime.date }}</span
                  ><span class="d-block">{{ entry.dateTime.time }}</span></span
                ></template
              >
              <template #title
                ><div class="d-flex align-center ga-2 flex-wrap">
                  <VChip size="x-small" variant="tonal" :color="levelColor(entry.line[3])">{{
                    entry.line[3]
                  }}</VChip
                  ><span class="num text-caption text-medium-emphasis">{{ entry.line[2] }}</span>
                </div></template
              >
              <template #subtitle>{{ entry.line[4] }}</template>
            </VListItem>
          </template>
        </VVirtualScroll>
      </VList>
    </VCardText>
  </VCard>
</template>

<style scoped>
.logs-page {
  height: 100%;
}
.logs-page > :deep(.v-card-text) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.logs {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.logs__line :deep(.v-list-item-subtitle) {
  -webkit-line-clamp: unset;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>

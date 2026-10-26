<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
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
const logsRef = useTemplateRef<HTMLDivElement>('logs')

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
  const rows = bot.logs?.logs ?? []
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

watch(lines, async (_currentLines, previousLines) => {
  if (!follow.value || previousLines === undefined) return
  await nextTick()
  const container = logsRef.value
  // The API rows are rendered newest-first, so following the latest line means staying at
  // the top. This also handles an empty filtered result becoming visible again.
  if (container) container.scrollTop = 0
})

function levelClass(level: string): string {
  const normalized = level.toUpperCase()
  if (normalized.startsWith('ERROR') || normalized.startsWith('CRIT')) return 'chip--bad'
  if (normalized.startsWith('WARN')) return 'chip--warn'
  if (normalized.startsWith('DEBUG')) return ''
  return 'chip--accent'
}
</script>

<template>
  <section class="panel logs-page">
    <div class="panel__head">
      <span class="panel__title">{{ t('logs.title') }}</span>
      <span class="panel__meta num">{{ t('logs.lines', { n: lines.length }) }}</span>
      <div class="panel__actions row row--wrap">
        <FilterMenu
          v-model="minLevel"
          :options="levelOptions"
          :prefix="t('logs.level')"
          :label="t('logs.filterLevel')"
        />
        <SearchToggle v-model="search" :placeholder="t('logs.searchLogs')" />
        <label class="switch">
          <input v-model="follow" type="checkbox" />
          <span class="switch__track" />
          <span class="switch__text">
            <span class="switch__title small">{{ t('logs.follow') }}</span>
          </span>
        </label>
        <button
          type="button"
          class="btn btn--sm"
          :disabled="bot.refreshing"
          @click="bot.refreshSystem()"
        >
          <AppIcon name="refresh" />
          {{ t('common.refresh') }}
        </button>
      </div>
    </div>
    <div class="panel__body panel__body--flush">
      <div v-if="!lines.length" class="empty">{{ t('logs.empty') }}</div>
      <!-- Keyboard users need a focus stop to scroll the log (WCAG 2.1.1). -->
      <div v-else ref="logs" class="logs" tabindex="0" role="region" :aria-label="t('logs.title')">
        <div v-for="entry in lines" :key="entry.key" class="logs__line">
          <span class="logs__time num">
            <span class="logs__date">{{ entry.dateTime.date }}</span>
            <span class="logs__clock">{{ entry.dateTime.time }}</span>
          </span>
          <span class="chip" :class="levelClass(entry.line[3])">{{ entry.line[3] }}</span>
          <span class="logs__source num">{{ entry.line[2] }}</span>
          <span class="logs__message">{{ entry.line[4] }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/*
 * Fills what the viewport has left under the strip, with the list scrolling inside the panel
 * instead of the document: stopping at the last line left the rest of the screen empty. A
 * definite height, not a minimum — with only a minimum the list still grows the page.
 */
.logs-page {
  height: calc(100dvh - var(--topbar-h) - var(--shell-pad) - var(--shell-pad-bottom));
}

.logs-page :deep(.panel__body) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.logs {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  font-size: var(--fs-sm);
}

.logs__line {
  display: grid;
  grid-template-columns: auto auto minmax(90px, auto) 1fr;
  gap: var(--sp-3);
  align-items: baseline;
  padding: 5px var(--sp-4);
  border-bottom: 1px solid var(--line);
}

.logs__line:hover {
  background: var(--ink-800);
}

.logs__time {
  color: var(--text-3);
  font-size: var(--fs-xs);
  white-space: nowrap;
}

.logs__date,
.logs__clock {
  display: block;
}

.logs__source {
  color: var(--text-2);
  font-size: var(--fs-xs);
}

.logs__message {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

@media (max-width: 900px) {
  .logs__line {
    grid-template-columns: auto 1fr;
  }

  .logs__source,
  .logs__message {
    grid-column: 2;
  }
}
</style>

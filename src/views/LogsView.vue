<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import FilterMenu, { type FilterOption } from '@/components/FilterMenu.vue'
import SearchToggle from '@/components/SearchToggle.vue'
import { useFormat } from '@/composables/useFormat'
import { useBotStore } from '@/stores/bot'

const LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'] as const
type Level = (typeof LEVELS)[number]

const { t } = useI18n()
const format = useFormat()
const bot = useBotStore()

const minLevel = ref<string>('INFO')
const search = ref('')
const follow = ref(true)

const levelOptions: FilterOption[] = LEVELS.map((level) => ({ value: level, label: level }))

const lines = computed(() => {
  const minIndex = Math.max(0, LEVELS.indexOf(minLevel.value as Level))
  const query = search.value.trim().toLowerCase()
  const rows = bot.logs?.logs ?? []
  return rows
    .filter((line) => {
      const level = (line[3] ?? '').toUpperCase().replace('WARN', 'WARNING')
      const index = LEVELS.indexOf(level as Level)
      if (index !== -1 && index < minIndex) return false
      if (query && !`${line[2]} ${line[4]}`.toLowerCase().includes(query)) return false
      return true
    })
    .slice()
    .reverse()
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
  <section class="panel">
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
        <button type="button" class="btn btn--sm" :disabled="bot.refreshing" @click="bot.refreshSystem()">
          <AppIcon name="refresh" />
          {{ t('common.refresh') }}
        </button>
      </div>
    </div>
    <div class="panel__body panel__body--flush">
      <div v-if="!lines.length" class="empty">{{ t('logs.empty') }}</div>
      <div v-else class="logs">
        <div v-for="(line, index) in lines" :key="`${line[1]}-${index}`" class="logs__line">
          <span class="logs__time num">{{ format.dateTime(line[0]) }}</span>
          <span class="chip" :class="levelClass(line[3])">{{ line[3] }}</span>
          <span class="logs__source num">{{ line[2] }}</span>
          <span class="logs__message">{{ line[4] }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.logs {
  display: flex;
  flex-direction: column;
  max-height: 68vh;
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

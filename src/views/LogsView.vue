<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import { useFormat } from '@/composables/useFormat'
import { useBotStore } from '@/stores/bot'

const LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'] as const
type Level = (typeof LEVELS)[number]

const { t } = useI18n()
const format = useFormat()
const bot = useBotStore()

const minLevel = ref<Level>('INFO')
const search = ref('')
const follow = ref(true)

const lines = computed(() => {
  const minIndex = LEVELS.indexOf(minLevel.value)
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
        <label class="field field--inline">
          <span class="field__label small">{{ t('logs.filterLevel') }}</span>
          <select v-model="minLevel" class="select select--sm">
            <option v-for="level in LEVELS" :key="level" :value="level">{{ level }}</option>
          </select>
        </label>
        <label class="search">
          <AppIcon name="search" />
          <input
            v-model="search"
            class="search__input"
            type="search"
            :placeholder="t('logs.searchLogs')"
          />
        </label>
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
.select--sm {
  width: auto;
  padding: 5px 8px;
}

.search {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--ink-900);
  border: 1px solid var(--line-strong);
  border-radius: var(--r-1);
  padding: 4px 8px;
  color: var(--text-3);
}

.search__input {
  border: 0;
  background: transparent;
  padding: 3px 0;
  min-width: 140px;
  color: var(--text);
}

.search__input:focus {
  outline: none;
}

.field--inline {
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

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

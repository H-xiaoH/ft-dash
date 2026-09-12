<script setup>
import { computed, ref, watch } from 'vue'
import { useBotStore } from '@/stores/bot'
import { useSettingsStore } from '@/stores/settings'
import { fmtTime } from '@/utils/format'
import EmptyState from '@/components/EmptyState.vue'
import Icon from '@/components/Icon.vue'

const bot = useBotStore()
const settings = useSettingsStore()

const LEVELS = ['ALL', 'INFO', 'WARNING', 'ERROR', 'DEBUG', 'CRITICAL']
const level = ref('ALL')
const search = ref('')
const limit = ref(bot.logLimit)
const wrapToBottom = ref(true)
const viewport = ref(null)

/**
 * freqtrade ships two log row shapes:
 *   newer: [date, timestamp_ms, logger, level, message]
 *   older: [timestamp, level, message]
 */
function parseLine(entry) {
  if (Array.isArray(entry)) {
    if (entry.length >= 5) {
      return {
        ts: entry[1] ?? entry[0],
        level: String(entry[3] || 'INFO').toUpperCase(),
        logger: entry[2],
        message: entry[4],
      }
    }
    return {
      ts: entry[0],
      level: String(entry[1] || 'INFO').toUpperCase(),
      logger: '',
      message: entry[2],
    }
  }
  return {
    ts: entry?.time ?? entry?.timestamp,
    level: String(entry?.level || 'INFO').toUpperCase(),
    logger: entry?.name || '',
    message: entry?.message,
  }
}

const lines = computed(() => {
  const raw = bot.data.logs
  if (!Array.isArray(raw)) return []
  return raw
    .map(parseLine)
    .filter((line) => (level.value === 'ALL' ? true : line.level === level.value))
    .filter((line) => {
      const needle = search.value.trim().toLowerCase()
      if (!needle) return true
      return String(line.message || '').toLowerCase().includes(needle)
    })
})

async function reload() {
  bot.logLimit = Number(limit.value)
  await bot.load('logs')
  scrollToBottom()
}

// Logs are part of the shell's polling set while this route is open, so the
// toggle in the toolbar is the same global auto-refresh switch as the top bar.
function scrollToBottom() {
  if (!wrapToBottom.value) return
  requestAnimationFrame(() => {
    if (viewport.value) viewport.value.scrollTop = viewport.value.scrollHeight
  })
}

// Keep the newest lines in view when polling brings fresh ones in.
watch(
  () => bot.data.logs,
  () => scrollToBottom(),
)

function download() {
  const text = lines.value
    .map((line) => `${fmtTime(line.ts)} [${line.level}] ${line.message}`)
    .join('\n')
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `freqtrade-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`
  anchor.click()
  URL.revokeObjectURL(url)
}

const counts = computed(() => {
  const raw = bot.data.logs
  if (!Array.isArray(raw)) return {}
  const result = {}
  for (const entry of raw) {
    const key = parseLine(entry).level
    result[key] = (result[key] || 0) + 1
  }
  return result
})
</script>

<template>
  <div class="page-head">
    <div>
      <h2 class="page-title">日志</h2>
      <p class="page-sub">
        共 {{ lines.length }} 行 · 来自机器人内存日志缓冲区
      </p>
    </div>
    <div class="row wrap" style="gap: 8px">
      <label class="checkbox" title="使用「设置 → 数据刷新」中的全局间隔">
        <input v-model="settings.autoRefresh" type="checkbox" />
        自动刷新
      </label>
      <button class="btn btn--sm" @click="download">
        <Icon name="install" :size="14" />
        导出
      </button>
      <button class="btn btn--sm" :disabled="bot.loading.logs" @click="reload">
        <Icon name="refresh" :size="14" :class="bot.loading.logs ? 'spin' : ''" />
        刷新
      </button>
    </div>
  </div>

  <div class="grid grid-4">
    <div v-for="item in LEVELS.slice(1)" :key="item" class="stat" style="padding: 12px 14px">
      <div class="stat-head">
        <span
          class="stat-label upper"
          :class="
            item === 'ERROR' || item === 'CRITICAL'
              ? 'loss'
              : item === 'WARNING'
                ? 'warn'
                : item === 'INFO'
                  ? ''
                  : 'faint'
          "
        >
          {{ item }}
        </span>
      </div>
      <div class="stat-value" style="font-size: 20px">{{ counts[item] || 0 }}</div>
    </div>
  </div>

  <div class="card">
    <div class="card-head" style="flex-wrap: wrap; gap: 10px">
      <div class="segmented" style="max-width: 100%; overflow-x: auto">
        <button
          v-for="item in LEVELS"
          :key="item"
          :class="{ active: level === item }"
          @click="level = item"
        >
          {{ item }}
        </button>
      </div>

      <div class="row grow" style="gap: 8px; justify-content: flex-end; min-width: 220px">
        <div class="input-group" style="max-width: 240px">
          <span class="input-icon"><Icon name="search" :size="15" /></span>
          <input v-model="search" class="input" placeholder="搜索日志内容" />
        </div>
        <select v-model.number="limit" class="select" style="width: auto" @change="reload">
          <option :value="100">100 行</option>
          <option :value="200">200 行</option>
          <option :value="500">500 行</option>
          <option :value="1000">1000 行</option>
        </select>
      </div>
    </div>

    <div class="card-body">
      <EmptyState
        v-if="!lines.length"
        icon="logs"
        title="没有匹配的日志"
        message="尝试调整过滤条件，或点击刷新重新拉取日志。"
      />
      <div v-else ref="viewport" class="log-view">
        <div v-for="(line, index) in lines" :key="index" class="log-line">
          <span class="log-time">{{ fmtTime(line.ts) }}</span>
          <span class="log-level" :class="`log-level--${line.level.toLowerCase()}`">
            {{ line.level.slice(0, 5) }}
          </span>
          <span class="log-msg">{{ line.message }}</span>        </div>
      </div>
    </div>
  </div>
</template>

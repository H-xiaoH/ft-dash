<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { api } from '@/api/endpoints'
import { useBotStore } from '@/stores/bot'
import { fmtNumber, fmtPercentRatio } from '@/utils/format'
import CandleChart from '@/components/charts/CandleChart.vue'
import Icon from '@/components/Icon.vue'

const bot = useBotStore()

const TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '1w']
const LIMITS = [100, 200, 300, 500, 800]

const pair = ref('')
const timeframe = ref('')
const limit = ref(300)
const autoRefresh = ref(true)
const candles = ref([])
const loading = ref(false)
const error = ref('')
const lastLoadedAt = ref(0)

const pairs = computed(() => {
  const list = bot.data.whitelist?.whitelist
  return Array.isArray(list) ? [...list].sort() : []
})

const availableTimeframes = computed(() => {
  const configured = bot.data.config?.timeframe
  const list = new Set(TIMEFRAMES)
  if (configured) list.add(configured)
  return [...list].sort(
    (a, b) => TIMEFRAMES.indexOf(a) - TIMEFRAMES.indexOf(b),
  )
})

const last = computed(() => candles.value[candles.value.length - 1] || null)
const first = computed(() => candles.value[0] || null)

const change = computed(() => {
  if (!last.value || !first.value?.open) return null
  return (Number(last.value.close) - Number(first.value.open)) / Number(first.value.open)
})

async function loadCandles() {
  if (!pair.value || !timeframe.value) return
  loading.value = true
  error.value = ''
  try {
    const response = await api.pairCandles({
      pair: pair.value,
      timeframe: timeframe.value,
      limit: limit.value,
    })
    const cols = response?.columns || []
    const rows = response?.data || []
    candles.value = rows.map((row) => {
      const item = {}
      cols.forEach((name, index) => {
        item[name] = row[index]
      })
      return item
    })
    lastLoadedAt.value = Date.now()
  } catch (err) {
    error.value = err?.message || '加载K线失败'
    candles.value = []
  } finally {
    loading.value = false
  }
}

// Default to the bot's configured pair/timeframe once config and whitelist arrive.
watch(
  pairs,
  (list) => {
    if (!pair.value && list.length) pair.value = list[0]
  },
  { immediate: true },
)

watch(
  () => bot.data.config?.timeframe,
  (value) => {
    if (!timeframe.value) timeframe.value = value || '5m'
  },
  { immediate: true },
)

watch([pair, timeframe, limit], () => {
  if (pair.value && timeframe.value) loadCandles()
})

// Both default-selection watchers above run immediately, so they can settle
// before this watcher exists (for example when arriving with data already
// loaded). Load once explicitly so the chart is never left empty.
if (pair.value && timeframe.value) loadCandles()

let timer = null
function startTimer() {
  clearInterval(timer)
  if (!autoRefresh.value) return
  timer = setInterval(() => {
    if (!document.hidden && pair.value) loadCandles()
  }, 15_000)
}

watch(autoRefresh, startTimer, { immediate: true })
onBeforeUnmount(() => clearInterval(timer))

/** The whitelist runs to ~90 pairs, so the picker is filtered by a search box. */
const pairSearch = ref('')

const filteredPairs = computed(() => {
  const needle = pairSearch.value.trim().toUpperCase()
  if (!needle) return pairs.value
  const matches = pairs.value.filter((item) => item.toUpperCase().includes(needle))
  // Keep the current selection in the list even when the search excludes it, so the
  // picker never goes blank while a pair is loaded.
  if (pair.value && !matches.includes(pair.value)) return [pair.value, ...matches]
  return matches
})
</script>

<template>
  <div class="page-head">
    <div>
      <h2 class="page-title">K线图</h2>
      <p class="page-sub">实时取自运行中的机器人（pair_candles），无需额外的行情接口</p>
    </div>
    <div class="row wrap" style="gap: 8px">
      <label class="checkbox">
        <input v-model="autoRefresh" type="checkbox" />
        自动刷新
      </label>
      <button class="btn btn--sm" :disabled="loading || !pair" @click="loadCandles">
        <Icon name="refresh" :size="14" :class="loading ? 'spin' : ''" />
        刷新
      </button>
    </div>
  </div>

  <div class="card">
    <div class="card-head" style="flex-wrap: wrap; gap: 12px">
      <div class="row wrap" style="gap: 10px">
        <div class="input-group" style="max-width: 170px">
          <span class="input-icon"><Icon name="search" :size="15" /></span>
          <input v-model="pairSearch" class="input" placeholder="搜索交易对" spellcheck="false" />
        </div>

        <select v-model="pair" class="select" style="width: auto; min-width: 160px">
          <option v-if="!pairs.length" value="">白名单为空</option>
          <option v-else-if="!filteredPairs.length" value="">无匹配交易对</option>
          <option v-for="item in filteredPairs" :key="item" :value="item">{{ item }}</option>
        </select>

        <select v-model="timeframe" class="select" style="width: auto">
          <option v-for="item in availableTimeframes" :key="item" :value="item">{{ item }}</option>
        </select>

        <select v-model.number="limit" class="select" style="width: auto">
          <option v-for="item in LIMITS" :key="item" :value="item">最近 {{ item }} 根</option>
        </select>
      </div>

      <div class="row wrap" style="gap: 12px">
        <span v-if="last" class="row" style="gap: 8px">
          <span class="mono strong">{{ fmtNumber(last.close, 6) }}</span>
          <span class="badge" :class="change >= 0 ? 'badge--profit' : 'badge--loss'">
            {{ fmtPercentRatio(change) }}
          </span>
        </span>
        <span v-if="lastLoadedAt" class="tiny faint">
          {{ candles.length }} 根 · {{ new Date(lastLoadedAt).toLocaleTimeString() }}
        </span>
      </div>
    </div>

    <div class="card-body">
      <div v-if="error" class="form-error" style="margin-bottom: 14px">
        <Icon name="alert" :size="15" style="flex: none" />
        <span>{{ error }}</span>
      </div>

      <CandleChart :candles="candles" :height="420" />
    </div>
  </div>
</template>

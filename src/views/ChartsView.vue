<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { api } from '@/api/endpoints'
import { useBotStore } from '@/stores/bot'
import { fmtNumber, fmtPercentRatio } from '@/utils/format'
import { filterPairs } from '@/utils/pairSearch'
import CandleChart from '@/components/charts/CandleChart.vue'
import Icon from '@/components/Icon.vue'

const bot = useBotStore()

const LIMITS = [100, 200, 300, 500, 800]

const pair = ref('')
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

/**
 * freqtrade only backfills candles for the timeframe the strategy is configured
 * with - every other timeframe answers 200 with an empty series, so a picker
 * would offer choices that can never render. Follow the configuration instead.
 */
const timeframe = computed(() => bot.data.config?.timeframe || '5m')

const last = computed(() => candles.value[candles.value.length - 1] || null)
const first = computed(() => candles.value[0] || null)

const change = computed(() => {
  if (!last.value || !first.value?.open) return null
  return (Number(last.value.close) - Number(first.value.open)) / Number(first.value.open)
})

async function loadCandles() {
  if (!pair.value) return
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

/* -------------------------------------------------------------- pair picker */

// One search box that doubles as the dropdown - the previous pair of controls
// (a filter box *and* a select) had no obvious way to be used.
const pairQuery = ref('')
const comboOpen = ref(false)
const highlight = ref(0)

const pairMatches = computed(() => filterPairs(pairs.value, pairQuery.value))

watch(pairQuery, () => {
  highlight.value = 0
})

function openCombo() {
  comboOpen.value = true
  highlight.value = 0
  // Clear the committed pair so the first keystroke filters instead of appending.
  if (pairQuery.value === pair.value) pairQuery.value = ''
}

function closeCombo() {
  comboOpen.value = false
  pairQuery.value = pair.value
}

// `mousedown.prevent` on an option keeps the input focused, but touch input is
// not guaranteed to send one, so a short grace period backs it up.
let blurTimer = null
function onBlur() {
  clearTimeout(blurTimer)
  blurTimer = setTimeout(closeCombo, 140)
}

function selectPair(item) {
  clearTimeout(blurTimer)
  pair.value = item
  pairQuery.value = item
  comboOpen.value = false
}

function move(step) {
  if (!comboOpen.value) {
    comboOpen.value = true
    return
  }
  const total = pairMatches.value.length
  if (!total) return
  highlight.value = (highlight.value + step + total) % total
}

function pickHighlighted() {
  const item = pairMatches.value[highlight.value]
  if (item) selectPair(item)
  else closeCombo()
}

function onEscape(event) {
  event.target?.blur()
  closeCombo()
}

/* ------------------------------------------------------------------ loading */

// Default to the bot's first whitelisted pair once the whitelist arrives.
watch(
  pairs,
  (list) => {
    if (!pair.value && list.length) {
      pair.value = list[0]
      pairQuery.value = list[0]
    }
  },
  { immediate: true },
)

watch([pair, timeframe, limit], () => {
  if (pair.value) loadCandles()
})

// The default-selection watcher above runs immediately, so it can settle before
// this watcher exists (for example when arriving with data already loaded).
// Load once explicitly so the chart is never left empty.
if (pair.value) loadCandles()

let timer = null
function startTimer() {
  clearInterval(timer)
  if (!autoRefresh.value) return
  timer = setInterval(() => {
    if (!document.hidden && pair.value) loadCandles()
  }, 15_000)
}

watch(autoRefresh, startTimer, { immediate: true })
onBeforeUnmount(() => {
  clearInterval(timer)
  clearTimeout(blurTimer)
})
</script>

<template>
  <div class="page-head">
    <div>
      <h2 class="page-title">K线图</h2>
      <p class="page-sub">
        实时取自运行中的机器人（pair_candles），周期跟随策略配置的 {{ timeframe }}
      </p>
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
        <div class="input-group combo" style="width: 220px">
          <span class="input-icon"><Icon name="search" :size="15" /></span>
          <input
            v-model="pairQuery"
            class="input"
            type="text"
            placeholder="搜索交易对"
            spellcheck="false"
            autocomplete="off"
            role="combobox"
            :aria-expanded="comboOpen"
            @focus="openCombo"
            @input="comboOpen = true"
            @blur="onBlur"
            @keydown.down.prevent="move(1)"
            @keydown.up.prevent="move(-1)"
            @keydown.enter.prevent="pickHighlighted"
            @keydown.esc="onEscape"
          />
          <ul v-if="comboOpen" class="combo-list">
            <li v-if="!pairs.length" class="combo-empty">白名单为空</li>
            <li v-else-if="!pairMatches.length" class="combo-empty">无匹配交易对</li>
            <template v-else>
              <li
                v-for="(item, index) in pairMatches"
                :key="item"
                class="combo-item"
                :class="{ 'is-active': index === highlight, 'is-selected': item === pair }"
                @mousedown.prevent="selectPair(item)"
                @mouseenter="highlight = index"
              >
                <span class="mono">{{ item }}</span>
                <Icon v-if="item === pair" name="check" :size="13" />
              </li>
            </template>
          </ul>
        </div>

        <select v-model.number="limit" class="select" style="width: auto">
          <option v-for="item in LIMITS" :key="item" :value="item">最近 {{ item }} 根</option>
        </select>

        <span class="badge" title="freqtrade 只为策略配置的周期回填历史K线">
          周期 {{ timeframe }}
        </span>
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

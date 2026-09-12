import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

const KEY = 'ft.settings'

// ponytail: 2s polling is the floor - it replaces a WebSocket client (reconnect,
// auth token, ~130 lines) that was never requested. Add push only if a fill really
// must land in under 2s.
export const REFRESH_OPTIONS = [
  { label: '2 秒', value: 2000 },
  { label: '5 秒', value: 5000 },
  { label: '10 秒', value: 10_000 },
  { label: '30 秒', value: 30_000 },
  { label: '1 分钟', value: 60_000 },
  { label: '关闭', value: 0 },
]

export const useSettingsStore = defineStore('settings', () => {
  const theme = ref('dark')
  const refreshInterval = ref(10_000)
  const autoRefresh = ref(true)
  const highlightProfitRows = ref(true)
  const tableDensity = ref('comfortable')

  function applyTheme(value) {
    const resolved =
      value === 'auto'
        ? window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : value
    document.documentElement.dataset.theme = resolved
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolved === 'light' ? '#f6f7fb' : '#0b0f1a')
  }

  function hydrate() {
    let saved = {}
    try {
      saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}
    } catch {
      saved = {}
    }
    if (saved.theme) theme.value = saved.theme
    if (typeof saved.refreshInterval === 'number') refreshInterval.value = saved.refreshInterval
    if (typeof saved.autoRefresh === 'boolean') autoRefresh.value = saved.autoRefresh
    if (typeof saved.highlightProfitRows === 'boolean')
      highlightProfitRows.value = saved.highlightProfitRows
    if (saved.tableDensity) tableDensity.value = saved.tableDensity
    applyTheme(theme.value)
  }

  function persist() {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        theme: theme.value,
        refreshInterval: refreshInterval.value,
        autoRefresh: autoRefresh.value,
        highlightProfitRows: highlightProfitRows.value,
        tableDensity: tableDensity.value,
      }),
    )
  }

  watch([theme, refreshInterval, autoRefresh, highlightProfitRows, tableDensity], persist)
  watch(theme, applyTheme)

  // Follow the OS palette while in "auto" mode.
  if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if (theme.value === 'auto') applyTheme('auto')
    })
  }

  const effectiveRefreshMs = computed(() => (autoRefresh.value ? refreshInterval.value : 0))

  return {
    theme,
    refreshInterval,
    autoRefresh,
    highlightProfitRows,
    tableDensity,
    effectiveRefreshMs,
    hydrate,
    applyTheme,
  }
})

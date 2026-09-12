import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const KEY = 'ft.settings'

/**
 * Polling cadence for the dashboard data.
 *
 * Fixed rather than user-configurable: the data-refresh card was removed from
 * settings, so there is no longer any control for it. Note this is an aggregate
 * cost - each tick refreshes the core slices plus whatever the current route adds,
 * so a 1s cadence means roughly eight requests a second against the bot.
 */
export const REFRESH_INTERVAL_MS = 1000

export const useSettingsStore = defineStore('settings', () => {
  const theme = ref('dark')
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
        highlightProfitRows: highlightProfitRows.value,
        tableDensity: tableDensity.value,
      }),
    )
  }

  watch([theme, highlightProfitRows, tableDensity], persist)
  watch(theme, applyTheme)

  // Follow the OS palette while in "auto" mode.
  if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if (theme.value === 'auto') applyTheme('auto')
    })
  }

  return {
    theme,
    highlightProfitRows,
    tableDensity,
    hydrate,
    applyTheme,
  }
})

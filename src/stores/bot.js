import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import { api } from '@/api/endpoints'
import { ApiError } from '@/api/client'
import { firstNumber, isOpenTrade, toNumber, tradeProfitAbs } from '@/utils/format'

/** Endpoint groups by how often they need to be fetched. */
export const CORE_KEYS = [
  'config',
  'version',
  'health',
  'profit',
  'balance',
  'count',
  'openTrades',
  'locks',
]
const ANALYTICS_KEYS = ['performance', 'stats', 'daily', 'weekly', 'monthly']
const MARKET_KEYS = ['whitelist', 'blacklist']

export const useBotStore = defineStore('bot', () => {
  const data = reactive({
    config: null,
    version: null,
    health: null,
    sysinfo: null,
    profit: null,
    balance: null,
    count: null,
    openTrades: [],
    performance: [],
    stats: null,
    daily: [],
    weekly: [],
    monthly: [],
    trades: [],
    whitelist: null,
    blacklist: null,
    locks: [],
    logs: [],
    strategies: null,
  })

  const loading = reactive({})
  const errors = reactive({})
  const online = ref(false)
  const lastUpdated = ref(0)
  const bootstrapped = ref(false)
  const refreshing = ref(false)

  const tradeLimit = ref(50)
  const tradesOffset = ref(0)
  const tradesHasMore = ref(false)
  /** Total rows reported by the server, or null when it did not say. */
  const tradesTotal = ref(null)
  const logLimit = ref(200)
  const logCount = ref(0)

  /* --------------------------------------------------------------- loaders */

  // `/trades` must be sorted newest-first server-side, otherwise offset 0 is the
  // oldest page - which is not what a history view should open on.
  const loaders = {
    config: () => api.showConfig(),
    version: () => api.version(),
    health: () => api.health(),
    sysinfo: () => api.sysinfo(),
    profit: () => api.profit(),
    balance: () => api.balance(),
    count: () => api.count(),
    openTrades: () => api.status(),
    performance: () => api.performance(),
    stats: () => api.stats(),
    daily: () => api.daily(30),
    weekly: () => api.weekly(12),
    monthly: () => api.monthly(12),
    trades: () => api.trades({ limit: tradeLimit.value, offset: tradesOffset.value }),
    whitelist: () => api.whitelist(),
    blacklist: () => api.blacklist(),
    locks: () => api.locks(),
    logs: () => api.logs(logLimit.value),
    strategies: () => api.strategies(),
  }

  /**
   * freqtrade wraps several list endpoints in an envelope object
   * (`{trades, data, locks, logs}`) and mixes seconds/milliseconds for timestamps.
   * Normalise here so every view can assume a plain array.
   */
  function normalizeResult(key, result) {
    switch (key) {
      case 'trades': {
        const list = Array.isArray(result) ? result : result?.trades || []
        tradesTotal.value = firstNumber(result?.total_trades, null)
        return list
      }
      case 'daily':
      case 'weekly':
      case 'monthly':
        return Array.isArray(result) ? result : result?.data || []
      case 'locks':
        return Array.isArray(result) ? result : result?.locks || []
      case 'logs': {
        const list = Array.isArray(result) ? result : result?.logs || []
        logCount.value = firstNumber(result?.log_count, list.length) ?? list.length
        return list
      }
      default:
        return result
    }
  }

  function messageFor(error) {
    if (error instanceof ApiError) return error.message
    return error?.message || '未知错误'
  }

  /**
   * Fetch one slice. Never throws: a single failing endpoint (for example `/stats`
   * on an older bot) must not take down the whole dashboard.
   */
  async function load(key, { silent = false } = {}) {
    const loader = loaders[key]
    if (!loader) return false
    if (!silent) loading[key] = true
    try {
      const result = normalizeResult(key, await loader())
      if (key === 'trades') {
        const total = tradesTotal.value
        tradesHasMore.value =
          total === null
            ? result.length >= tradeLimit.value
            : tradesOffset.value + result.length < total
      }
      data[key] = result
      errors[key] = ''
      online.value = true
      lastUpdated.value = Date.now()
      return true
    } catch (error) {
      errors[key] = messageFor(error)
      if (error instanceof ApiError && (error.isNetwork || error.isAuth)) online.value = false
      return false
    } finally {
      if (!silent) loading[key] = false
    }
  }

  async function loadMany(keys, options = {}) {
    await Promise.all(keys.map((key) => load(key, options)))
  }

  /** The fast path used by the polling loop. */
  function refreshCore({ silent = true } = {}) {
    return loadMany(CORE_KEYS, { silent })
  }

  async function refreshAll() {
    refreshing.value = true
    try {
      await loadMany([...CORE_KEYS, ...ANALYTICS_KEYS, ...MARKET_KEYS, 'trades'], { silent: true })
      bootstrapped.value = true
    } finally {
      refreshing.value = false
    }
  }

  async function refreshAnalytics() {
    await loadMany(ANALYTICS_KEYS, { silent: true })
  }

  function setTradesPage(offset) {
    tradesOffset.value = Math.max(0, offset)
    return load('trades')
  }

  function reset() {
    for (const key of Object.keys(data)) {
      data[key] = Array.isArray(data[key]) ? [] : null
    }
    data.locks = []
    data.trades = []
    data.logs = []
    tradesTotal.value = null
    logCount.value = 0
    for (const key of Object.keys(errors)) errors[key] = ''
    online.value = false
    lastUpdated.value = 0
    bootstrapped.value = false
  }

  /* -------------------------------------------------------------- derived */

  /**
   * freqtrade returns -100 for sortino/calmar when there is not enough data to
   * compute them. Surface that as "unavailable" rather than printing a
   * meaningless -100 next to real numbers.
   */
  function metricOrNull(value, sentinel = -100) {
    const n = toNumber(value)
    if (n === null) return null
    return n === sentinel ? null : n
  }

  const summary = computed(() => {
    const p = data.profit || {}
    const ratioMean = firstNumber(
      p.profit_all_ratio_mean,
      toNumber(p.profit_all_percent_mean) !== null ? p.profit_all_percent_mean / 100 : null,
      p.profit_all_percent !== undefined ? p.profit_all_percent / 100 : null,
    )
    const closedRatio = firstNumber(
      p.profit_closed_ratio_mean,
      toNumber(p.profit_closed_percent_mean) !== null ? p.profit_closed_percent_mean / 100 : null,
      p.profit_closed_percent !== undefined ? p.profit_closed_percent / 100 : null,
    )
    const winning = firstNumber(p.winning_trades, 0)
    const losing = firstNumber(p.losing_trades, 0)
    const decided = (winning ?? 0) + (losing ?? 0)
    return {
      absAll: firstNumber(p.profit_all_coin, p.profit_closed_coin, 0),
      ratioAll: ratioMean,
      pctAll: ratioMean === null ? null : ratioMean * 100,
      absClosed: firstNumber(p.profit_closed_coin, 0),
      pctClosed: closedRatio === null ? null : closedRatio * 100,
      fiatAll: firstNumber(p.profit_all_fiat, null),
      tradeCount: firstNumber(p.trade_count, 0),
      closedTradeCount: firstNumber(p.closed_trade_count, 0),
      openTradeCount: Math.max(
        0,
        (firstNumber(p.trade_count, 0) ?? 0) - (firstNumber(p.closed_trade_count, 0) ?? 0),
      ),
      winning,
      losing,
      winRate:
        decided > 0
          ? (winning / decided) * 100
          : toNumber(p.winrate) !== null
            ? p.winrate * 100
            : null,
      bestPair: p.best_pair || null,
      bestRate: firstNumber(p.best_rate, null),
      avgDuration: p.avg_duration || null,
      profitFactor: firstNumber(p.profit_factor, null),
      expectancy: firstNumber(p.expectancy, null),
      expectancyRatio: firstNumber(p.expectancy_ratio, null),
      sharpe: firstNumber(p.sharpe, null),
      sortino: metricOrNull(p.sortino),
      calmar: metricOrNull(p.calmar),
      sqn: firstNumber(p.sqn, null),
      cagr: firstNumber(p.cagr, null),
      maxDrawdown: firstNumber(p.max_drawdown, null),
      maxDrawdownAbs: firstNumber(p.max_drawdown_abs, null),
      currentDrawdown: firstNumber(p.current_drawdown, null),
      tradingVolume: firstNumber(p.trading_volume, null),
      stakeCurrency: p.stake_currency || data.config?.stake_currency || '',
      startingCapital: firstNumber(p.starting_capital, data.config?.available_capital, null),
      firstTradeDate: p.first_trade_date || null,
      latestTradeDate: p.latest_trade_date || null,
      botStartDate: p.bot_start_date || null,
    }
  })

  const balanceTotal = computed(() => {
    const b = data.balance || {}
    return firstNumber(b.total, b.value, null)
  })

  const stakeCurrency = computed(
    () => data.config?.stake_currency || data.balance?.stake || summary.value.stakeCurrency || '',
  )

  const balanceCurrencies = computed(() => {
    const list = data.balance?.currencies
    if (!Array.isArray(list)) return []
    return [...list]
      .filter((row) => toNumber(row.balance ?? row.free) > 0 || row.is_position)
      .sort((a, b) => (toNumber(b.est_stake ?? b.balance) ?? 0) - (toNumber(a.est_stake ?? a.balance) ?? 0))
  })

  const openTradesCount = computed(() =>
    firstNumber(data.count?.current, data.openTrades?.length, 0),
  )
  const maxOpenTrades = computed(() =>
    firstNumber(data.count?.max, data.config?.max_open_trades, null),
  )

  const botState = computed(() => {
    const state = data.config?.state || data.health?.state
    if (state) return String(state).toLowerCase()
    return data.health?.last_process ? 'running' : 'unknown'
  })

  const dryRun = computed(() => Boolean(data.config?.dry_run))

  const runmode = computed(() => data.config?.runmode || '—')

  /** Newest-first performance rows for tables and charts. */
  const performanceRows = computed(() => {
    const rows = Array.isArray(data.performance) ? data.performance : []
    return rows
      .map((row) => ({
        pair: row.pair,
        count: firstNumber(row.count, 0),
        abs: firstNumber(row.profit_abs, 0),
        ratio: firstNumber(
          row.profit_ratio,
          toNumber(row.profit_pct) !== null ? row.profit_pct / 100 : null,
          0,
        ),
      }))
      .sort((a, b) => b.abs - a.abs)
  })

  const statsSummary = computed(() => {
    const s = data.stats || {}
    const reasons = s.exit_reasons || s.sell_reasons || {}
    const rows = Object.entries(reasons).map(([reason, value]) => {
      const wins = firstNumber(value.wins, 0)
      const losses = firstNumber(value.losses, 0)
      const draws = firstNumber(value.draws, 0)
      const trades = firstNumber(value.trades, wins + losses + draws, 0)
      return {
        reason,
        trades,
        wins,
        losses,
        draws,
        winRate: trades > 0 ? (wins / trades) * 100 : null,
        ratio: firstNumber(
          value.profit_ratio,
          toNumber(value.profit_pct) !== null ? value.profit_pct / 100 : null,
          null,
        ),
        abs: firstNumber(value.profit_abs, null),
      }
    })
    rows.sort((a, b) => b.trades - a.trades)

    // `durations` is either per-bucket seconds (newer) or {avg,max,min} objects (older).
    const durations = Object.entries(s.durations || {})
      .map(([key, value]) =>
        value && typeof value === 'object'
          ? { key, avg: value.avg, max: value.max, min: value.min }
          : { key, avg: value, max: null, min: null },
      )
      .filter((row) => toNumber(row.avg) !== null || typeof row.avg === 'string')

    const tradedTotal = rows.reduce((sum, row) => sum + row.trades, 0)
    return {
      rows,
      durations,
      totalTrades: firstNumber(s.total_trades, tradedTotal, 0),
    }
  })

  /**
   * Cumulative realised profit, oldest first.
   * `/daily` arrives newest-first, so it is reversed to read left-to-right.
   */
  const profitTrend = computed(() => {
    const rows = Array.isArray(data.daily) ? [...data.daily].reverse() : []
    let cumulative = 0
    return rows.map((row) => {
      const abs = firstNumber(row.abs_profit, 0)
      cumulative += abs
      return {
        date: row.date,
        abs,
        cumulative,
        rel: firstNumber(row.rel_profit, null),
        trades: firstNumber(row.trade_count, 0),
      }
    })
  })

  const openTradesValue = computed(() =>
    (data.openTrades || []).reduce((sum, trade) => {
      const amount = firstNumber(trade.amount, trade.amount_requested, 0)
      const rate = firstNumber(trade.current_rate, trade.open_rate, 0)
      return sum + amount * rate
    }, 0),
  )

  const openTradesProfitAbs = computed(() =>
    (data.openTrades || []).reduce((sum, trade) => sum + (tradeProfitAbs(trade) ?? 0), 0),
  )

  const recentClosed = computed(() =>
    (data.trades || []).filter((trade) => !isOpenTrade(trade)),
  )

  const errorList = computed(() =>
    Object.entries(errors)
      .filter(([, message]) => Boolean(message))
      .map(([key, message]) => ({ key, message })),
  )

  return {
    data,
    /** Valid slice names - used to validate route `meta.load` / `meta.poll`. */
    loaderKeys: Object.keys(loaders),
    loading,
    errors,
    errorList,
    online,
    lastUpdated,
    bootstrapped,
    refreshing,
    tradeLimit,
    tradesOffset,
    tradesHasMore,
    tradesTotal,
    logLimit,
    logCount,
    summary,
    balanceTotal,
    balanceCurrencies,
    stakeCurrency,
    openTradesCount,
    maxOpenTrades,
    botState,
    dryRun,
    runmode,
    performanceRows,
    statsSummary,
    profitTrend,
    openTradesValue,
    openTradesProfitAbs,
    recentClosed,
    load,
    loadMany,
    refreshCore,
    refreshAll,
    refreshAnalytics,
    setTradesPage,
    reset,
  }
})

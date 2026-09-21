import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import {
  ApiError,
  describeError,
  FreqtradeApi,
  websocketUrl,
  type Credentials,
} from '@/lib/api'
import { parseTimestamp } from '@/lib/format'
import {
  classifyJwtFailure,
  nextRetryDelay,
  planStreamAuth,
  STREAM_FAILURE_LIMIT,
  type JwtFailure,
  type StreamAuthMode,
} from '@/lib/stream'
import type {
  BalanceResponse,
  BlacklistResponse,
  DailyResponse,
  DeleteLockPayload,
  EntryStats,
  ExitStats,
  ForceEnterPayload,
  HealthResponse,
  LocksResponse,
  LogsResponse,
  MixTagStats,
  PairCandlesResponse,
  PerformanceEntry,
  ProfitAllResponse,
  ProfitSummary,
  ShowConfigResponse,
  StatusCountResponse,
  SysInfoResponse,
  Trade,
  TradeStats,
  WhitelistResponse,
  WsMessage,
  LockPayload,
} from '@/lib/types'
import { useEventsStore } from './events'
import { useSettingsStore } from './settings'

export type ConnectionState = 'idle' | 'connecting' | 'online' | 'unauthorized' | 'unreachable'

const TRADES_PAGE_SIZE = 300
/** Poll cadence. Cheap slices run every tick, heavier ones every few ticks. */
const POLL_INTERVAL_SECONDS = 1

export const useBotStore = defineStore('bot', () => {
  const settings = useSettingsStore()
  const events = useEventsStore()

  const client = shallowRef<FreqtradeApi | null>(null)
  const connection = ref<ConnectionState>('idle')
  const errorKey = ref<{ key: string; params?: Record<string, unknown> } | null>(null)
  const latencyMs = ref<number | null>(null)
  const lastFetchAt = ref<number | null>(null)
  const refreshing = ref(false)
  const actionPending = ref<string | null>(null)
  const actionError = ref<string | null>(null)

  const showConfig = ref<ShowConfigResponse | null>(null)
  const health = ref<HealthResponse | null>(null)
  const sysinfo = ref<SysInfoResponse | null>(null)
  const balance = ref<BalanceResponse | null>(null)
  const profit = ref<ProfitSummary | null>(null)
  const profitAll = ref<ProfitAllResponse | null>(null)
  const openTrades = ref<Trade[]>([])
  const count = ref<StatusCountResponse | null>(null)
  const trades = ref<Trade[]>([])
  const tradesTotal = ref(0)
  const tradeStats = ref<TradeStats | null>(null)
  // Named `performanceStats` because the global `performance` is used for latency.
  const performanceStats = ref<PerformanceEntry[]>([])
  const entryStats = ref<EntryStats[]>([])
  const exitStats = ref<ExitStats[]>([])
  const mixTags = ref<MixTagStats[]>([])
  const daily = ref<DailyResponse | null>(null)
  const weekly = ref<DailyResponse | null>(null)
  const monthly = ref<DailyResponse | null>(null)
  const whitelist = ref<WhitelistResponse | null>(null)
  const blacklist = ref<BlacklistResponse | null>(null)
  const locks = ref<LocksResponse | null>(null)
  const logs = ref<LogsResponse | null>(null)
  const candleCache = ref<Record<string, PairCandlesResponse>>({})

  let pollTimer: number | null = null
  let pollInFlight = false
  let tick = 0
  let ws: WebSocket | null = null
  let wsRetry = 0
  let wsTimer: number | null = null
  let stopped = false
  let streamFailures = 0
  let streamOpened = false
  /** Set when a JWT handshake is rejected, so auto mode can fall back to ws_token. */
  let streamPreferToken = false

  const streamAuthMode = ref<StreamAuthMode>('off')
  const streamReasonKey = ref<string | null>(null)
  const streamBlocked = ref(false)

  const stakeCurrency = computed(() => showConfig.value?.stake_currency ?? 'USDT')
  const fiatCurrency = computed(() => balance.value?.symbol ?? 'USD')
  const isLiveAccount = computed(() => showConfig.value?.dry_run === false)
  const stakeCurrencyRow = computed(() =>
    balance.value?.currencies.find((currency) => currency.currency === balance.value?.stake),
  )
  const availableBalance = computed(
    () =>
      stakeCurrencyRow.value?.free ??
      balance.value?.total_bot ??
      balance.value?.total ??
      null,
  )
  const positionValue = computed(() =>
    (balance.value?.currencies ?? [])
      .filter((currency) => currency.is_position)
      .reduce((sum, currency) => sum + (currency.est_stake ?? 0), 0),
  )
  const winRate = computed(() => {
    const summary = profit.value
    if (!summary) return null
    const decided = summary.winning_trades + summary.losing_trades
    return decided > 0 ? (summary.winning_trades / decided) * 100 : null
  })
  const isBotRunning = computed(() => {
    const state = showConfig.value?.state
    if (state) return state === 'running'
    return connection.value === 'online'
  })
  const heartbeatAgeMs = computed(() => {
    const ts = parseTimestamp(health.value?.last_process_ts ?? health.value?.last_process ?? null)
    return ts === null ? null : Date.now() - ts
  })
  const closedTrades = computed(() => trades.value.filter((trade) => !trade.is_open))
  const recentClosed = computed(() =>
    [...closedTrades.value]
      .sort((a, b) => (b.close_timestamp ?? 0) - (a.close_timestamp ?? 0))
      .slice(0, 12),
  )
  const tradesByPair = computed(() => {
    const map = new Map<string, Trade[]>()
    for (const trade of trades.value) {
      const list = map.get(trade.pair) ?? []
      list.push(trade)
      map.set(trade.pair, list)
    }
    return map
  })

  function ensureClient(): FreqtradeApi {
    const credentials: Credentials = {
      baseUrl: settings.baseUrl,
      username: settings.username,
      password: settings.password,
    }
    if (!client.value) {
      client.value = new FreqtradeApi(credentials)
    }
    return client.value
  }

  function rebuildClient() {
    client.value = null
  }

  function recordError(error: unknown) {
    errorKey.value = describeError(error)
    if (error instanceof ApiError) {
      if (error.kind === 'auth') connection.value = 'unauthorized'
      else if (error.kind === 'cors' || error.kind === 'offline') connection.value = 'unreachable'
    }
  }

  async function track<T>(task: () => Promise<T>): Promise<T | null> {
    const started = performance.now()
    try {
      const result = await task()
      latencyMs.value = Math.round(performance.now() - started)
      lastFetchAt.value = Date.now()
      errorKey.value = null
      if (connection.value !== 'online') connection.value = 'online'
      return result
    } catch (error) {
      recordError(error)
      return null
    }
  }

  // --- data loading --------------------------------------------------------

  async function refreshCore() {
    const api = ensureClient()
    const results = await Promise.all([
      track(() => api.status()),
      track(() => api.count()),
      track(() => api.balance()),
      track(() => api.profit()),
      track(() => api.health()),
    ])
    if (results[0]) openTrades.value = results[0]
    if (results[1]) count.value = results[1]
    if (results[2]) balance.value = results[2]
    if (results[3]) profit.value = results[3]
    if (results[4]) health.value = results[4]
  }

  async function refreshTrades() {
    const api = ensureClient()
    const result = await track(() => api.trades({ limit: TRADES_PAGE_SIZE }))
    if (result) {
      trades.value = result.trades
      tradesTotal.value = result.total_trades
    }
  }

  /** Explicit paged fetch used by the trades view's "load more". */
  async function fetchTrades(limit: number) {
    const result = await track(() => ensureClient().trades({ limit }))
    if (result) {
      trades.value = result.trades
      tradesTotal.value = result.total_trades
    }
    return result
  }

  async function refreshAnalytics() {
    const api = ensureClient()
    const [stats, perf, entries, exits, mix, dailyRes, weeklyRes, monthlyRes, all] =
      await Promise.all([
        track(() => api.tradeStats()),
        track(() => api.performance()),
        track(() => api.entries()),
        track(() => api.exits()),
        track(() => api.mixTags()),
        track(() => api.daily(60)),
        track(() => api.weekly(52)),
        track(() => api.monthly(24)),
        track(() => api.profitAll()),
      ])
    if (stats) tradeStats.value = stats
    if (perf) performanceStats.value = perf
    if (entries) entryStats.value = entries
    if (exits) exitStats.value = exits
    if (mix) mixTags.value = mix
    if (dailyRes) daily.value = dailyRes
    if (weeklyRes) weekly.value = weeklyRes
    if (monthlyRes) monthly.value = monthlyRes
    if (all) profitAll.value = all
  }

  async function refreshMarket() {
    const api = ensureClient()
    const [white, black, lockRes] = await Promise.all([
      track(() => api.whitelist()),
      track(() => api.blacklist()),
      track(() => api.locks()),
    ])
    if (white) whitelist.value = white
    if (black) blacklist.value = black
    if (lockRes) locks.value = lockRes
  }

  async function refreshSystem() {
    const api = ensureClient()
    const [info, config, logRes] = await Promise.all([
      track(() => api.sysinfo()),
      track(() => api.showConfig()),
      track(() => api.logs(150)),
    ])
    if (info) sysinfo.value = info
    if (config) {
      showConfig.value = config
      applyConfigMetadata(config)
    }
    if (logRes) logs.value = logRes
  }

  async function refreshAll() {
    if (refreshing.value) return
    refreshing.value = true
    try {
      await refreshCore()
      await Promise.all([refreshTrades(), refreshAnalytics(), refreshMarket(), refreshSystem()])
    } finally {
      refreshing.value = false
    }
  }

  /** Cheap slices refreshed on every poll tick. */
  async function pollTick() {
    if (document.visibilityState === 'hidden') return
    // A slow round trip must not stack requests on the next tick.
    if (pollInFlight) return
    pollInFlight = true
    try {
      tick += 1
      await refreshCore()
      if (tick % 4 === 0) await Promise.all([refreshTrades(), refreshMarket()])
      if (tick % 12 === 0) await Promise.all([refreshAnalytics(), refreshSystem()])
    } finally {
      pollInFlight = false
    }
  }

  function startPolling() {
    stopPolling()
    pollTimer = window.setInterval(() => {
      void pollTick()
    }, POLL_INTERVAL_SECONDS * 1000)
  }

  function stopPolling() {
    if (pollTimer !== null) {
      window.clearInterval(pollTimer)
      pollTimer = null
    }
  }

  function resetData() {
    showConfig.value = null
    health.value = null
    sysinfo.value = null
    balance.value = null
    profit.value = null
    profitAll.value = null
    openTrades.value = []
    count.value = null
    trades.value = []
    tradesTotal.value = 0
    tradeStats.value = null
    performanceStats.value = []
    entryStats.value = []
    exitStats.value = []
    mixTags.value = []
    daily.value = null
    weekly.value = null
    monthly.value = null
    whitelist.value = null
    blacklist.value = null
    locks.value = null
    logs.value = null
    candleCache.value = {}
  }

  // --- connection lifecycle ------------------------------------------------

  async function connect(): Promise<boolean> {
    if (!settings.baseUrl || !settings.username || !settings.password) {
      errorKey.value = { key: 'errors.config' }
      return false
    }
    stopped = false
    connection.value = 'connecting'
    errorKey.value = null
    rebuildClient()
    try {
      const api = ensureClient()
      const started = performance.now()
      await api.ping()
      const config = await api.showConfig()
      latencyMs.value = Math.round(performance.now() - started)
      showConfig.value = config
      settings.persistCredentials()
      connection.value = 'online'
      errorKey.value = null
      await refreshAll()
      startPolling()
      if (settings.websocket) retryStream()
      return true
    } catch (error) {
      recordError(error)
      connection.value =
        error instanceof ApiError && error.kind === 'auth' ? 'unauthorized' : 'unreachable'
      return false
    }
  }

  function applyConfigMetadata(config: ShowConfigResponse) {
    const botName = typeof config.bot_name === 'string' ? config.bot_name : ''
    if (botName) document.title = `ft-dash · ${botName}`
  }

  async function autoConnect() {
    if (!settings.hasCredentials) return
    await connect()
  }

  function cleanup() {
    stopped = true
    stopPolling()
    disconnectStream()
  }

  // --- websocket -----------------------------------------------------------

  /** Resolves the token the socket needs: an operator ws_token, or a fresh JWT. */
  async function resolveStreamAuth(api: FreqtradeApi) {
    if (settings.streamAuth === 'ws_token') {
      return planStreamAuth({
        preference: settings.streamAuth,
        wsToken: settings.wsToken,
        jwtToken: null,
      })
    }

    let jwtToken: string | null = null
    let jwtFailure: JwtFailure | undefined
    const skipJwt = streamPreferToken && settings.wsToken.trim().length > 0
    if (!skipJwt) {
      try {
        jwtToken = await api.login()
      } catch (error) {
        jwtFailure = classifyJwtFailure(error)
        events.push({
          type: 'stream.auth',
          subject: jwtFailure,
          detail: '',
          severity: 'warn',
        })
      }
    }
    return planStreamAuth({
      preference: settings.streamAuth,
      wsToken: settings.wsToken,
      jwtToken,
      jwtFailure,
      jwtDisallowed: skipJwt,
    })
  }

  async function connectStream() {
    const api = client.value
    if (!api || !settings.websocket) {
      streamAuthMode.value = 'off'
      streamReasonKey.value = null
      events.setStatus('off')
      return
    }
    events.setStatus('connecting')
    try {
      const plan = await resolveStreamAuth(api)
      streamAuthMode.value = plan.mode
      streamReasonKey.value = plan.reason ?? null
      if (!plan.connectable || !plan.token) {
        events.setStatus('off')
        // Configuration problems need a human; transient ones are worth retrying.
        streamBlocked.value = plan.reason !== 'errors.wsAuthUnavailable'
        if (!streamBlocked.value) scheduleReconnect()
        return
      }
      streamBlocked.value = false
      streamOpened = false
      const socket = new WebSocket(websocketUrl(api.baseUrl, plan.token))
      ws = socket
      socket.addEventListener('open', () => {
        wsRetry = 0
        streamFailures = 0
        streamOpened = true
        streamPreferToken = false
        streamReasonKey.value = null
        events.setStatus('open')
        socket.send(
          JSON.stringify({
            type: 'subscribe',
            data: [
              'entry',
              'entry_fill',
              'entry_cancel',
              'exit',
              'exit_fill',
              'exit_cancel',
              'protection_trigger',
              'protection_trigger_global',
              'strategy_msg',
              'warning',
              'exception',
              'startup',
              'shutdown',
              'status',
              'whitelist',
            ],
          }),
        )
      })
      socket.addEventListener('message', (event) => {
        handleStreamMessage(event.data)
      })
      socket.addEventListener('close', () => {
        if (ws === socket) ws = null
        events.setStatus('closed')
        if (!streamOpened) {
          // In auto mode a rejected JWT may just mean the bot wants its ws_token.
          if (
            settings.streamAuth === 'auto' &&
            !streamPreferToken &&
            settings.wsToken.trim() &&
            streamAuthMode.value === 'jwt'
          ) {
            streamPreferToken = true
            events.push({ type: 'stream.auth', subject: 'fallback', detail: '', severity: 'warn' })
            scheduleReconnect()
            return
          }
          streamFailures += 1
          if (streamFailures >= STREAM_FAILURE_LIMIT) {
            streamBlocked.value = true
            streamReasonKey.value = 'errors.wsRejected'
            return
          }
        }
        scheduleReconnect()
      })
      socket.addEventListener('error', () => {
        events.setStatus('error', 'socket-error')
      })
    } catch (error) {
      events.setStatus('error', error instanceof ApiError ? error.kind : 'login-failed')
      streamReasonKey.value = 'errors.wsAuthUnavailable'
      scheduleReconnect()
    }
  }

  function handleStreamMessage(raw: unknown) {
    if (typeof raw !== 'string') return
    let parsed: WsMessage
    try {
      parsed = JSON.parse(raw) as WsMessage
    } catch {
      return
    }
    events.ingest(parsed)
    maybeNotify(parsed)
    if (
      ['entry_fill', 'exit_fill', 'entry_cancel', 'exit_cancel', 'protection_trigger'].includes(
        parsed.type,
      )
    ) {
      void refreshCore()
    }
    if (parsed.type === 'shutdown' || parsed.type === 'startup') {
      void refreshSystem()
    }
  }

  function maybeNotify(message: WsMessage) {
    if (!settings.notifications) return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const interesting = ['entry_fill', 'exit_fill', 'warning', 'exception', 'protection_trigger']
    if (!interesting.includes(message.type)) return
    const data = (message.data ?? {}) as Record<string, unknown>
    const pair = typeof data.pair === 'string' ? data.pair : ''
    const ratio = typeof data.profit_ratio === 'number' ? data.profit_ratio * 100 : null
    const body = [pair, ratio === null ? '' : `${ratio.toFixed(2)}%`].filter(Boolean).join(' · ')
    try {
      new Notification(`ft-dash · ${message.type}`, { body, tag: message.type })
    } catch {
      /* notification failures are not worth surfacing */
    }
  }

  function scheduleReconnect() {
    if (stopped || !settings.websocket || streamBlocked.value) return
    if (connection.value !== 'online') return
    if (wsTimer !== null) window.clearTimeout(wsTimer)
    wsRetry += 1
    const delay = nextRetryDelay(wsRetry)
    wsTimer = window.setTimeout(() => {
      void connectStream()
    }, delay)
  }

  /** Manual recovery after a blocked handshake (Settings → live stream). */
  function retryStream() {
    streamFailures = 0
    streamBlocked.value = false
    streamReasonKey.value = null
    streamPreferToken = false
    if (!settings.websocket) {
      events.setStatus('off')
      return
    }
    void connectStream()
  }

  function disconnectStream() {
    if (wsTimer !== null) {
      window.clearTimeout(wsTimer)
      wsTimer = null
    }
    streamFailures = 0
    streamOpened = false
    if (ws) {
      const socket = ws
      ws = null
      socket.close()
    }
    events.setStatus('off')
  }

  // --- write actions -------------------------------------------------------

  async function runAction<T>(name: string, task: () => Promise<T>): Promise<T | null> {
    actionPending.value = name
    actionError.value = null
    try {
      const result = await task()
      events.push({ type: 'action', subject: name, detail: '', severity: 'info' })
      return result
    } catch (error) {
      const described = describeError(error)
      actionError.value = described.key
      return null
    } finally {
      actionPending.value = null
    }
  }

  async function fetchCandles(pair: string, timeframe: string, limit = 180) {
    const key = `${pair}|${timeframe}`
    const api = ensureClient()
    const result = await track(() =>
      api.pairCandles(pair, timeframe, limit, ['date', 'open', 'high', 'low', 'close', 'volume']),
    )
    if (result) candleCache.value = { ...candleCache.value, [key]: result }
    return result
  }

  watch(
    () => settings.websocket,
    (enabled) => {
      if (!enabled) {
        disconnectStream()
        return
      }
      if (connection.value === 'online' && !ws) retryStream()
    },
  )

  // Changing how the socket authenticates must take effect immediately.
  watch([() => settings.streamAuth, () => settings.wsToken], () => {
    if (!settings.websocket) return
    retryStream()
  })

  return {
    // state
    connection,
    errorKey,
    latencyMs,
    lastFetchAt,
    refreshing,
    actionPending,
    actionError,
    showConfig,
    health,
    sysinfo,
    balance,
    profit,
    profitAll,
    openTrades,
    count,
    trades,
    tradesTotal,
    tradeStats,
    performance: performanceStats,
    entryStats,
    exitStats,
    mixTags,
    daily,
    weekly,
    monthly,
    whitelist,
    blacklist,
    locks,
    logs,
    candleCache,
    // getters
    stakeCurrency,
    fiatCurrency,
    availableBalance,
    positionValue,
    winRate,
    isLiveAccount,
    isBotRunning,
    heartbeatAgeMs,
    closedTrades,
    recentClosed,
    tradesByPair,
    // lifecycle
    connect,
    autoConnect,
    refreshAll,
    refreshCore,
    refreshTrades,
    fetchTrades,
    refreshAnalytics,
    refreshMarket,
    refreshSystem,
    resetData,
    rebuildClient,
    startPolling,
    stopPolling,
    cleanup,
    connectStream,
    retryStream,
    disconnectStream,
    streamAuthMode,
    streamReasonKey,
    streamBlocked,
    pollIntervalSeconds: POLL_INTERVAL_SECONDS,
    fetchCandles,
    runAction,
    ensureClient,
    // raw write endpoints, wrapped by the UI with confirmation
    hasClient: computed(() => client.value !== null),
    forceExit: (tradeid: number | string, ordertype: 'market' | 'limit' = 'market') =>
      runAction('forceExit', () => ensureClient().forceExit({ tradeid, ordertype })),
    forceEnter: (payload: ForceEnterPayload) =>
      runAction('forceEnter', () => ensureClient().forceEnter(payload)),
    start: () => runAction('start', () => ensureClient().start()),
    stop: () => runAction('stop', () => ensureClient().stop()),
    pauseEntries: () => runAction('pause', () => ensureClient().pause()),
    reloadConfig: () => runAction('reloadConfig', () => ensureClient().reloadConfig()),
    addBlacklist: (pairs: string[]) =>
      runAction('blacklistAdd', () => ensureClient().addBlacklist(pairs)),
    deleteBlacklist: (pairs: string[]) =>
      runAction('blacklistDelete', () => ensureClient().deleteBlacklist(pairs)),
    deleteLock: (payload: DeleteLockPayload) =>
      runAction('lockDelete', () => ensureClient().deleteLock(payload)),
    addLock: (payload: LockPayload[]) => runAction('lockAdd', () => ensureClient().addLocks(payload)),
  }
})

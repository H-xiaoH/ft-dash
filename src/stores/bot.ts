import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { ApiError, describeError, FreqtradeApi, websocketUrl, type Credentials } from '@/lib/api'
import { CANDLE_COLUMNS, SIGNAL_COLUMNS } from '@/lib/candles'
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
  ForceEnterPayload,
  HealthResponse,
  LocksResponse,
  LogsResponse,
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
import { i18n } from '@/i18n'

export type ConnectionState = 'idle' | 'connecting' | 'online' | 'unauthorized' | 'unreachable'

const TRADES_PAGE_SIZE = 300
/** Poll cadence. Cheap slices run every tick, heavier ones every few ticks. */
const POLL_INTERVAL_SECONDS = 1
/**
 * The bot processes every few seconds, so a minute of silence means it is stuck.
 * Also drives the lagging banner on the system page.
 */
/*
 * How long the bot's process loop may go quiet before we call it stalled. Freqtrade's
 * process_throttle_secs defaults to 5s, so this tolerates six missed rounds — low enough
 * to alert quickly, high enough not to cry wolf on a loaded box.
 */
export const HEARTBEAT_STALE_MS = 30_000

/** Every event the bot can push that this dashboard shows; sent as one subscribe message. */
const STREAM_TOPICS = [
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
] as const

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
  const daily = ref<DailyResponse | null>(null)
  const weekly = ref<DailyResponse | null>(null)
  const monthly = ref<DailyResponse | null>(null)
  const whitelist = ref<WhitelistResponse | null>(null)
  const blacklist = ref<BlacklistResponse | null>(null)
  const locks = ref<LocksResponse | null>(null)
  const logs = ref<LogsResponse | null>(null)
  const candleCache = ref<Record<string, PairCandlesResponse>>({})

  let pollTimer: number | null = null
  interface PollRun {
    epoch: number
    token: number
  }

  interface RefreshRun {
    epoch: number
    token: number
  }

  let pollInFlight: PollRun | null = null
  let nextPollToken = 0
  let refreshInFlight: RefreshRun | null = null
  let nextRefreshToken = 0
  let tick = 0
  let ws: WebSocket | null = null
  let wsRetry = 0
  let wsTimer: number | null = null
  let stopped = false
  /**
   * Bumped whenever the dashboard is pointed at another bot. Requests that were already
   * in flight then belong to the previous bot, and their answers must not be painted over
   * the new one's figures — dropping them is what keeps "one bot at a time" honest.
   */
  let botEpoch = 0
  /** Serializes bot selection, removal and direct reconnects so stale rollback cannot win. */
  let lifecycleToken = 0
  let streamFailures = 0
  let streamOpened = false
  let streamAttempt = 0
  /** Set when a JWT handshake is rejected, so auto mode can fall back to ws_token. */
  let streamPreferToken = false

  const streamAuthMode = ref<StreamAuthMode>('off')
  const streamReasonKey = ref<string | null>(null)
  const streamBlocked = ref(false)

  /**
   * Last figures of every bot this session has shown. Switching back paints instantly
   * instead of flashing a skeleton; the first real response replaces the copy.
   */
  const snapshots = new Map<string, Snapshot>()
  /** True while the page shows a snapshot nothing has confirmed yet. */
  const snapshotStale = ref(false)

  const stakeCurrency = computed(() => showConfig.value?.stake_currency ?? 'USDT')
  const fiatCurrency = computed(() => balance.value?.symbol ?? 'USD')
  const isLiveAccount = computed(() => showConfig.value?.dry_run === false)
  const stakeCurrencyRow = computed(() =>
    balance.value?.currencies.find((currency) => currency.currency === balance.value?.stake),
  )
  const availableBalance = computed(
    () => stakeCurrencyRow.value?.free ?? balance.value?.total_bot ?? balance.value?.total ?? null,
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

  /** Writes need both the operator's go-ahead and data that is not a stale snapshot. */
  const writesAllowed = computed(() => settings.writesEnabled && !snapshotStale.value)
  const activeBotName = computed(() => settings.activeBotName)
  /** Every closed trade the app has loaded, newest first — no artificial cap. */
  const closedByRecency = computed(() =>
    [...closedTrades.value].sort((a, b) => (b.close_timestamp ?? 0) - (a.close_timestamp ?? 0)),
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

  function isCurrentLifecycle(token: number): boolean {
    return token === lifecycleToken
  }

  function recordError(error: unknown) {
    errorKey.value = describeError(error)
    if (error instanceof ApiError) {
      if (error.kind === 'auth') connection.value = 'unauthorized'
      else if (error.kind === 'cors' || error.kind === 'offline') connection.value = 'unreachable'
    }
  }

  async function track<T>(task: () => Promise<T>): Promise<T | null> {
    const epoch = botEpoch
    try {
      const result = await task()
      // A switch happened while this request was in flight: the answer is another bot's.
      if (epoch !== botEpoch) return null
      lastFetchAt.value = Date.now()
      errorKey.value = null
      if (connection.value !== 'online') connection.value = 'online'
      return result
    } catch (error) {
      // A switch happened while this request was in flight: its failure belongs to the
      // previous bot too, so it must not make the new bot look unreachable.
      if (epoch !== botEpoch) return null
      recordError(error)
      return null
    }
  }

  // --- data loading --------------------------------------------------------

  /**
   * Core figures, refreshed on every tick. The latency readout is published once for
   * the whole pass: when every request published its own sample the number rattled
   * through half a dozen values within 100 ms, because the calls run in parallel and
   * land a few milliseconds apart.
   */
  async function refreshCore() {
    const epoch = botEpoch
    const started = performance.now()
    const api = ensureClient()
    const results = await Promise.all([
      track(() => api.status()),
      track(() => api.count()),
      track(() => api.balance()),
      track(() => api.profit()),
      track(() => api.health()),
      track(() => api.sysinfo()),
    ])
    if (epoch !== botEpoch) return
    if (results[0]) openTrades.value = results[0]
    if (results[1]) count.value = results[1]
    if (results[2]) balance.value = results[2]
    if (results[3]) profit.value = results[3]
    if (results[4]) health.value = results[4]
    if (results[5]) sysinfo.value = results[5]
    latencyMs.value = Math.round(performance.now() - started)
  }

  async function refreshTrades() {
    const epoch = botEpoch
    const api = ensureClient()
    const result = await track(() => api.trades({ limit: TRADES_PAGE_SIZE }))
    if (epoch !== botEpoch) return
    if (result) {
      trades.value = result.trades
      tradesTotal.value = result.total_trades
    }
  }

  /** Explicit paged fetch used by the trades view's "load more". */
  async function fetchTrades(limit: number) {
    const epoch = botEpoch
    const result = await track(() => ensureClient().trades({ limit }))
    if (epoch !== botEpoch) return result
    if (result) {
      trades.value = result.trades
      tradesTotal.value = result.total_trades
    }
    return result
  }

  async function refreshAnalytics() {
    const epoch = botEpoch
    const api = ensureClient()
    const [stats, perf, dailyRes, weeklyRes, monthlyRes, all] = await Promise.all([
      track(() => api.tradeStats()),
      track(() => api.performance()),
      track(() => api.daily(60)),
      track(() => api.weekly(52)),
      track(() => api.monthly(24)),
      track(() => api.profitAll()),
    ])
    if (epoch !== botEpoch) return
    if (stats) tradeStats.value = stats
    if (perf) performanceStats.value = perf
    if (dailyRes) daily.value = dailyRes
    if (weeklyRes) weekly.value = weeklyRes
    if (monthlyRes) monthly.value = monthlyRes
    if (all) profitAll.value = all
  }

  async function refreshMarket() {
    const epoch = botEpoch
    const api = ensureClient()
    const [white, black, lockRes] = await Promise.all([
      track(() => api.whitelist()),
      track(() => api.blacklist()),
      track(() => api.locks()),
    ])
    if (epoch !== botEpoch) return
    if (white) whitelist.value = white
    if (black) blacklist.value = black
    if (lockRes) locks.value = lockRes
  }

  async function refreshSystem() {
    const epoch = botEpoch
    const api = ensureClient()
    const [config, logRes] = await Promise.all([
      track(() => api.showConfig()),
      track(() => api.logs(150)),
    ])
    if (epoch !== botEpoch) return
    if (config) {
      showConfig.value = config
      applyConfigMetadata(config)
    }
    if (logRes) logs.value = logRes
  }

  async function refreshAll() {
    if (refreshInFlight !== null) return
    const run: RefreshRun = { epoch: botEpoch, token: ++nextRefreshToken }
    refreshInFlight = run
    refreshing.value = true
    try {
      await refreshCore()
      if (run.epoch !== botEpoch || refreshInFlight?.token !== run.token) return
      await Promise.all([refreshTrades(), refreshAnalytics(), refreshMarket(), refreshSystem()])
    } finally {
      if (refreshInFlight?.token === run.token) {
        refreshInFlight = null
        refreshing.value = false
      }
    }
  }

  /** How often the hidden-tab watchdog may ask, regardless of the visible cadence. */
  const BACKGROUND_CHECK_MS = 10_000

  function isCurrentPoll(run: PollRun): boolean {
    return run.epoch === botEpoch && pollInFlight?.token === run.token
  }

  /** Cheap slices refreshed on every poll tick. */
  async function pollTick() {
    // A slow round trip must not stack requests on the next tick.
    if (pollInFlight !== null) return
    const run: PollRun = { epoch: botEpoch, token: ++nextPollToken }
    pollInFlight = run
    try {
      if (!isCurrentPoll(run)) return
      const now = Date.now()
      if (document.visibilityState === 'hidden') {
        /*
         * Background tabs otherwise stop polling to save battery — but the point of
         * the alert is catching a stuck bot while you are elsewhere, so keep one
         * cheap request alive when notifications are enabled.
         *
         * That watchdog runs on its own slower cadence: an alert only has to notice a
         * stall, and asking once a second for the first five minutes hidden cost ~300
         * requests for a check whose answer changes once. Ten seconds still lands well
         * inside the stale threshold.
         *
         * ponytail: past that the browser owns the clock — Chrome clamps hidden timers
         * to ~1/min after ~5 minutes and mobile Safari may freeze the page outright, so
         * a stalled bot surfaces within roughly a minute rather than 30 seconds.
         * Guaranteed 30s would need a push server, which this front-end-only app
         * deliberately does not have.
         */
        if (settings.notifications && now - lastBackgroundCheck >= BACKGROUND_CHECK_MS) {
          lastBackgroundCheck = now
          await checkHeartbeat(run)
        }
        return
      }
      tick += 1
      await refreshCore()
      if (!isCurrentPoll(run)) return
      evaluateHeartbeatAlert()
      if (tick % 4 === 0) {
        await Promise.all([refreshTrades(), refreshMarket()])
        if (!isCurrentPoll(run)) return
      }
      if (tick % 12 === 0) {
        await Promise.all([refreshAnalytics(), refreshSystem()])
        if (!isCurrentPoll(run)) return
      }
    } finally {
      // A newer bot or poll run owns the latch now; an old finally must not release it.
      if (pollInFlight?.token === run.token) pollInFlight = null
    }
  }

  /** Health-only refresh, used as the background watchdog. */
  async function checkHeartbeat(run: PollRun) {
    if (!isCurrentPoll(run)) return
    const api = ensureClient()
    const result = await track(() => api.health())
    if (!isCurrentPoll(run)) return
    if (result) health.value = result
    evaluateHeartbeatAlert()
  }

  let heartbeatAlerted = false
  /** When the hidden-tab watchdog last asked; see BACKGROUND_CHECK_MS. */
  let lastBackgroundCheck = 0

  function evaluateHeartbeatAlert() {
    const age = heartbeatAgeMs.value
    if (age === null) return
    if (age > HEARTBEAT_STALE_MS) {
      if (heartbeatAlerted) return
      heartbeatAlerted = true
      notify(
        i18n.global.t('notify.heartbeatTitle'),
        i18n.global.t('notify.heartbeatBody', { age: formatShortDuration(age) }),
      )
      return
    }
    // Back to normal: re-arm so the next outage alerts again.
    heartbeatAlerted = false
  }

  function formatShortDuration(ms: number): string {
    const minutes = Math.floor(ms / 60_000)
    const seconds = Math.round((ms % 60_000) / 1000)
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
  }

  /** Single gate for every system notification. */
  function notify(title: string, body: string, tag?: string) {
    if (!settings.notifications) return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    try {
      new Notification(title, { body, tag })
    } catch {
      /* notification failures are not worth surfacing */
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
    // Invalidate an in-flight run immediately. Its request cannot be cancelled here,
    // but its continuations and finally block will fail the token check.
    pollInFlight = null
  }

  function resetData() {
    snapshotStale.value = false
    connection.value = 'idle'
    errorKey.value = null
    latencyMs.value = null
    lastFetchAt.value = null
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
    daily.value = null
    weekly.value = null
    monthly.value = null
    whitelist.value = null
    blacklist.value = null
    locks.value = null
    logs.value = null
    candleCache.value = {}
  }

  /** Everything a page reads, minus the connection state that is rebuilt on switch. */
  interface Snapshot {
    latencyMs: number | null
    lastFetchAt: number | null
    showConfig: ShowConfigResponse | null
    health: HealthResponse | null
    sysinfo: SysInfoResponse | null
    balance: BalanceResponse | null
    profit: ProfitSummary | null
    profitAll: ProfitAllResponse | null
    openTrades: Trade[]
    count: StatusCountResponse | null
    trades: Trade[]
    tradesTotal: number
    tradeStats: TradeStats | null
    performanceStats: PerformanceEntry[]
    daily: DailyResponse | null
    weekly: DailyResponse | null
    monthly: DailyResponse | null
    whitelist: WhitelistResponse | null
    blacklist: BlacklistResponse | null
    locks: LocksResponse | null
    logs: LogsResponse | null
    candleCache: Record<string, PairCandlesResponse>
  }

  function captureSnapshot(): Snapshot {
    return {
      latencyMs: latencyMs.value,
      lastFetchAt: lastFetchAt.value,
      showConfig: showConfig.value,
      health: health.value,
      sysinfo: sysinfo.value,
      balance: balance.value,
      profit: profit.value,
      profitAll: profitAll.value,
      openTrades: openTrades.value,
      count: count.value,
      trades: trades.value,
      tradesTotal: tradesTotal.value,
      tradeStats: tradeStats.value,
      performanceStats: performanceStats.value,
      daily: daily.value,
      weekly: weekly.value,
      monthly: monthly.value,
      whitelist: whitelist.value,
      blacklist: blacklist.value,
      locks: locks.value,
      logs: logs.value,
      candleCache: candleCache.value,
    }
  }

  function restoreSnapshot(snapshot: Snapshot) {
    latencyMs.value = snapshot.latencyMs
    lastFetchAt.value = snapshot.lastFetchAt
    showConfig.value = snapshot.showConfig
    health.value = snapshot.health
    sysinfo.value = snapshot.sysinfo
    balance.value = snapshot.balance
    profit.value = snapshot.profit
    profitAll.value = snapshot.profitAll
    openTrades.value = snapshot.openTrades
    count.value = snapshot.count
    trades.value = snapshot.trades
    tradesTotal.value = snapshot.tradesTotal
    tradeStats.value = snapshot.tradeStats
    performanceStats.value = snapshot.performanceStats
    daily.value = snapshot.daily
    weekly.value = snapshot.weekly
    monthly.value = snapshot.monthly
    whitelist.value = snapshot.whitelist
    blacklist.value = snapshot.blacklist
    locks.value = snapshot.locks
    logs.value = snapshot.logs
    candleCache.value = snapshot.candleCache
  }

  /**
   * Write dialogs are the one place the active bot has to name itself: everywhere else
   * the page simply shows the current bot's data, but a forced exit or a start/stop
   * must be unambiguous about which account it is about to touch.
   */
  function labelWithBot(label: string): string {
    return activeBotName.value ? `${label} · ${activeBotName.value}` : label
  }

  /**
   * Points the whole dashboard at another bot. The caller (settings) decides *when*;
   * this keeps the connection, the cache and the polling timers in step with it.
   */
  async function switchBotForLifecycle(id: string, token: number): Promise<boolean> {
    const previous = settings.activeBotId
    if (previous) snapshots.set(previous, captureSnapshot())
    stopLifecycle()
    settings.setActiveBot(id)
    rebuildClient()
    const snapshot = snapshots.get(id)
    if (snapshot) {
      restoreSnapshot(snapshot)
      snapshotStale.value = true
      // Paint from the snapshot, then let the real figures land on top.
      const connected = await connectForLifecycle(token)
      return isCurrentLifecycle(token) && connected
    }
    resetData()
    const connected = await connectForLifecycle(token)
    return isCurrentLifecycle(token) && connected
  }

  async function switchBot(id: string): Promise<boolean> {
    if (id === settings.activeBotId) return true
    // A write in flight belongs to the bot you are looking at; never leave it behind.
    if (actionPending.value !== null) return false
    const token = ++lifecycleToken
    return switchBotForLifecycle(id, token)
  }

  /** Removes a bot without leaving the active connection outside the switch lifecycle. */
  async function removeBot(id: string): Promise<boolean> {
    if (id !== settings.activeBotId) {
      settings.removeBot(id)
      snapshots.delete(id)
      return true
    }
    if (actionPending.value !== null) return false

    const next = settings.bots.find((entry) => entry.id !== id)
    if (!next) {
      ++lifecycleToken
      stopLifecycle()
      settings.removeBot(id)
      snapshots.delete(id)
      resetData()
      return true
    }

    const token = ++lifecycleToken
    const switched = await switchBotForLifecycle(next.id, token)
    if (!switched) {
      // A newer switch, removal or reconnect owns the dashboard now. Do not undo it.
      if (!isCurrentLifecycle(token)) return false
      await switchBotForLifecycle(id, token)
      return false
    }
    if (!isCurrentLifecycle(token)) return false
    settings.removeBot(id)
    snapshots.delete(id)
    return true
  }

  // --- connection lifecycle ------------------------------------------------

  async function connectForLifecycle(token: number): Promise<boolean> {
    if (!isCurrentLifecycle(token)) return false
    if (!settings.baseUrl || !settings.username || !settings.password) {
      connection.value = 'idle'
      errorKey.value = { key: 'errors.config' }
      return false
    }
    const epoch = botEpoch
    stopped = false
    connection.value = 'connecting'
    errorKey.value = null
    rebuildClient()
    try {
      const api = ensureClient()
      const started = performance.now()
      await api.ping()
      if (!isCurrentLifecycle(token) || epoch !== botEpoch) return false
      const config = await api.showConfig()
      if (!isCurrentLifecycle(token) || epoch !== botEpoch) return false
      latencyMs.value = Math.round(performance.now() - started)
      showConfig.value = config
      settings.persistBots()
      connection.value = 'online'
      errorKey.value = null
      // Real data is on its way in; anything shown before it is no longer a stale copy.
      snapshotStale.value = false
      await refreshAll()
      if (!isCurrentLifecycle(token) || epoch !== botEpoch) return false
      startPolling()
      if (settings.websocket) retryStream()
      return true
    } catch (error) {
      if (!isCurrentLifecycle(token) || epoch !== botEpoch) return false
      recordError(error)
      connection.value =
        error instanceof ApiError && error.kind === 'auth' ? 'unauthorized' : 'unreachable'
      return false
    }
  }

  async function connect(): Promise<boolean> {
    const token = ++lifecycleToken
    stopLifecycle()
    return connectForLifecycle(token)
  }

  function applyConfigMetadata(config: ShowConfigResponse) {
    const botName = typeof config.bot_name === 'string' ? config.bot_name : ''
    if (botName) document.title = `FT Dash · ${botName}`
  }

  async function autoConnect() {
    if (!settings.hasCredentials) return
    await connect()
  }

  function stopLifecycle() {
    stopped = true
    botEpoch += 1
    stopPolling()
    refreshInFlight = null
    refreshing.value = false
    tick = 0
    heartbeatAlerted = false
    lastBackgroundCheck = 0
    disconnectStream()
  }

  function cleanup() {
    lifecycleToken += 1
    stopLifecycle()
  }

  // --- websocket -----------------------------------------------------------

  /** Resolves the token the socket needs: an operator ws_token, or a fresh JWT. */
  async function resolveStreamAuth(api: FreqtradeApi, isCurrent: () => boolean) {
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
        if (isCurrent()) {
          events.push({
            type: 'stream.auth',
            subject: jwtFailure,
            detail: '',
            severity: 'warn',
          })
        }
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

  function isCurrentStreamAttempt(epoch: number, attempt: number, api: FreqtradeApi): boolean {
    return !stopped && epoch === botEpoch && streamAttempt === attempt && client.value === api
  }

  async function connectStream() {
    const epoch = botEpoch
    const attempt = ++streamAttempt
    const api = client.value
    if (!api || !settings.websocket) {
      streamAuthMode.value = 'off'
      streamReasonKey.value = null
      events.setStatus('off')
      return
    }
    events.setStatus('connecting')
    try {
      const plan = await resolveStreamAuth(api, () => isCurrentStreamAttempt(epoch, attempt, api))
      if (!isCurrentStreamAttempt(epoch, attempt, api)) return
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
      openSocket(websocketUrl(api.baseUrl, plan.token), epoch, attempt)
    } catch (error) {
      if (!isCurrentStreamAttempt(epoch, attempt, api)) return
      events.setStatus('error', error instanceof ApiError ? error.kind : 'login-failed')
      streamReasonKey.value = 'errors.wsAuthUnavailable'
      scheduleReconnect()
    }
  }

  /** Wires one socket: subscribe on open, classify the close, surface errors. */
  function openSocket(url: string, epoch: number, attempt: number) {
    if (ws) {
      const previous = ws
      ws = null
      previous.close()
    }
    const socket = new WebSocket(url)
    ws = socket
    socket.addEventListener('open', () => onSocketOpen(socket, epoch, attempt))
    socket.addEventListener('message', (event) =>
      handleStreamMessage(socket, epoch, attempt, event.data),
    )
    socket.addEventListener('close', () => onSocketClose(socket, epoch, attempt))
    socket.addEventListener('error', () => {
      if (isCurrentSocket(socket, epoch, attempt)) events.setStatus('error', 'socket-error')
    })
  }

  function isCurrentSocket(socket: WebSocket, epoch: number, attempt: number): boolean {
    return !stopped && epoch === botEpoch && streamAttempt === attempt && ws === socket
  }

  function onSocketOpen(socket: WebSocket, epoch: number, attempt: number) {
    if (!isCurrentSocket(socket, epoch, attempt)) {
      socket.close()
      return
    }
    wsRetry = 0
    streamFailures = 0
    streamOpened = true
    streamPreferToken = false
    streamReasonKey.value = null
    events.setStatus('open')
    socket.send(JSON.stringify({ type: 'subscribe', data: [...STREAM_TOPICS] }))
  }

  /**
   * A socket that closed before it ever opened may simply want the bot's ws_token rather
   * than the JWT we fetched. Returns true when that switch was made and a retry is due.
   */
  function fallBackToWsToken() {
    if (settings.streamAuth !== 'auto' || streamPreferToken) return false
    if (!settings.wsToken.trim() || streamAuthMode.value !== 'jwt') return false
    streamPreferToken = true
    events.push({ type: 'stream.auth', subject: 'fallback', detail: '', severity: 'warn' })
    return true
  }

  function onSocketClose(socket: WebSocket, epoch: number, attempt: number) {
    if (!isCurrentSocket(socket, epoch, attempt)) return
    ws = null
    events.setStatus('closed')
    if (!streamOpened) {
      if (fallBackToWsToken()) {
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
  }

  function handleStreamMessage(socket: WebSocket, epoch: number, attempt: number, raw: unknown) {
    if (!isCurrentSocket(socket, epoch, attempt)) return
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
    if (message.type === 'shutdown') {
      notify(i18n.global.t('notify.stoppedTitle'), i18n.global.t('notify.stoppedBody'), 'shutdown')
      return
    }
    const interesting = ['entry_fill', 'exit_fill', 'warning', 'exception', 'protection_trigger']
    if (!interesting.includes(message.type)) return
    const data = (message.data ?? {}) as Record<string, unknown>
    const pair = typeof data.pair === 'string' ? data.pair : ''
    const ratio = typeof data.profit_ratio === 'number' ? data.profit_ratio * 100 : null
    const body = [pair, ratio === null ? '' : `${ratio.toFixed(2)}%`].filter(Boolean).join(' · ')
    notify(`FT Dash · ${message.type}`, body, message.type)
  }

  function scheduleReconnect() {
    if (stopped || !settings.websocket || streamBlocked.value) return
    if (connection.value !== 'online') return
    if (wsTimer !== null) window.clearTimeout(wsTimer)
    wsRetry += 1
    const delay = nextRetryDelay(wsRetry)
    const epoch = botEpoch
    wsTimer = window.setTimeout(() => {
      if (epoch !== botEpoch || stopped) return
      void connectStream()
    }, delay)
  }

  /** Manual recovery after a blocked handshake (Settings → live stream). */
  function retryStream() {
    disconnectStream()
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
    streamAttempt += 1
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
    const epoch = botEpoch
    const api = ensureClient()
    /*
     * The signal columns ride along when the strategy has them, which is what lets the chart
     * mark its entries and exits. A strategy that does not expose them makes Freqtrade refuse
     * the whole request, so a refused one is asked again without: the marks are all that is
     * lost, and the candles stay.
     */
    const withSignals = await track(() =>
      api.pairCandles(pair, timeframe, limit, [...CANDLE_COLUMNS, ...SIGNAL_COLUMNS]),
    )
    if (epoch !== botEpoch) return null
    const result =
      withSignals ?? (await track(() => api.pairCandles(pair, timeframe, limit, CANDLE_COLUMNS)))
    if (epoch !== botEpoch) return null
    if (result) candleCache.value = { ...candleCache.value, [key]: result }
    // Keep the cache bounded — browsing many pairs must not grow memory forever.
    const keys = Object.keys(candleCache.value)
    if (keys.length > 8) {
      candleCache.value = Object.fromEntries(
        keys.slice(-8).map((entry) => [entry, candleCache.value[entry]]),
      )
    }
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
    closedByRecency,
    tradesByPair,
    writesAllowed,
    activeBotName,
    labelWithBot,
    // lifecycle
    connect,
    autoConnect,
    switchBot,
    removeBot,
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
    addLock: (payload: LockPayload[]) =>
      runAction('lockAdd', () => ensureClient().addLocks(payload)),
  }
})

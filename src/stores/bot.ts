import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { ApiError, FreqtradeApiClient, websocketUrl, type Credentials } from '@/data/freqtrade'
import {
  BotSessionController,
  HEARTBEAT_STALE_MS,
  POLL_INTERVAL_SECONDS,
  type BotSessionSnapshot,
  type ConnectionState,
  type ErrorDescription,
} from '@/data/freqtrade/session'
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
import type { DeleteLockPayload, PairCandlesResponse, WsMessage } from '@/lib/types'
import { useEventsStore } from './events'
import { useSettingsStore } from './settings'
import { i18n } from '@/i18n'

export type { ConnectionState }
export { HEARTBEAT_STALE_MS }

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

  const session = shallowRef<BotSessionController | null>(null)
  const client = shallowRef<FreqtradeApiClient | null>(null)
  const connection = computed<ConnectionState>(() => session.value?.state.connection ?? 'idle')
  const errorKey = computed<ErrorDescription | null>(() => session.value?.state.errorKey ?? null)
  const latencyMs = computed<number | null>({
    get: () => session.value?.state.latencyMs ?? null,
    set: (value) => {
      if (session.value) session.value.state.latencyMs = value
    },
  })
  const lastFetchAt = computed<number | null>({
    get: () => session.value?.state.lastFetchAt ?? null,
    set: (value) => {
      if (session.value) session.value.state.lastFetchAt = value
    },
  })
  const refreshing = computed(() => session.value?.state.refreshing ?? false)
  const actionPending = computed(() => session.value?.state.actionPending ?? null)
  const actionError = computed(() => session.value?.state.actionError ?? null)
  const snapshotStale = computed(() => session.value?.state.snapshotStale ?? false)
  const compatibility = computed(() => session.value?.state.compatibility ?? null)

  const showConfig = computed(() => session.value?.state.data.showConfig ?? null)
  const health = computed(() => session.value?.state.data.health ?? null)
  const sysinfo = computed(() => session.value?.state.data.sysinfo ?? null)
  const balance = computed(() => session.value?.state.data.balance ?? null)
  const profit = computed(() => session.value?.state.data.profit ?? null)
  const profitAll = computed(() => session.value?.state.data.profitAll ?? null)
  const openTrades = computed(() => session.value?.state.data.openTrades ?? [])
  const count = computed(() => session.value?.state.data.count ?? null)
  const trades = computed(() => session.value?.state.data.trades ?? [])
  const tradeStats = computed(() => session.value?.state.data.tradeStats ?? null)
  const performanceStats = computed(() => session.value?.state.data.performance ?? [])
  const daily = computed(() => session.value?.state.data.daily ?? null)
  const weekly = computed(() => session.value?.state.data.weekly ?? null)
  const monthly = computed(() => session.value?.state.data.monthly ?? null)
  const whitelist = computed(() => session.value?.state.data.whitelist ?? null)
  const blacklist = computed(() => session.value?.state.data.blacklist ?? null)
  const locks = computed(() => session.value?.state.data.locks ?? null)
  const logs = computed(() => session.value?.state.data.logs ?? null)
  const candleCache = computed(() => session.value?.state.data.candleCache ?? {})

  let lifecycleToken = 0
  let stopped = false
  let ws: WebSocket | null = null
  let wsRetry = 0
  let wsTimer: number | null = null
  let streamFailures = 0
  let streamOpened = false
  let streamAttempt = 0
  let streamPreferToken = false

  const streamAuthMode = ref<StreamAuthMode>('off')
  const streamReasonKey = ref<string | null>(null)
  const streamBlocked = ref(false)

  const snapshots = new Map<string, BotSessionSnapshot>()

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
    const timestamp = health.value?.last_process_ts ?? health.value?.last_process ?? null
    const parsed = parseTimestamp(timestamp)
    return parsed === null ? null : Date.now() - parsed
  })
  const closedTrades = computed(() => trades.value.filter((trade) => !trade.is_open))
  const closedByRecency = computed(() =>
    [...closedTrades.value].sort((a, b) => (b.close_timestamp ?? 0) - (a.close_timestamp ?? 0)),
  )
  const tradesByPair = computed(() => {
    const map = new Map<string, typeof trades.value>()
    for (const trade of trades.value) {
      const list = map.get(trade.pair) ?? []
      list.push(trade)
      map.set(trade.pair, list)
    }
    return map
  })
  const activeBotName = computed(() => settings.activeBotName)
  const writesAllowed = computed(
    () =>
      settings.writesEnabled &&
      !snapshotStale.value &&
      session.value?.state.coreReady === true &&
      session.value?.state.tradesReady === true &&
      actionPending.value === null,
  )

  function notify(title: string, body: string, tag?: string) {
    if (!settings.notifications) return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    try {
      new Notification(title, { body, tag })
    } catch {
      // Notification permissions and platform bridges can fail independently of the bot.
    }
  }

  function createSession(
    botId = settings.activeBotId,
    credentials = currentCredentials(),
  ): BotSessionController {
    return new BotSessionController({
      botId,
      credentials,
      backgroundCheckEnabled: () => settings.notifications,
      onHeartbeatAlert: (ageMs) =>
        notify(
          i18n.global.t('notify.heartbeatTitle'),
          i18n.global.t('notify.heartbeatBody', { age: formatShortDuration(ageMs) }),
        ),
    })
  }

  function currentCredentials(): Credentials {
    return {
      baseUrl: settings.baseUrl,
      username: settings.username,
      password: settings.password,
    }
  }

  function ensureSession(): BotSessionController {
    if (!session.value) session.value = createSession()
    return session.value
  }

  function ensureClient(): FreqtradeApiClient {
    const value = ensureSession().ensureClient()
    client.value = value
    return value
  }

  function rebuildClient() {
    const current = ensureSession()
    current.updateCredentials(currentCredentials())
    client.value = null
  }

  function applyConfigMetadata() {
    const botName = showConfig.value?.bot_name
    if (typeof botName === 'string' && botName) document.title = `FT Dash · ${botName}`
  }

  function formatShortDuration(ms: number): string {
    const minutes = Math.floor(ms / 60_000)
    const seconds = Math.round((ms % 60_000) / 1000)
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
  }

  // --- data loading --------------------------------------------------------

  function refreshAll() {
    return ensureSession().refreshAll()
  }

  function refreshCore() {
    return ensureSession().refreshCore()
  }

  function refreshTrades() {
    return ensureSession().refreshTrades()
  }

  function refreshAnalytics() {
    return ensureSession().refreshAnalytics()
  }

  function refreshMarket() {
    return ensureSession().refreshMarket()
  }

  function refreshSystem() {
    return ensureSession()
      .refreshSystem()
      .then((result) => {
        applyConfigMetadata()
        return result
      })
  }

  function resetData() {
    ensureSession().resetData()
  }

  function startPolling() {
    ensureSession().startPolling()
  }

  function stopPolling() {
    session.value?.stopPolling()
  }

  // --- connection lifecycle ------------------------------------------------

  function isCurrentLifecycle(token: number): boolean {
    return token === lifecycleToken
  }

  async function connectForLifecycle(token: number): Promise<boolean> {
    if (!isCurrentLifecycle(token)) return false
    if (!settings.baseUrl || !settings.username || !settings.password) {
      return false
    }
    stopped = false
    const current = ensureSession()
    const ok = await current.connect()
    if (!isCurrentLifecycle(token) || current !== session.value) return false
    client.value = current.currentClient
    if (!ok) {
      /*
       * The API answered and only the bot was not ready — a restarting trader answers 5xx.
       * Polling from here is what lets the page heal on its own; a rejected password would
       * only hammer the API, so that case stays a manual retry.
       */
      if (current.state.data.showConfig && current.state.connection === 'unreachable') {
        startPolling()
      }
      return false
    }
    events.beginScope({ botId: current.state.botId, epoch: current.currentEpoch })
    settings.persistBots()
    applyConfigMetadata()
    startPolling()
    if (settings.websocket) retryStream()
    return true
  }

  function stopLifecycle() {
    stopped = true
    stopPolling()
    disconnectStream()
    session.value?.stop()
    client.value = null
    events.endScope()
  }

  async function connect(): Promise<boolean> {
    const token = ++lifecycleToken
    stopLifecycle()
    const current = ensureSession()
    if (current.state.botId !== settings.activeBotId) {
      current.setBot(settings.activeBotId, currentCredentials())
    } else {
      current.updateCredentials(currentCredentials())
    }
    return connectForLifecycle(token)
  }

  async function switchBotForLifecycle(id: string, token: number): Promise<boolean> {
    const previous = settings.activeBotId
    if (previous) snapshots.set(previous, ensureSession().captureSnapshot())
    stopLifecycle()
    settings.setActiveBot(id)
    const current = ensureSession()
    current.setBot(id, currentCredentials(), snapshots.get(id))
    client.value = null
    return connectForLifecycle(token)
  }

  async function switchBot(id: string): Promise<boolean> {
    if (id === settings.activeBotId) return true
    if (actionPending.value !== null) return false
    const token = ++lifecycleToken
    return switchBotForLifecycle(id, token)
  }

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
      if (!isCurrentLifecycle(token)) return false
      await switchBotForLifecycle(id, token)
      return false
    }
    if (!isCurrentLifecycle(token)) return false
    settings.removeBot(id)
    snapshots.delete(id)
    return true
  }

  function autoConnect() {
    if (!settings.hasCredentials) return Promise.resolve(false)
    return connect()
  }

  function cleanup() {
    lifecycleToken += 1
    stopLifecycle()
    session.value?.cleanup()
    session.value = null
    snapshots.clear()
  }

  // --- websocket -----------------------------------------------------------

  async function resolveStreamAuth(api: FreqtradeApiClient, isCurrent: () => boolean) {
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
          events.push({ type: 'stream.auth', subject: jwtFailure, detail: '', severity: 'warn' })
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

  function currentEpoch(): number {
    return session.value?.currentEpoch ?? 0
  }

  function isCurrentStreamAttempt(
    epoch: number,
    attempt: number,
    api: FreqtradeApiClient,
  ): boolean {
    return !stopped && epoch === currentEpoch() && streamAttempt === attempt && client.value === api
  }

  async function connectStream() {
    const epoch = currentEpoch()
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
    return !stopped && epoch === currentEpoch() && streamAttempt === attempt && ws === socket
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
    if (!isCurrentSocket(socket, epoch, attempt) || typeof raw !== 'string') return
    let parsed: WsMessage
    try {
      parsed = JSON.parse(raw) as WsMessage
    } catch {
      return
    }
    const currentSession = session.value
    if (!currentSession) return
    events.ingest(parsed, { botId: currentSession.state.botId, epoch })
    maybeNotify(parsed)
    if (
      ['entry_fill', 'exit_fill', 'entry_cancel', 'exit_cancel', 'protection_trigger'].includes(
        parsed.type,
      )
    ) {
      void refreshCore()
    }
    if (parsed.type === 'shutdown' || parsed.type === 'startup') void refreshSystem()
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
    const epoch = currentEpoch()
    wsTimer = window.setTimeout(() => {
      if (epoch !== currentEpoch() || stopped) return
      void connectStream()
    }, delay)
  }

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

  watch([() => settings.streamAuth, () => settings.wsToken], () => {
    if (!settings.websocket) return
    retryStream()
  })

  // --- write actions -------------------------------------------------------

  function runAction<T>(name: string, task: (client: FreqtradeApiClient) => Promise<T>) {
    return ensureSession()
      .runAction(name, task)
      .then((result) => {
        if (result !== null)
          events.push({ type: 'action', subject: name, detail: '', severity: 'info' })
        return result
      })
  }

  function fetchCandles(
    pair: string,
    timeframe: string,
    limit = 180,
  ): Promise<PairCandlesResponse | null> {
    return ensureSession().fetchCandles(pair, timeframe, limit, [
      ...CANDLE_COLUMNS,
      ...SIGNAL_COLUMNS,
    ])
  }

  return {
    // state
    connection,
    errorKey,
    latencyMs,
    lastFetchAt,
    refreshing,
    actionPending,
    actionError,
    compatibility,
    showConfig,
    health,
    sysinfo,
    balance,
    profit,
    profitAll,
    openTrades,
    count,
    trades,
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
    snapshotStale,
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
    labelWithBot: (label: string) =>
      activeBotName.value ? `${label} · ${activeBotName.value}` : label,
    // lifecycle
    connect,
    autoConnect,
    switchBot,
    removeBot,
    refreshAll,
    refreshCore,
    refreshTrades,
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
    hasClient: computed(() => client.value !== null),
    forceExit: (tradeid: number | string, ordertype: 'market' | 'limit' = 'market') =>
      runAction('forceExit', (api) => api.forceExit({ tradeid, ordertype })),
    start: () => runAction('start', (api) => api.start()),
    stop: () => runAction('stop', (api) => api.stop()),
    pauseEntries: () => runAction('pause', (api) => api.pause()),
    reloadConfig: () => runAction('reloadConfig', (api) => api.reloadConfig()),
    addBlacklist: (pairs: string[]) => runAction('blacklistAdd', (api) => api.addBlacklist(pairs)),
    deleteBlacklist: (pairs: string[]) =>
      runAction('blacklistDelete', (api) => api.deleteBlacklist(pairs)),
    deleteLock: (payload: DeleteLockPayload) =>
      runAction('lockDelete', (api) => api.deleteLock(payload)),
  }
})

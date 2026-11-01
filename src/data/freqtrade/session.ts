import { reactive } from 'vue'
import { describeError, FreqtradeApiClient, type Credentials, type RequestOptions } from './index'
import type {
  BalanceResponse,
  BlacklistResponse,
  DailyResponse,
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
  TradesResponse,
  WhitelistResponse,
} from '@/lib/types'
import { parseTimestamp } from '@/lib/format'

export type ConnectionState = 'idle' | 'connecting' | 'online' | 'unauthorized' | 'unreachable'

export const HEARTBEAT_STALE_MS = 30_000
export const POLL_INTERVAL_SECONDS = 1
const TRADES_PAGE_SIZE = 300

export type ResourceName =
  'core' | 'trades' | 'analytics' | 'market' | 'system' | 'health' | 'candles'

export type ErrorDescription = ReturnType<typeof describeError>

export interface SessionData {
  showConfig: ShowConfigResponse | null
  health: HealthResponse | null
  sysinfo: SysInfoResponse | null
  balance: BalanceResponse | null
  profit: ProfitSummary | null
  profitAll: ProfitAllResponse | null
  openTrades: Trade[]
  count: StatusCountResponse | null
  trades: Trade[]
  tradeStats: TradeStats | null
  performance: PerformanceEntry[]
  daily: DailyResponse | null
  weekly: DailyResponse | null
  monthly: DailyResponse | null
  whitelist: WhitelistResponse | null
  blacklist: BlacklistResponse | null
  locks: LocksResponse | null
  logs: LogsResponse | null
  candleCache: Record<string, PairCandlesResponse>
}

export interface BotSessionState {
  botId: string
  epoch: number
  connection: ConnectionState
  snapshotStale: boolean
  coreReady: boolean
  tradesReady: boolean
  refreshing: boolean
  errorKey: ErrorDescription | null
  resourceErrors: Record<ResourceName, ErrorDescription | null>
  actionPending: string | null
  latencyMs: number | null
  lastFetchAt: number | null
  data: SessionData
}

export interface RefreshSummary {
  epoch: number
  ok: boolean
  stale: boolean
  succeeded: ResourceName[]
  failed: ResourceName[]
}

export interface BotSessionSnapshot {
  data: SessionData
  latencyMs: number | null
  lastFetchAt: number | null
}

export interface BotSessionOptions {
  botId: string
  credentials: Credentials
  clientFactory?: (credentials: Credentials) => FreqtradeApiClient
  snapshot?: BotSessionSnapshot
  backgroundCheckEnabled?: () => boolean
  onHeartbeatAlert?: (ageMs: number) => void
}

interface RequestRun {
  botId: string
  client: FreqtradeApiClient
  epoch: number
  key: string
  generation: number
  controller: AbortController
}

interface CallResult<T> {
  ok: boolean
  stale: boolean
  value?: T
  error?: ErrorDescription
}

interface GroupResult {
  generation: number
  results: CallResult<unknown>[]
}

const EMPTY_DATA: SessionData = {
  showConfig: null,
  health: null,
  sysinfo: null,
  balance: null,
  profit: null,
  profitAll: null,
  openTrades: [],
  count: null,
  trades: [],
  tradeStats: null,
  performance: [],
  daily: null,
  weekly: null,
  monthly: null,
  whitelist: null,
  blacklist: null,
  locks: null,
  logs: null,
  candleCache: {},
}

const RESOURCE_NAMES: ResourceName[] = [
  'core',
  'trades',
  'analytics',
  'market',
  'system',
  'health',
  'candles',
]

function emptyResourceErrors(): Record<ResourceName, ErrorDescription | null> {
  return Object.fromEntries(RESOURCE_NAMES.map((resource) => [resource, null])) as Record<
    ResourceName,
    ErrorDescription | null
  >
}

function createData(): SessionData {
  return {
    ...EMPTY_DATA,
    openTrades: [],
    trades: [],
    performance: [],
    candleCache: {},
  }
}

function createState(botId: string, epoch: number): BotSessionState {
  return {
    botId,
    epoch,
    connection: 'idle',
    snapshotStale: false,
    coreReady: false,
    tradesReady: false,
    refreshing: false,
    errorKey: null,
    resourceErrors: emptyResourceErrors(),
    actionPending: null,
    latencyMs: null,
    lastFetchAt: null,
    data: createData(),
  }
}

function cloneData(data: SessionData): SessionData {
  return {
    ...data,
    openTrades: [...data.openTrades],
    trades: [...data.trades],
    performance: [...data.performance],
    candleCache: { ...data.candleCache },
  }
}

function summary(
  epoch: number,
  results: Partial<Record<ResourceName, CallResult<unknown>>>,
  stale: boolean,
): RefreshSummary {
  const succeeded = RESOURCE_NAMES.filter((resource) => results[resource]?.ok)
  const failed = RESOURCE_NAMES.filter((resource) => results[resource] && !results[resource]?.ok)
  return { epoch, ok: !stale && failed.length === 0, stale, succeeded, failed }
}

function canDropSignalColumns(error: ErrorDescription | undefined, columns?: string[]): boolean {
  if (error?.key !== 'errors.http' || !columns?.some((column) => /^(enter|exit)_/.test(column))) {
    return false
  }
  const status = Number(error.params?.status)
  const detail = String(error.params?.detail ?? '')
  return (status === 400 || status === 422) && /(column|signal|enter_|exit_)/i.test(detail)
}

function isTransportFailure(error: ErrorDescription | null | undefined): error is ErrorDescription {
  const status = Number(error?.params?.status)
  return (
    error?.key === 'errors.auth' ||
    error?.key === 'errors.cors' ||
    error?.key === 'errors.offline' ||
    error?.key === 'errors.timeout' ||
    (error?.key === 'errors.http' && status >= 500)
  )
}

function preferredTransportError(errors: (ErrorDescription | null | undefined)[]) {
  const failures = errors.filter(isTransportFailure)
  return failures.find((error) => error.key === 'errors.auth') ?? failures[0]
}

/**
 * Owns one bot's REST lifecycle. It never commits a response unless both the session epoch and
 * the individual request generation still match, so a slow old request can finish naturally
 * without painting the selected bot or clearing its newer error/loading state.
 */
export class BotSessionController {
  readonly state: BotSessionState

  private credentials: Credentials
  private readonly clientFactory: (credentials: Credentials) => FreqtradeApiClient
  private client: FreqtradeApiClient | null = null
  private readonly generations = new Map<string, number>()
  private readonly groupGenerations = new Map<ResourceName, number>()
  private readonly requests = new Map<string, RequestRun>()
  private readonly groupRuns = new Map<
    ResourceName,
    {
      epoch: number
      client: FreqtradeApiClient
      promise: Promise<GroupResult>
    }
  >()
  private activeRefreshToken: number | null = null
  private nextRefreshToken = 0
  private nextActionToken = 0
  private actionLock: { token: number } | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private readonly pollInFlight = new Map<ResourceName, object>()
  private pollTickCount = 0
  private lastBackgroundCheck = 0
  private heartbeatAlerted = false
  private readonly backgroundCheckEnabled: () => boolean
  private readonly onHeartbeatAlert?: (ageMs: number) => void

  constructor(options: BotSessionOptions) {
    this.credentials = { ...options.credentials }
    this.clientFactory =
      options.clientFactory ?? ((credentials) => new FreqtradeApiClient(credentials))
    this.backgroundCheckEnabled = options.backgroundCheckEnabled ?? (() => false)
    this.onHeartbeatAlert = options.onHeartbeatAlert
    this.state = reactive(createState(options.botId, 0)) as BotSessionState
    if (options.snapshot) {
      this.restoreSnapshot(options.snapshot)
      this.state.snapshotStale = true
    }
  }

  get currentClient(): FreqtradeApiClient | null {
    return this.client
  }

  get isActionPending(): boolean {
    return this.actionLock !== null
  }

  get currentEpoch(): number {
    return this.state.epoch
  }

  ensureClient(): FreqtradeApiClient {
    if (!this.client) this.client = this.clientFactory(this.credentials)
    return this.client
  }

  updateCredentials(credentials: Credentials): void {
    this.credentials = { ...credentials }
    this.client = null
  }

  captureSnapshot(): BotSessionSnapshot {
    return {
      data: cloneData(this.state.data),
      latencyMs: this.state.latencyMs,
      lastFetchAt: this.state.lastFetchAt,
    }
  }

  restoreSnapshot(snapshot: BotSessionSnapshot): void {
    this.state.data = cloneData(snapshot.data)
    this.state.latencyMs = snapshot.latencyMs
    this.state.lastFetchAt = snapshot.lastFetchAt
    this.state.snapshotStale = true
    this.state.coreReady = false
    this.state.tradesReady = false
  }

  setSnapshotStale(stale: boolean): void {
    this.state.snapshotStale = stale
    if (stale) {
      this.state.coreReady = false
      this.state.tradesReady = false
    }
  }

  /** Changes the data source without starting a network request. */
  setBot(botId: string, credentials: Credentials, snapshot?: BotSessionSnapshot): void {
    this.stop()
    this.state.epoch += 1
    this.state.botId = botId
    this.credentials = { ...credentials }
    this.client = null
    this.clearStateData()
    if (snapshot) this.restoreSnapshot(snapshot)
  }

  async switchBot(
    botId: string,
    credentials: Credentials,
    snapshot?: BotSessionSnapshot,
  ): Promise<boolean> {
    this.setBot(botId, credentials, snapshot)
    return this.connect()
  }

  private clearStateData(): void {
    this.state.connection = 'idle'
    this.state.snapshotStale = false
    this.state.coreReady = false
    this.state.tradesReady = false
    this.state.refreshing = false
    this.state.errorKey = null
    this.state.resourceErrors = emptyResourceErrors()
    this.state.latencyMs = null
    this.state.lastFetchAt = null
    this.state.data = createData()
  }

  resetData(): void {
    this.stop()
    this.clearStateData()
  }

  rebuildClient(): void {
    this.client = null
  }

  private isCurrent(run: RequestRun): boolean {
    return (
      run.epoch === this.state.epoch &&
      run.botId === this.state.botId &&
      run.client === this.client &&
      this.generations.get(run.key) === run.generation
    )
  }

  private beginRequest(key: string): RequestRun {
    const client = this.ensureClient()
    const generation = (this.generations.get(key) ?? 0) + 1
    this.generations.set(key, generation)
    const previous = this.requests.get(key)
    previous?.controller.abort()
    const run: RequestRun = {
      botId: this.state.botId,
      client,
      epoch: this.state.epoch,
      key,
      generation,
      controller: new AbortController(),
    }
    this.requests.set(key, run)
    return run
  }

  private beginGroup(resource: ResourceName): number {
    const generation = (this.groupGenerations.get(resource) ?? 0) + 1
    this.groupGenerations.set(resource, generation)
    return generation
  }

  private isCurrentGroup(resource: ResourceName, generation: number, epoch: number): boolean {
    return epoch === this.state.epoch && this.groupGenerations.get(resource) === generation
  }

  private async call<T>(
    key: string,
    task: (client: FreqtradeApiClient, options: RequestOptions) => Promise<T>,
  ): Promise<CallResult<T>> {
    const run = this.beginRequest(key)
    try {
      const value = await task(run.client, { signal: run.controller.signal })
      if (!this.isCurrent(run)) return { ok: false, stale: true }
      return { ok: true, stale: false, value }
    } catch (error) {
      if (!this.isCurrent(run)) return { ok: false, stale: true }
      return { ok: false, stale: false, error: describeError(error) }
    } finally {
      if (this.requests.get(key) === run) this.requests.delete(key)
    }
  }

  private setGroupResult(
    resource: ResourceName,
    results: CallResult<unknown>[],
    epoch: number,
  ): void {
    if (epoch !== this.state.epoch) return
    const failures = results.filter((result) => !result.ok && !result.stale)
    const failed = failures.find((result) => result.error?.key === 'errors.auth') ?? failures[0]
    this.state.resourceErrors[resource] = failed?.error ?? null
    if (!failed) this.state.lastFetchAt = Date.now()
  }

  private updateConnectionFromResults(results: CallResult<unknown>[], epoch: number): void {
    if (epoch !== this.state.epoch) return
    const failure = preferredTransportError([
      ...results.filter((result) => !result.ok && !result.stale).map((result) => result.error),
      this.state.resourceErrors.core,
      ...Object.values(this.state.resourceErrors).filter((error) => error?.key === 'errors.auth'),
    ])
    if (failure) {
      const key = failure.key
      this.state.errorKey = failure
      this.state.connection = key === 'errors.auth' ? 'unauthorized' : 'unreachable'
      /*
       * 401 is not a transient: the credentials are wrong, or the proxy in front of the API
       * refuses this origin. Retrying would be six more rejections a second in the bot's log
       * and would never fix itself — so polling stops and the app goes back to the sign-in
       * form, which is the only place that can fix it. A reachable-but-broken bot (5xx,
       * network) keeps polling, because that does heal.
       */
      if (key === 'errors.auth') this.stopPolling()
      return
    }
    if (results.some((result) => !result.ok && !result.stale)) return
    this.state.errorKey = null
    if (this.state.connection === 'unreachable' || this.state.connection === 'unauthorized') {
      this.state.connection = 'online'
    }
  }

  private async runGroup(
    resource: ResourceName,
    epoch: number,
    calls: Array<
      [
        key: string,
        task: (client: FreqtradeApiClient, options: RequestOptions) => Promise<unknown>,
        apply: (value: unknown) => void,
      ]
    >,
  ): Promise<GroupResult> {
    const client = this.ensureClient()
    const pending = this.groupRuns.get(resource)
    if (pending?.epoch === epoch && pending.client === client) return pending.promise
    const generation = this.beginGroup(resource)
    const promise = Promise.all(
      calls.map(async ([key, task, apply]) => {
        const result = await this.call(key, task)
        if (!result.stale && this.isCurrentGroup(resource, generation, epoch)) {
          if (result.ok) apply(result.value)
          else if (result.error?.key === 'errors.auth') {
            this.state.resourceErrors[resource] = result.error
            this.updateConnectionFromResults([result], epoch)
          }
        }
        return result
      }),
    ).then((results) => {
      if (this.isCurrentGroup(resource, generation, epoch))
        this.setGroupResult(resource, results, epoch)
      return { generation, results }
    })
    const run = { epoch, client, promise }
    this.groupRuns.set(resource, run)
    try {
      return await promise
    } finally {
      if (this.groupRuns.get(resource) === run) this.groupRuns.delete(resource)
    }
  }

  async refreshCore(): Promise<RefreshSummary> {
    const epoch = this.state.epoch
    const started = performance.now()
    const group = await this.runGroup('core', epoch, [
      [
        'core.status',
        (client, options) => client.status(options),
        (value) => (this.state.data.openTrades = value as Trade[]),
      ],
      [
        'core.count',
        (client, options) => client.count(options),
        (value) => (this.state.data.count = value as StatusCountResponse),
      ],
      [
        'core.balance',
        (client, options) => client.balance(options),
        (value) => (this.state.data.balance = value as BalanceResponse),
      ],
      [
        'core.profit',
        (client, options) => client.profit(options),
        (value) => (this.state.data.profit = value as ProfitSummary),
      ],
    ])
    const { generation, results } = group
    const stale = !this.isCurrentGroup('core', generation, epoch)
    if (!stale) {
      this.updateConnectionFromResults(results, epoch)
      this.state.coreReady = results.every((result) => result.ok)
      if (this.state.coreReady && this.state.tradesReady) this.state.snapshotStale = false
      this.state.latencyMs = Math.round(performance.now() - started)
    }
    return {
      ...summary(epoch, { core: { ok: results.every((result) => result.ok), stale } }, stale),
      succeeded: results.every((result) => result.ok) ? ['core'] : [],
      failed: results.every((result) => result.ok) ? [] : ['core'],
    }
  }

  async refreshTrades(): Promise<RefreshSummary> {
    const epoch = this.state.epoch
    const group = await this.runGroup('trades', epoch, [
      [
        'trades.list',
        (client, options) => client.trades({ limit: TRADES_PAGE_SIZE }, options),
        (value) => (this.state.data.trades = (value as TradesResponse).trades),
      ],
    ])
    const { generation, results } = group
    const stale = !this.isCurrentGroup('trades', generation, epoch)
    if (!stale) {
      this.updateConnectionFromResults(results, epoch)
      this.state.tradesReady = results[0]?.ok === true
      if (this.state.coreReady && this.state.tradesReady) this.state.snapshotStale = false
    }
    return {
      ...summary(epoch, { trades: results[0] }, stale),
      succeeded: results[0]?.ok ? ['trades'] : [],
      failed: results[0]?.ok ? [] : ['trades'],
    }
  }

  async refreshAnalytics(): Promise<RefreshSummary> {
    const epoch = this.state.epoch
    const group = await this.runGroup('analytics', epoch, [
      [
        'analytics.stats',
        (client, options) => client.tradeStats(options),
        (value) => (this.state.data.tradeStats = value as TradeStats),
      ],
      [
        'analytics.performance',
        (client, options) => client.performance(options),
        (value) => (this.state.data.performance = value as PerformanceEntry[]),
      ],
      [
        'analytics.daily',
        (client, options) => client.daily(60, options),
        (value) => (this.state.data.daily = value as DailyResponse),
      ],
      [
        'analytics.weekly',
        (client, options) => client.weekly(52, options),
        (value) => (this.state.data.weekly = value as DailyResponse),
      ],
      [
        'analytics.monthly',
        (client, options) => client.monthly(24, options),
        (value) => (this.state.data.monthly = value as DailyResponse),
      ],
      [
        'analytics.profitAll',
        (client, options) => client.profitAll(options),
        (value) => (this.state.data.profitAll = value as ProfitAllResponse),
      ],
    ])
    const { generation, results } = group
    const stale = !this.isCurrentGroup('analytics', generation, epoch)
    return {
      ...summary(epoch, { analytics: { ok: results.every((result) => result.ok), stale } }, stale),
      succeeded: results.every((result) => result.ok) ? ['analytics'] : [],
      failed: results.every((result) => result.ok) ? [] : ['analytics'],
    }
  }

  async refreshMarket(): Promise<RefreshSummary> {
    const epoch = this.state.epoch
    const group = await this.runGroup('market', epoch, [
      [
        'market.whitelist',
        (client, options) => client.whitelist(options),
        (value) => (this.state.data.whitelist = value as WhitelistResponse),
      ],
      [
        'market.blacklist',
        (client, options) => client.blacklist(options),
        (value) => (this.state.data.blacklist = value as BlacklistResponse),
      ],
      [
        'market.locks',
        (client, options) => client.locks(options),
        (value) => (this.state.data.locks = value as LocksResponse),
      ],
    ])
    const { generation, results } = group
    const stale = !this.isCurrentGroup('market', generation, epoch)
    return {
      ...summary(epoch, { market: { ok: results.every((result) => result.ok), stale } }, stale),
      succeeded: results.every((result) => result.ok) ? ['market'] : [],
      failed: results.every((result) => result.ok) ? [] : ['market'],
    }
  }

  async refreshSystem(): Promise<RefreshSummary> {
    const epoch = this.state.epoch
    const group = await this.runGroup('system', epoch, [
      [
        'system.config',
        (client, options) => client.showConfig(options),
        (value) => (this.state.data.showConfig = value as ShowConfigResponse),
      ],
      [
        'system.sysinfo',
        (client, options) => client.sysinfo(options),
        (value) => (this.state.data.sysinfo = value as SysInfoResponse),
      ],
      [
        'system.logs',
        (client, options) => client.logs(150, options),
        (value) => (this.state.data.logs = value as LogsResponse),
      ],
    ])
    const { generation, results } = group
    const stale = !this.isCurrentGroup('system', generation, epoch)
    return {
      ...summary(epoch, { system: { ok: results.every((result) => result.ok), stale } }, stale),
      succeeded: results.every((result) => result.ok) ? ['system'] : [],
      failed: results.every((result) => result.ok) ? [] : ['system'],
    }
  }

  async refreshAll(): Promise<RefreshSummary> {
    const token = ++this.nextRefreshToken
    const epoch = this.state.epoch
    this.state.refreshing = true
    const required = Promise.all([this.refreshCore(), this.refreshTrades()])
    const finishRequired = () => {
      if (this.activeRefreshToken === token) {
        this.activeRefreshToken = null
        this.state.refreshing = false
      }
    }
    // Slow optional resources must not keep the refresh button or other groups locked.
    void required.then(finishRequired, finishRequired)
    const promise = (async (): Promise<RefreshSummary> => {
      const [[core, trades], analytics, market, system, health] = await Promise.all([
        required,
        this.refreshAnalytics(),
        this.refreshMarket(),
        this.refreshSystem(),
        this.refreshHealth(),
      ])
      if (epoch !== this.state.epoch) return summary(epoch, {}, true)
      return summary(
        epoch,
        Object.fromEntries(
          Object.entries({ core, trades, analytics, market, system, health }).map(
            ([name, result]) => [name, { ok: result.ok, stale: result.stale }],
          ),
        ),
        false,
      )
    })()
    this.activeRefreshToken = token
    try {
      return await promise
    } finally {
      finishRequired()
    }
  }

  private evaluateHeartbeat(): void {
    const timestamp = parseTimestamp(
      this.state.data.health?.last_process_ts ?? this.state.data.health?.last_process ?? null,
    )
    if (timestamp === null) return
    const age = Date.now() - timestamp
    if (age > HEARTBEAT_STALE_MS) {
      if (this.heartbeatAlerted) return
      this.heartbeatAlerted = true
      this.onHeartbeatAlert?.(age)
      return
    }
    this.heartbeatAlerted = false
  }

  private async pollResource(
    resource: ResourceName,
    refresh: () => Promise<unknown>,
  ): Promise<void> {
    if (this.pollInFlight.has(resource)) return
    const run = {}
    this.pollInFlight.set(resource, run)
    try {
      await refresh()
    } finally {
      if (this.pollInFlight.get(resource) === run) this.pollInFlight.delete(resource)
    }
  }

  private async pollTick(): Promise<void> {
    const now = Date.now()
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      if (this.backgroundCheckEnabled() && now - this.lastBackgroundCheck >= 10_000) {
        this.lastBackgroundCheck = now
        await this.pollResource('health', () => this.refreshHealth())
      }
      return
    }
    this.pollTickCount += 1
    const pending = [
      this.pollResource('core', () => this.refreshCore()),
      this.pollResource('health', () => this.refreshHealth()),
    ]
    if (this.pollTickCount % 4 === 0) {
      pending.push(
        this.pollResource('trades', () => this.refreshTrades()),
        this.pollResource('market', () => this.refreshMarket()),
      )
    }
    if (this.pollTickCount % 12 === 0) {
      pending.push(
        this.pollResource('analytics', () => this.refreshAnalytics()),
        this.pollResource('system', () => this.refreshSystem()),
      )
    }
    await Promise.all(pending)
  }

  async refreshHealth(): Promise<RefreshSummary> {
    const epoch = this.state.epoch
    const { generation, results } = await this.runGroup('health', epoch, [
      [
        'health.health',
        (client, options) => client.health(options),
        (value) => (this.state.data.health = value as HealthResponse),
      ],
    ])
    const stale = !this.isCurrentGroup('health', generation, epoch)
    if (!stale) this.evaluateHeartbeat()
    return summary(epoch, { health: { ok: results.every((result) => result.ok), stale } }, stale)
  }

  startPolling(): void {
    this.stopPolling()
    this.pollTimer = setInterval(() => void this.pollTick(), POLL_INTERVAL_SECONDS * 1000)
  }

  stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    this.pollInFlight.clear()
  }

  async connect(): Promise<boolean> {
    const epoch = this.state.epoch
    this.state.connection = 'connecting'
    this.state.errorKey = null
    this.state.resourceErrors = emptyResourceErrors()
    try {
      const client = this.ensureClient()
      const config = await client.showConfig()
      if (epoch !== this.state.epoch || client !== this.client) return false
      this.state.data.showConfig = config
      const started = performance.now()
      void this.refreshAll()
      const [core, trades] = await Promise.all([this.refreshCore(), this.refreshTrades()])
      if (epoch !== this.state.epoch || client !== this.client) return false
      if (core.stale || trades.stale) return false
      this.state.latencyMs ??= Math.round(performance.now() - started)
      const requiredError = preferredTransportError([
        this.state.resourceErrors.core,
        this.state.resourceErrors.trades,
        ...Object.values(this.state.resourceErrors).filter((error) => error?.key === 'errors.auth'),
      ])
      if (requiredError) {
        this.state.errorKey = requiredError
        this.state.connection = requiredError.key === 'errors.auth' ? 'unauthorized' : 'unreachable'
        return false
      }
      if (this.state.connection !== 'connecting') return false
      this.state.connection = 'online'
      return true
    } catch (error) {
      if (epoch !== this.state.epoch) return false
      this.state.errorKey = describeError(error)
      this.state.connection =
        this.state.errorKey.key === 'errors.auth' ? 'unauthorized' : 'unreachable'
      return false
    }
  }

  async fetchCandles(
    pair: string,
    timeframe: string,
    limit = 180,
    columns?: string[],
  ): Promise<PairCandlesResponse | null> {
    const key = `candles:${pair}|${timeframe}`
    const epoch = this.state.epoch
    let result = await this.call(key, (client, options) =>
      client.pairCandles(pair, timeframe, limit, columns, options),
    )
    // A strategy may explicitly reject requested signal columns. Only that contract-level
    // response gets a second, plain candle request; network/auth/server failures stay failures.
    if (!result.ok && !result.stale && canDropSignalColumns(result.error, columns)) {
      result = await this.call(key, (client, options) =>
        client.pairCandles(pair, timeframe, limit, undefined, options),
      )
    }
    if (result.ok && !result.stale && epoch === this.state.epoch) {
      this.state.data.candleCache = {
        ...this.state.data.candleCache,
        [`${pair}|${timeframe}`]: result.value as PairCandlesResponse,
      }
      const keys = Object.keys(this.state.data.candleCache)
      if (keys.length > 8) {
        this.state.data.candleCache = Object.fromEntries(
          keys.slice(-8).map((entry) => [entry, this.state.data.candleCache[entry]]),
        )
      }
      this.state.resourceErrors.candles = null
      return result.value as PairCandlesResponse
    }
    if (!result.stale && epoch === this.state.epoch) {
      this.state.resourceErrors.candles = result.error ?? null
    }
    return null
  }

  async runAction<T>(
    name: string,
    task: (client: FreqtradeApiClient) => Promise<T>,
  ): Promise<T | null> {
    if (this.actionLock) {
      return null
    }
    const token = ++this.nextActionToken
    this.actionLock = { token }
    this.state.actionPending = name
    try {
      return await task(this.ensureClient())
    } catch {
      // The caller reports the failure; there is nothing here to say that a toast does not.
      return null
    } finally {
      // Only the action that still holds the lock may clear the pending name: `stop()` drops
      // the lock, and a newer action may own the name by the time this one unwinds.
      if (this.actionLock?.token === token) {
        this.actionLock = null
        this.state.actionPending = null
      }
    }
  }

  stop(): void {
    this.state.epoch += 1
    this.stopPolling()
    for (const request of this.requests.values()) request.controller.abort()
    this.requests.clear()
    this.groupRuns.clear()
    this.actionLock = null
    this.activeRefreshToken = null
    this.state.refreshing = false
    this.state.actionPending = null
    this.state.connection = 'idle'
    this.state.coreReady = false
    this.state.tradesReady = false
    this.heartbeatAlerted = false
  }

  cleanup(): void {
    this.stop()
    this.client = null
  }
}

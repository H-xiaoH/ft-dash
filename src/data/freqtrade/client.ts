import type {
  AccessToken,
  BalanceResponse,
  BlacklistResponse,
  DailyResponse,
  DeleteLockPayload,
  ForceExitPayload,
  HealthResponse,
  LocksResponse,
  LogsResponse,
  PairCandlesResponse,
  PerformanceEntry,
  ProfitAllResponse,
  ProfitSummary,
  ShowConfigResponse,
  StatusCountResponse,
  StatusMsg,
  SysInfoResponse,
  Trade,
  TradeStats,
  TradesResponse,
  WhitelistResponse,
} from '@/lib/types'
import { ApiError } from './errors'
import { FreqtradeTransport, type Credentials, type RequestOptions } from './transport'

export const REFERENCE_FREQTRADE_VERSION_SERIES = '2026.9'
export const REFERENCE_API_VERSION = 2.5
export const REFERENCE_CONTRACT = 'freqtrade-2026.9-api-v2.5'

export type CompatibilityStatus = 'compatible' | 'warning' | 'unknown'

export interface CompatibilityResult {
  status: CompatibilityStatus
  detectedVersion: string | null
  apiVersion: number | null
  referenceContract: typeof REFERENCE_CONTRACT
  warningKey?: 'compatibility.versionMismatch' | 'compatibility.versionUnknown'
  warningParams?: Record<string, unknown>
}

interface ParseContext {
  endpoint: string
  url: string
}

type JsonObject = Record<string, unknown>
type Guard<T> = (value: unknown) => value is T

const isObject: Guard<JsonObject> = (value): value is JsonObject =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isString: Guard<string> = (value): value is string => typeof value === 'string'
const isNumber: Guard<number> = (value): value is number =>
  typeof value === 'number' && Number.isFinite(value)
const isBoolean: Guard<boolean> = (value): value is boolean => typeof value === 'boolean'
const isNumberOrString: Guard<number | string> = (value): value is number | string =>
  isNumber(value) || isString(value)

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isNumber(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value)
}

function invalid(context: ParseContext, field: string, expected: string): never {
  const detail = `${field}: expected ${expected}`
  throw new ApiError('parse', `Invalid response from ${context.endpoint} at ${field}`, {
    detail,
    url: context.url,
    endpoint: context.endpoint,
  })
}

function record(value: unknown, context: ParseContext, field = 'response'): JsonObject {
  if (!isObject(value)) invalid(context, field, 'an object')
  return value
}

function asResponse<T>(value: JsonObject): T {
  return value as unknown as T
}

function required<T>(
  value: JsonObject,
  key: string,
  guard: Guard<T>,
  context: ParseContext,
  expected: string,
  field = 'response',
): T {
  const candidate = value[key]
  if (!guard(candidate)) invalid(context, `${field}.${key}`, expected)
  return candidate
}

function optional<T>(
  value: JsonObject,
  key: string,
  guard: Guard<T>,
  context: ParseContext,
  expected: string,
  field = 'response',
): T | undefined {
  if (!(key in value)) return undefined
  return required(value, key, guard, context, expected, field)
}

function array<T>(
  value: JsonObject,
  key: string,
  context: ParseContext,
  expected: string,
  parseItem: (item: unknown, field: string) => T,
): T[] {
  const candidate = required(value, key, Array.isArray, context, expected)
  return candidate.map((item, index) => parseItem(item, `response.${key}[${index}]`))
}

function parseAccessToken(value: unknown, context: ParseContext): AccessToken {
  const object = record(value, context)
  const accessToken = required(object, 'access_token', isString, context, 'a string')
  optional(object, 'refresh_token', isString, context, 'a string')
  return { ...object, access_token: accessToken } as AccessToken
}

function parsePing(value: unknown, context: ParseContext): { status: string } {
  const object = record(value, context)
  return { status: required(object, 'status', isString, context, 'a string') }
}

function parseShowConfig(value: unknown, context: ParseContext): ShowConfigResponse {
  const object = record(value, context)
  required(object, 'version', isString, context, 'a string')
  required(object, 'api_version', isNumber, context, 'a number')
  required(object, 'dry_run', isBoolean, context, 'a boolean')
  required(object, 'stake_currency', isString, context, 'a string')
  required(object, 'stake_amount', isNumberOrString, context, 'a number or string')
  required(object, 'max_open_trades', isNumber, context, 'a number')
  return object as ShowConfigResponse
}

function parseHealth(value: unknown, context: ParseContext): HealthResponse {
  const object = record(value, context)
  // A stopped bot has never processed a round: both fields are null, not absent.
  required(object, 'last_process', isNullableString, context, 'a string or null')
  required(object, 'last_process_ts', isNullableNumber, context, 'a number or null')
  required(object, 'bot_start', isString, context, 'a string')
  required(object, 'bot_start_ts', isNumber, context, 'a number')
  required(object, 'bot_startup', isString, context, 'a string')
  required(object, 'bot_startup_ts', isNumber, context, 'a number')
  return asResponse<HealthResponse>(object)
}

function parseSysInfo(value: unknown, context: ParseContext): SysInfoResponse {
  const object = record(value, context)
  array(object, 'cpu_pct', context, 'an array of numbers', (item, field) => {
    if (!isNumber(item)) invalid(context, field, 'a number')
    return item
  })
  array(object, 'cpu_load', context, 'an array of CPU load objects', (item, field) => {
    const cpu = record(item, context, field)
    required(cpu, 'cpu', isNumber, context, 'a number', field)
    required(cpu, 'pct', isNumber, context, 'a number', field)
    return cpu
  })
  const average = required(object, 'cpu_load_avg', isObject, context, 'an object')
  required(average, '1m', isNumber, context, 'a number', 'response.cpu_load_avg')
  required(average, '5m', isNumber, context, 'a number', 'response.cpu_load_avg')
  required(average, '15m', isNumber, context, 'a number', 'response.cpu_load_avg')
  required(object, 'cpu_count', isNumber, context, 'a number')
  required(object, 'cpu_avg', isNumber, context, 'a number')
  required(object, 'ram_pct', isNumber, context, 'a number')
  return asResponse<SysInfoResponse>(object)
}

function parseBalanceCurrency(value: unknown, context: ParseContext, field: string): JsonObject {
  const object = record(value, context, field)
  required(object, 'currency', isString, context, 'a string', field)
  required(object, 'free', isNumber, context, 'a number', field)
  required(object, 'balance', isNumber, context, 'a number', field)
  required(object, 'used', isNumber, context, 'a number', field)
  required(object, 'est_stake', isNumber, context, 'a number', field)
  required(object, 'stake', isString, context, 'a string', field)
  required(object, 'is_position', isBoolean, context, 'a boolean', field)
  optional(object, 'bot_owned', isNullableNumber, context, 'a number or null', field)
  optional(object, 'est_stake_bot', isNullableNumber, context, 'a number or null', field)
  optional(object, 'position', isNumber, context, 'a number', field)
  optional(object, 'is_bot_managed', isBoolean, context, 'a boolean', field)
  return object
}

function parseBalance(value: unknown, context: ParseContext): BalanceResponse {
  const object = record(value, context)
  array(object, 'currencies', context, 'an array of balance currencies', (item, field) =>
    parseBalanceCurrency(item, context, field),
  )
  required(object, 'total', isNumber, context, 'a number')
  required(object, 'symbol', isString, context, 'a string')
  required(object, 'value', isNumber, context, 'a number')
  required(object, 'stake', isString, context, 'a string')
  required(object, 'note', isString, context, 'a string')
  optional(object, 'total_bot', isNumber, context, 'a number')
  optional(object, 'value_bot', isNumber, context, 'a number')
  return asResponse<BalanceResponse>(object)
}

const PROFIT_NUMBER_FIELDS = [
  'profit_closed_coin',
  'profit_closed_fiat',
  'profit_all_coin',
  'profit_all_fiat',
  'trade_count',
  'closed_trade_count',
  'winning_trades',
  'losing_trades',
] as const

const PROFIT_NULLABLE_NUMBER_FIELDS = [
  'profit_closed_percent_mean',
  'profit_closed_ratio_mean',
  'profit_closed_percent_sum',
  'profit_closed_ratio_sum',
  'profit_closed_percent',
  'profit_closed_ratio',
  'profit_all_percent_mean',
  'profit_all_ratio_mean',
  'profit_all_percent_sum',
  'profit_all_ratio_sum',
  'profit_all_percent',
  'profit_all_ratio',
] as const

function parseProfitSummary(
  value: unknown,
  context: ParseContext,
  field = 'response',
): ProfitSummary {
  const object = record(value, context, field)
  for (const key of PROFIT_NUMBER_FIELDS) {
    required(object, key, isNumber, context, 'a number', field)
  }
  for (const key of PROFIT_NULLABLE_NUMBER_FIELDS) {
    required(object, key, isNullableNumber, context, 'a number or null', field)
  }
  return asResponse<ProfitSummary>(object)
}

function parseProfit(value: unknown, context: ParseContext): ProfitSummary {
  return parseProfitSummary(value, context)
}

function parseProfitAll(value: unknown, context: ParseContext): ProfitAllResponse {
  const object = record(value, context)
  return {
    all: parseProfitSummary(
      required(object, 'all', isObject, context, 'an object'),
      context,
      'response.all',
    ),
    long: parseProfitSummary(
      required(object, 'long', isObject, context, 'an object'),
      context,
      'response.long',
    ),
    short: parseProfitSummary(
      required(object, 'short', isObject, context, 'an object'),
      context,
      'response.short',
    ),
  }
}

function parseApiOrder(value: unknown, context: ParseContext, field: string): JsonObject {
  return record(value, context, field)
}

function parseTrade(value: unknown, context: ParseContext, field = 'response'): Trade {
  const object = record(value, context, field)
  required(object, 'trade_id', isNumber, context, 'a number', field)
  required(object, 'pair', isString, context, 'a string', field)
  required(object, 'base_currency', isString, context, 'a string', field)
  required(object, 'quote_currency', isString, context, 'a string', field)
  required(object, 'is_open', isBoolean, context, 'a boolean', field)
  required(object, 'exchange', isString, context, 'a string', field)
  required(object, 'amount', isNumber, context, 'a number', field)
  required(object, 'stake_amount', isNumber, context, 'a number', field)
  required(object, 'strategy', isString, context, 'a string', field)
  required(object, 'fee_open', isNumber, context, 'a number', field)
  required(object, 'open_date', isString, context, 'a string', field)
  required(object, 'open_timestamp', isNumber, context, 'a number', field)
  required(object, 'open_rate', isNumber, context, 'a number', field)
  required(object, 'open_trade_value', isNumber, context, 'a number', field)
  optional(object, 'is_short', isBoolean, context, 'a boolean', field)
  if ('orders' in object) {
    array(object, 'orders', context, 'an array of orders', (item, orderField) =>
      parseApiOrder(item, context, orderField),
    )
  }
  return asResponse<Trade>(object)
}

function parseStatus(value: unknown, context: ParseContext): Trade[] {
  if (!Array.isArray(value)) invalid(context, 'response', 'an array of trades')
  return value.map((item, index) => parseTrade(item, context, `response[${index}]`))
}

function parseCount(value: unknown, context: ParseContext): StatusCountResponse {
  const object = record(value, context)
  required(object, 'current', isNumber, context, 'a number')
  required(object, 'max', isNumber, context, 'a number')
  required(object, 'total_stake', isNumber, context, 'a number')
  return asResponse<StatusCountResponse>(object)
}

function parseTrades(value: unknown, context: ParseContext): TradesResponse {
  const object = record(value, context)
  const trades = array(object, 'trades', context, 'an array of trades', (item, field) =>
    parseTrade(item, context, field),
  )
  required(object, 'trades_count', isNumber, context, 'a number')
  required(object, 'offset', isNumber, context, 'a number')
  required(object, 'total_trades', isNumber, context, 'a number')
  return { ...object, trades } as TradesResponse
}

function parseTradeStats(value: unknown, context: ParseContext): TradeStats {
  const object = record(value, context)
  const reasons = required(object, 'exit_reasons', isObject, context, 'an object')
  for (const [reason, entry] of Object.entries(reasons)) {
    const reasonObject = record(entry, context, `response.exit_reasons.${reason}`)
    required(reasonObject, 'wins', isNumber, context, 'a number', `response.exit_reasons.${reason}`)
    required(
      reasonObject,
      'losses',
      isNumber,
      context,
      'a number',
      `response.exit_reasons.${reason}`,
    )
    required(
      reasonObject,
      'draws',
      isNumber,
      context,
      'a number',
      `response.exit_reasons.${reason}`,
    )
  }
  const durations = required(object, 'durations', isObject, context, 'an object')
  required(durations, 'wins', isNullableNumber, context, 'a number or null', 'response.durations')
  required(durations, 'draws', isNullableNumber, context, 'a number or null', 'response.durations')
  required(durations, 'losses', isNullableNumber, context, 'a number or null', 'response.durations')
  return object as TradeStats
}

function parsePerformance(value: unknown, context: ParseContext): PerformanceEntry[] {
  if (!Array.isArray(value)) invalid(context, 'response', 'an array of performance entries')
  return value.map((item, index) => {
    const field = `response[${index}]`
    const object = record(item, context, field)
    required(object, 'profit_ratio', isNumber, context, 'a number', field)
    required(object, 'profit_pct', isNumber, context, 'a number', field)
    required(object, 'profit_abs', isNumber, context, 'a number', field)
    required(object, 'count', isNumber, context, 'a number', field)
    required(object, 'pair', isString, context, 'a string', field)
    required(object, 'profit', isNumber, context, 'a number', field)
    return asResponse<PerformanceEntry>(object)
  })
}

function parseDaily(value: unknown, context: ParseContext): DailyResponse {
  const object = record(value, context)
  array(object, 'data', context, 'an array of daily entries', (item, field) => {
    const entry = record(item, context, field)
    required(entry, 'date', isString, context, 'a string', field)
    required(entry, 'abs_profit', isNumber, context, 'a number', field)
    required(entry, 'rel_profit', isNumber, context, 'a number', field)
    required(entry, 'starting_balance', isNumber, context, 'a number', field)
    required(entry, 'fiat_value', isNumber, context, 'a number', field)
    required(entry, 'trade_count', isNumber, context, 'a number', field)
    return entry
  })
  required(object, 'fiat_display_currency', isString, context, 'a string')
  required(object, 'stake_currency', isString, context, 'a string')
  return asResponse<DailyResponse>(object)
}

function parseLogs(value: unknown, context: ParseContext): LogsResponse {
  const object = record(value, context)
  required(object, 'log_count', isNumber, context, 'a number')
  array(object, 'logs', context, 'an array of log tuples', (item, field) => {
    if (!Array.isArray(item) || item.length < 5) invalid(context, field, 'a five-field log tuple')
    if (!isString(item[0])) invalid(context, `${field}[0]`, 'a string')
    if (!isNumber(item[1])) invalid(context, `${field}[1]`, 'a number')
    if (!isString(item[2])) invalid(context, `${field}[2]`, 'a string')
    if (!isString(item[3])) invalid(context, `${field}[3]`, 'a string')
    if (!isString(item[4])) invalid(context, `${field}[4]`, 'a string')
    return item as LogsResponse['logs'][number]
  })
  return asResponse<LogsResponse>(object)
}

function parseWhitelist(value: unknown, context: ParseContext): WhitelistResponse {
  const object = record(value, context)
  array(object, 'whitelist', context, 'an array of strings', (item, field) => {
    if (!isString(item)) invalid(context, field, 'a string')
    return item
  })
  return asResponse<WhitelistResponse>(object)
}

function parseBlacklist(value: unknown, context: ParseContext): BlacklistResponse {
  const object = record(value, context)
  array(object, 'blacklist', context, 'an array of strings', (item, field) => {
    if (!isString(item)) invalid(context, field, 'a string')
    return item
  })
  return asResponse<BlacklistResponse>(object)
}

function parseLocks(value: unknown, context: ParseContext): LocksResponse {
  const object = record(value, context)
  required(object, 'lock_count', isNumber, context, 'a number')
  array(object, 'locks', context, 'an array of locks', (item, field) => {
    const lock = record(item, context, field)
    required(lock, 'id', isNumber, context, 'a number', field)
    required(lock, 'pair', isString, context, 'a string', field)
    required(lock, 'lock_end_time', isString, context, 'a string', field)
    required(lock, 'lock_end_timestamp', isNumber, context, 'a number', field)
    required(lock, 'reason', isString, context, 'a string', field)
    required(lock, 'active', isBoolean, context, 'a boolean', field)
    return lock
  })
  return asResponse<LocksResponse>(object)
}

function parsePairCandles(value: unknown, context: ParseContext): PairCandlesResponse {
  const object = record(value, context)
  required(object, 'strategy', isString, context, 'a string')
  required(object, 'pair', isString, context, 'a string')
  required(object, 'timeframe', isString, context, 'a string')
  required(object, 'timeframe_ms', isNumber, context, 'a number')
  array(object, 'columns', context, 'an array of column names', (item, field) => {
    if (!isString(item)) invalid(context, field, 'a string')
    return item
  })
  array(object, 'data', context, 'an array of candle rows', (item, field) => {
    if (!Array.isArray(item)) invalid(context, field, 'an array of candle values')
    for (const [index, cell] of item.entries()) {
      if (!(cell === null || isNumber(cell) || isString(cell))) {
        invalid(context, `${field}[${index}]`, 'a number, string or null')
      }
    }
    return item
  })
  required(object, 'length', isNumber, context, 'a number')
  optional(object, 'buy_signals', isNumber, context, 'a number')
  optional(object, 'sell_signals', isNumber, context, 'a number')
  // PairHistory declares this as a datetime, which FastAPI serializes as an ISO string.
  optional(object, 'last_analyzed', isNullableString, context, 'a string or null')
  optional(object, 'last_analyzed_ts', isNullableNumber, context, 'a number or null')
  return asResponse<PairCandlesResponse>(object)
}

function parseStatusMsg(value: unknown, context: ParseContext): StatusMsg {
  return record(value, context) as StatusMsg
}

export class FreqtradeApiClient {
  readonly baseUrl: string
  readonly transport: FreqtradeTransport
  private readonly credentials: Credentials

  constructor(credentials: Credentials) {
    this.credentials = { ...credentials }
    this.transport = new FreqtradeTransport(credentials)
    this.baseUrl = this.transport.baseUrl
  }

  request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.transport.request<T>(path, options)
  }

  private parseUrl(path: string): string {
    return `${this.baseUrl}${path}`
  }

  private async parsed<T>(
    path: string,
    parser: (value: unknown, context: ParseContext) => T,
    options: RequestOptions = {},
  ): Promise<T> {
    const value = await this.transport.request<unknown>(path, options)
    return parser(value, { endpoint: path, url: this.parseUrl(path) })
  }

  /** Mints a JWT for the websocket endpoint. */
  async login(): Promise<string> {
    const token = await this.parsed('/token/login', parseAccessToken, {
      method: 'POST',
      form: {
        username: this.credentials.username,
        password: this.credentials.password,
        grant_type: 'password',
      },
      basic: true,
      timeoutMs: 15_000,
    })
    this.transport.setBearerToken(token.access_token)
    return token.access_token
  }

  // --- read-only endpoints -------------------------------------------------

  ping(options: RequestOptions = {}): Promise<{ status: string }> {
    return this.parsed('/ping', parsePing, { timeoutMs: 12_000, ...options })
  }

  showConfig(options: RequestOptions = {}): Promise<ShowConfigResponse> {
    return this.parsed('/show_config', parseShowConfig, options)
  }

  health(options: RequestOptions = {}): Promise<HealthResponse> {
    return this.parsed('/health', parseHealth, { timeoutMs: 12_000, ...options })
  }

  sysinfo(options: RequestOptions = {}): Promise<SysInfoResponse> {
    return this.parsed('/sysinfo', parseSysInfo, options)
  }

  balance(options: RequestOptions = {}): Promise<BalanceResponse> {
    return this.parsed('/balance', parseBalance, options)
  }

  profit(options: RequestOptions = {}): Promise<ProfitSummary> {
    return this.parsed('/profit', parseProfit, options)
  }

  profitAll(options: RequestOptions = {}): Promise<ProfitAllResponse> {
    return this.parsed('/profit_all', parseProfitAll, options)
  }

  status(options: RequestOptions = {}): Promise<Trade[]> {
    return this.parsed('/status', parseStatus, { timeoutMs: 25_000, ...options })
  }

  count(options: RequestOptions = {}): Promise<StatusCountResponse> {
    return this.parsed('/count', parseCount, options)
  }

  trades(
    params: { limit?: number; offset?: number } = {},
    options: RequestOptions = {},
  ): Promise<TradesResponse> {
    return this.parsed('/trades', parseTrades, {
      query: { limit: params.limit, offset: params.offset },
      ...options,
    })
  }

  tradeStats(options: RequestOptions = {}): Promise<TradeStats> {
    return this.parsed('/stats', parseTradeStats, options)
  }

  performance(options: RequestOptions = {}): Promise<PerformanceEntry[]> {
    return this.parsed('/performance', parsePerformance, options)
  }

  daily(days?: number, options: RequestOptions = {}): Promise<DailyResponse> {
    return this.parsed('/daily', parseDaily, { query: { timescale: days }, ...options })
  }

  weekly(weeks?: number, options: RequestOptions = {}): Promise<DailyResponse> {
    return this.parsed('/weekly', parseDaily, { query: { timescale: weeks }, ...options })
  }

  monthly(months?: number, options: RequestOptions = {}): Promise<DailyResponse> {
    return this.parsed('/monthly', parseDaily, { query: { timescale: months }, ...options })
  }

  logs(limit = 100, options: RequestOptions = {}): Promise<LogsResponse> {
    return this.parsed('/logs', parseLogs, { query: { limit }, ...options })
  }

  whitelist(options: RequestOptions = {}): Promise<WhitelistResponse> {
    return this.parsed('/whitelist', parseWhitelist, options)
  }

  blacklist(options: RequestOptions = {}): Promise<BlacklistResponse> {
    return this.parsed('/blacklist', parseBlacklist, options)
  }

  locks(options: RequestOptions = {}): Promise<LocksResponse> {
    return this.parsed('/locks', parseLocks, options)
  }

  pairCandles(
    pair: string,
    timeframe: string,
    limit = 200,
    columns?: string[],
    options: RequestOptions = {},
  ): Promise<PairCandlesResponse> {
    if (columns?.length) {
      return this.parsed('/pair_candles', parsePairCandles, {
        method: 'POST',
        body: { pair, timeframe, limit, columns },
        ...options,
      })
    }
    return this.parsed('/pair_candles', parsePairCandles, {
      query: { pair, timeframe, limit },
      ...options,
    })
  }

  private compatibilityFor(
    detectedVersion: string | null,
    apiVersion: number | null,
  ): CompatibilityResult {
    const base: Pick<CompatibilityResult, 'referenceContract'> = {
      referenceContract: REFERENCE_CONTRACT,
    }
    if (!detectedVersion || apiVersion === null) {
      return {
        ...base,
        status: 'unknown',
        detectedVersion,
        apiVersion,
        warningKey: 'compatibility.versionUnknown',
      }
    }
    const versionMatches = new RegExp(
      `^${REFERENCE_FREQTRADE_VERSION_SERIES.replace('.', '\\.')}(?:\\.|$)`,
    ).test(detectedVersion)
    const apiMatches = apiVersion === REFERENCE_API_VERSION
    if (versionMatches && apiMatches) {
      return {
        ...base,
        status: 'compatible',
        detectedVersion,
        apiVersion,
      }
    }
    return {
      ...base,
      status: 'warning',
      detectedVersion,
      apiVersion,
      warningKey: 'compatibility.versionMismatch',
      warningParams: {
        detectedVersion,
        apiVersion,
        referenceContract: REFERENCE_CONTRACT,
      },
    }
  }

  /**
   * Reads the version endpoint first. Some current Freqtrade responses expose only the release
   * there, so the API version is completed from show_config; a missing or broken probe remains
   * a warning and never turns the subsequent connection into a ban.
   */
  async inspectCompatibility(): Promise<CompatibilityResult> {
    let value: unknown
    try {
      value = await this.transport.request<unknown>('/version')
    } catch {
      return this.compatibilityFor(null, null)
    }

    if (!isObject(value) || !isString(value.version)) {
      return this.compatibilityFor(null, null)
    }

    let apiVersion = isNumber(value.api_version) ? value.api_version : null
    if (apiVersion === null) {
      try {
        const config = await this.transport.request<unknown>('/show_config')
        apiVersion = isObject(config) && isNumber(config.api_version) ? config.api_version : null
      } catch {
        // Keep the release in the warning so the operator can still identify the bot.
      }
    }
    return this.compatibilityFor(value.version, apiVersion)
  }

  // --- write endpoints -----------------------------------------------------

  start(options: RequestOptions = {}): Promise<StatusMsg> {
    return this.parsed('/start', parseStatusMsg, { method: 'POST', ...options })
  }

  stop(options: RequestOptions = {}): Promise<StatusMsg> {
    return this.parsed('/stop', parseStatusMsg, { method: 'POST', ...options })
  }

  pause(options: RequestOptions = {}): Promise<StatusMsg> {
    return this.parsed('/stopentry', parseStatusMsg, { method: 'POST', ...options })
  }

  reloadConfig(options: RequestOptions = {}): Promise<StatusMsg> {
    return this.parsed('/reload_config', parseStatusMsg, { method: 'POST', ...options })
  }

  forceExit(payload: ForceExitPayload, options: RequestOptions = {}): Promise<StatusMsg> {
    return this.parsed('/forceexit', parseStatusMsg, { method: 'POST', body: payload, ...options })
  }

  addBlacklist(pairs: string[], options: RequestOptions = {}): Promise<BlacklistResponse> {
    return this.parsed('/blacklist', parseBlacklist, {
      method: 'POST',
      body: { blacklist: pairs },
      ...options,
    })
  }

  deleteBlacklist(pairs: string[], options: RequestOptions = {}): Promise<BlacklistResponse> {
    return this.parsed('/blacklist', parseBlacklist, {
      method: 'DELETE',
      query: { pairs_to_delete: pairs },
      ...options,
    })
  }

  deleteLock(payload: DeleteLockPayload, options: RequestOptions = {}): Promise<LocksResponse> {
    return this.parsed('/locks/delete', parseLocks, { method: 'POST', body: payload, ...options })
  }
}

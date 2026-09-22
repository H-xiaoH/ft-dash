/**
 * Shapes returned by the Freqtrade REST API v1 (`/api/v1/*`).
 * Only the fields ft-dash actually renders are typed; the API returns more.
 * Reference: Freqtrade 2026.8, api_version 2.5.
 */

export interface OrderTypeCount {
  [key: string]: number
}

export interface ShowConfigResponse {
  version: string
  strategy_version?: string
  api_version: number
  dry_run: boolean
  demo_trading?: boolean
  state?: string
  runmode?: string
  trading_mode?: string
  margin_mode?: string
  short_allowed?: boolean
  stake_currency: string
  stake_amount: number | string
  available_capital?: number | null
  stake_currency_decimals?: number
  max_open_trades: number
  minimal_roi?: Record<string, number>
  stoploss?: number
  stoploss_on_exchange?: boolean
  trailing_stop?: boolean
  trailing_stop_positive?: number | null
  trailing_stop_positive_offset?: number
  trailing_only_offset_is_reached?: boolean
  unfilledtimeout?: { entry: number; exit: number; unit: string; exit_timeout_count?: number }
  order_types?: OrderTypeCount
  force_entry_enable?: boolean
  position_adjustment_enable?: boolean
  max_entry_position_adjustment?: number
  bot_name?: string
  timeframe?: string
  exchange?: string
  [key: string]: unknown
}

export interface BalanceCurrency {
  currency: string
  free: number
  balance: number
  used: number
  bot_owned?: number | null
  est_stake: number
  est_stake_bot?: number | null
  stake: string
  side?: string
  is_position: boolean
  position?: number
  is_bot_managed?: boolean
}

export interface BalanceResponse {
  currencies: BalanceCurrency[]
  total: number
  total_bot?: number
  symbol: string
  value: number
  value_bot?: number
  stake: string
  note: string
  starting_capital?: number
  starting_capital_ratio?: number
  starting_capital_pct?: number
  starting_capital_fiat?: number
}

export interface ProfitSummary {
  profit_closed_coin: number
  profit_closed_percent_mean: number | null
  profit_closed_ratio_mean: number | null
  profit_closed_percent_sum: number | null
  profit_closed_ratio_sum: number | null
  profit_closed_percent: number | null
  profit_closed_ratio: number | null
  profit_closed_fiat: number
  profit_all_coin: number
  profit_all_percent_mean: number | null
  profit_all_ratio_mean: number | null
  profit_all_percent_sum: number | null
  profit_all_ratio_sum: number | null
  profit_all_percent: number | null
  profit_all_ratio: number | null
  profit_all_fiat: number
  trade_count: number
  closed_trade_count: number
  first_trade_date?: string | null
  first_trade_timestamp?: number | null
  latest_trade_date?: string | null
  latest_trade_timestamp?: number | null
  avg_duration?: string | null
  best_pair?: string | null
  best_rate?: number | null
  best_pair_profit_ratio?: number | null
  best_pair_profit_abs?: number | null
  winning_trades: number
  losing_trades: number
  profit_factor?: number | null
  winrate?: number | null
  expectancy?: number | null
  expectancy_ratio?: number | null
  sharpe?: number | null
  sortino?: number | null
  sqn?: number | null
  calmar?: number | null
  cagr?: number | null
  max_drawdown?: number | null
  max_drawdown_abs?: number | null
  max_drawdown_start?: string | null
  max_drawdown_end?: string | null
  current_drawdown?: number | null
  current_drawdown_abs?: number | null
  current_drawdown_high?: number | null
  current_drawdown_start?: string | null
  trading_volume?: number | null
  bot_start_timestamp?: number | null
  bot_start_date?: string | null
}

export interface ProfitAllResponse {
  all: ProfitSummary
  long: ProfitSummary
  short: ProfitSummary
}

export interface ApiOrder {
  order_id?: string
  status?: string
  order_type?: string
  side?: string
  price?: number
  average?: number | null
  amount?: number
  filled?: number
  remaining?: number
  cost?: number
  order_date?: string
  order_timestamp?: number
  order_filled_date?: string | null
  order_filled_timestamp?: number | null
  ft_order_side?: string
  ft_pair?: string
  ft_is_open?: boolean
  fee?: number | null
}

export interface Trade {
  trade_id: number
  pair: string
  base_currency: string
  quote_currency: string
  is_open: boolean
  is_short?: boolean
  exchange: string
  amount: number
  amount_requested?: number
  stake_amount: number
  max_stake_amount?: number
  strategy: string
  enter_tag?: string | null
  timeframe?: number | string | null
  fee_open: number
  fee_open_cost?: number | null
  fee_open_currency?: string | null
  fee_close?: number | null
  fee_close_cost?: number | null
  fee_close_currency?: string | null
  open_date: string
  open_timestamp: number
  open_fill_date?: string | null
  open_fill_timestamp?: number | null
  open_rate: number
  open_rate_requested?: number | null
  open_trade_value: number
  close_date?: string | null
  close_timestamp?: number | null
  close_rate?: number | null
  close_rate_requested?: number | null
  close_profit?: number | null
  close_profit_pct?: number | null
  close_profit_abs?: number | null
  profit_ratio?: number | null
  profit_pct?: number | null
  profit_abs?: number | null
  profit_fiat?: number | null
  realized_profit?: number | null
  exit_reason?: string | null
  exit_order_status?: string | null
  stop_loss_abs?: number | null
  stop_loss_ratio?: number | null
  stop_loss_pct?: number | null
  stoploss_last_update?: string | null
  initial_stop_loss_abs?: number | null
  min_rate?: number | null
  max_rate?: number | null
  nr_of_successful_entries?: number
  nr_of_successful_exits?: number
  has_open_orders?: boolean
  orders?: ApiOrder[]
  leverage?: number | null
  interest_rate?: number | null
  liquidation_price?: number | null
  funding_fees?: number | null
  trading_mode?: string
  amount_precision?: number
  price_precision?: number
  current_rate?: number | null
  total_profit_abs?: number | null
  total_profit_fiat?: number | null
  total_profit_ratio?: number | null
}

export interface TradesResponse {
  trades: Trade[]
  trades_count: number
  offset: number
  total_trades: number
}

export interface StatusCountResponse {
  current: number
  max: number
  total_stake: number
}

export interface PerformanceEntry {
  profit_ratio: number
  profit_pct: number
  profit_abs: number
  count: number
  pair: string
  profit: number
}

export interface EntryStats {
  profit_ratio: number
  profit_pct: number
  profit_abs: number
  count: number
  enter_tag: string
}

export interface ExitStats {
  profit_ratio: number
  profit_pct: number
  profit_abs: number
  count: number
  exit_reason: string
}

export interface MixTagStats {
  profit_ratio: number
  profit_pct: number
  profit_abs: number
  count: number
  mix_tag: string
}

export interface TradeStats {
  exit_reasons: Record<string, { wins: number; losses: number; draws: number }>
  durations: { wins: number | null; draws: number | null; losses: number | null }
  [key: string]: unknown
}

export interface DailyEntry {
  date: string
  abs_profit: number
  rel_profit: number
  starting_balance: number
  fiat_value: number
  trade_count: number
}

export interface DailyResponse {
  data: DailyEntry[]
  fiat_display_currency: string
  stake_currency: string
}

export interface LogsResponse {
  log_count: number
  logs: [string, number, string, string, string][]
}

export interface HealthResponse {
  last_process: string
  last_process_ts: number
  bot_start: string
  bot_start_ts: number
  bot_startup: string
  bot_startup_ts: number
}

export interface SysInfoResponse {
  cpu_pct: number[]
  cpu_load: { cpu: number; pct: number }[]
  cpu_load_avg: { '1m': number; '5m': number; '15m': number }
  cpu_count: number
  cpu_avg: number
  ram_pct: number
}

export interface WhitelistResponse {
  whitelist: string[]
  length?: number
  method?: string[]
}

export interface BlacklistResponse {
  blacklist: string[]
  length?: number
  errors?: Record<string, string>
}

export interface Lock {
  id: number
  pair: string
  lock_end_time: string
  lock_end_timestamp: number
  reason: string
  active: boolean
}

export interface LocksResponse {
  lock_count: number
  locks: Lock[]
}

export interface LockPayload {
  pair: string
  until: string
  reason?: string
  side?: string | null
}

export interface DeleteLockPayload {
  lockid?: number
  pair?: string
}

export interface PairCandlesResponse {
  strategy: string
  pair: string
  timeframe: string
  timeframe_ms: number
  columns: string[]
  data: (number | string | null)[][]
  length: number
  buy_signals?: number
  sell_signals?: number
  last_analyzed?: number | null
  last_analyzed_ts?: number | null
}

export interface StatusMsg {
  status?: string
  [key: string]: unknown
}

export interface ForceExitPayload {
  tradeid: string | number
  ordertype?: 'market' | 'limit'
  amount?: number
  price?: number
}

export interface ForceEnterPayload {
  pair: string
  side?: 'long' | 'short'
  price?: number
  ordertype?: 'market' | 'limit'
  stakeamount?: number
  entry_tag?: string
  leverage?: number
}

export interface ApiErrorBody {
  detail?: string | { msg: string; type: string }[]
  error?: string
}

export interface AccessToken {
  access_token: string
  refresh_token?: string
}

export type WsEventType =
  | 'status'
  | 'warning'
  | 'exception'
  | 'startup'
  | 'shutdown'
  | 'entry'
  | 'entry_fill'
  | 'entry_cancel'
  | 'exit'
  | 'exit_fill'
  | 'exit_cancel'
  | 'protection_trigger'
  | 'protection_trigger_global'
  | 'strategy_msg'
  | 'whitelist'
  | 'analyzed_df'
  | 'new_candle'

export interface WsMessage {
  type: WsEventType | string
  data?: Record<string, unknown>
}

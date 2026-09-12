import { del, get, post } from './client'

/**
 * Thin, explicit wrapper over the freqtrade REST API.
 * Reference: https://www.freqtrade.io/en/stable/rest-api/
 */
export const api = {
  version: () => get('/version'),
  showConfig: () => get('/show_config'),
  health: () => get('/health'),
  sysinfo: () => get('/sysinfo'),
  logs: (limit = 200) => get('/logs', { limit }),

  profit: () => get('/profit'),
  balance: () => get('/balance'),
  count: () => get('/count'),
  performance: () => get('/performance'),
  stats: () => get('/stats'),

  daily: (timescale = 7) => get('/daily', { timescale }),
  weekly: (timescale = 4) => get('/weekly', { timescale }),
  monthly: (timescale = 3) => get('/monthly', { timescale }),

  status: () => get('/status'),
  /** Returns `{ trades, trades_count, offset, total_trades }`. `orderById: false` sorts newest first. */
  trades: ({ limit = 50, offset = 0, orderById = false } = {}) =>
    get('/trades', { limit, offset, order_by_id: orderById }),

  whitelist: () => get('/whitelist'),
  blacklist: () => get('/blacklist'),
  addBlacklist: (pairs) => post('/blacklist', { blacklist: [].concat(pairs) }),
  deleteBlacklist: (pairs) => del('/blacklist', { blacklist: [].concat(pairs) }),

  locks: () => get('/locks'),
  addLock: ({ pair, until, side, reason }) =>
    post('/locks', { pair, until, side: side || 'long', reason: reason || '' }),
  deleteLock: (id) => del(`/locks/${id}`),

  strategies: () => get('/strategies'),
  strategy: (name) => get(`/strategy/${encodeURIComponent(name)}`),

  pairCandles: ({ pair, timeframe, limit = 300 }) =>
    get('/pair_candles', { pair, timeframe, limit }),

  /* ------------------------------------------------------------- bot control */

  start: () => post('/start'),
  stop: () => post('/stop'),
  pause: () => post('/pause'),
  stopBuy: () => post('/stopbuy'),
  reloadConfig: () => post('/reload_config'),

  forceExit: (tradeId, { ordertype, amount } = {}) =>
    post(`/forceexit/${encodeURIComponent(tradeId)}`, { ordertype, amount }),
  forceEnter: ({ pair, side = 'long', price, ordertype, stakeamount, entryTag, leverage }) =>
    post('/forceenter', {
      pair,
      side,
      price,
      ordertype,
      stakeamount,
      entry_tag: entryTag,
      leverage,
    }),

  // `tradeId` is interpolated into the path, so encode it: an id from a
  // compromised or buggy bot must not be able to reshape the request URL.
  cancelOpenOrder: (tradeId) => del(`/trades/${encodeURIComponent(tradeId)}/open-order`),
  reloadTrade: (tradeId) => post(`/trades/${encodeURIComponent(tradeId)}/reload`),
  deleteTrade: (tradeId) => del(`/trades/${encodeURIComponent(tradeId)}`),
}

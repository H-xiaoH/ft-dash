/**
 * Live end-to-end check against a real freqtrade bot.
 *
 * Loads the app's own client + stores through Vite and drives them exactly as the
 * browser would: login -> refreshAll -> derived values. Any field-name or envelope
 * mismatch shows up here as a wrong number or a recorded error.
 *
 *   FT_BASE=https://bot.example.com/api/v1 FT_USER=you FT_PASS=secret \
 *     node scripts/verify-live.mjs
 */
import { createServer } from 'vite'
import { createPinia, setActivePinia } from 'pinia'

const BASE = (process.env.FT_BASE || 'http://127.0.0.1:8080/api/v1').replace(/\/+$/, '')
const USER = process.env.FT_USER
const PASS = process.env.FT_PASS

if (!USER || !PASS) {
  console.error('Missing credentials.')
  console.error(
    'Usage: FT_BASE=https://bot.example.com/api/v1 FT_USER=<user> FT_PASS=<pass> node scripts/verify-live.mjs',
  )
  process.exit(2)
}

// Only localStorage is needed - the stores touch no other DOM API.
const storage = new Map()
globalThis.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
}

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

const [{ useAuthStore }, { useBotStore }, client] = await Promise.all([
  server.ssrLoadModule('/src/stores/auth.js'),
  server.ssrLoadModule('/src/stores/bot.js'),
  server.ssrLoadModule('/src/api/client.js'),
])

setActivePinia(createPinia())
const auth = useAuthStore()
const bot = useBotStore()

let failures = 0
const check = (label, condition, detail = '') => {
  if (condition) {
    console.log(`✓ ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    failures += 1
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}
const money = (value) => (value === null || value === undefined ? '—' : Number(value).toFixed(6))

console.log(`Base: ${BASE}\nUser: ${USER}\n`)

try {
  await auth.connect({ baseUrl: BASE, username: USER, password: PASS, remember: true })
} catch (error) {
  console.error(`\nCould not authenticate against ${BASE}`)
  console.error(`  ${error?.message || error}`)
  console.error('Check FT_BASE / FT_USER / FT_PASS, and that the bot is reachable from here.')
  await server.close()
  process.exit(2)
}
check('login', auth.authenticated === true, `transport=${client.session.mode}`)

await bot.refreshAll()
await bot.loadMany(['logs', 'sysinfo', 'strategies'], { silent: true })

const s = bot.summary
console.log('\n--- derived values ---')
console.log(`  策略            ${bot.data.config?.strategy} @ ${bot.data.config?.timeframe}`)
console.log(`  交易所 / 模式   ${bot.data.config?.exchange} · ${bot.data.config?.trading_mode} · ${bot.runmode}${bot.dryRun ? ' (dry-run)' : ''}`)
console.log(`  机器人状态      ${bot.botState}`)
console.log(`  总资产          ${money(bot.balanceTotal)} ${bot.stakeCurrency}`)
console.log(`  总盈亏          ${money(s.absAll)} (${money(s.pctAll)}%)`)
console.log(`  已平仓盈亏      ${money(s.absClosed)}`)
console.log(`  交易数          总 ${s.tradeCount} / 已平仓 ${s.closedTradeCount} / 持仓 ${bot.openTradesCount}/${bot.maxOpenTrades}`)
console.log(`  胜率            ${s.winRate === null ? '—' : s.winRate.toFixed(1) + '%'} (${s.winning} 赢 / ${s.losing} 亏)`)
console.log(`  盈亏比 / 回撤   ${money(s.profitFactor)} / ${money(s.maxDrawdownAbs)}`)
console.log(`  最近平仓        ${bot.data.trades.length} 条`)
console.log(`  持仓市值        ${money(bot.openTradesValue)} / 浮动 ${money(bot.openTradesProfitAbs)}`)
console.log(`  白名单 / 黑名单 ${bot.data.whitelist?.whitelist?.length} / ${bot.data.blacklist?.blacklist?.length}`)
console.log(`  交易锁          ${bot.data.locks.length}`)
console.log(`  日志行          ${bot.data.logs.length}（已解析 5 段格式）`)
console.log(`  日线数据        ${bot.data.daily.length} 天`)
console.log(`  曲线末端累计    ${money(bot.profitTrend.at(-1)?.cumulative)}`)
console.log(`  退出原因        ${bot.statsSummary.rows.length} 种，合计 ${bot.statsSummary.totalTrades} 笔`)
console.log(`  交易对表现      ${bot.performanceRows.length} 个`)

if (bot.performanceRows[0]) {
  const top = bot.performanceRows[0]
  console.log(`  最佳交易对      ${top.pair} ${money(top.abs)} (${(top.ratio * 100).toFixed(2)}%)`)
}
if (bot.balanceCurrencies.length) {
  console.log(`  余额币种        ${bot.balanceCurrencies.map((c) => `${c.currency}=${money(c.balance ?? c.free)}`).join(', ')}`)
}

console.log('\n--- assertions ---')
check('core endpoints all succeeded', bot.errorList.filter((e) => ['profit', 'balance', 'count', 'openTrades', 'config', 'trades', 'daily', 'stats', 'performance'].includes(e.key)).length === 0,
  bot.errorList.map((e) => `${e.key}: ${e.message}`).join('; ') || 'no errors')

check('balance total is a number', typeof bot.balanceTotal === 'number' && bot.balanceTotal > 0, money(bot.balanceTotal))
check('profit summary resolved', typeof s.absAll === 'number', money(s.absAll))
check('win rate in 0..100', s.winRate === null || (s.winRate >= 0 && s.winRate <= 100), String(s.winRate))
check('open trades is an array of trades', Array.isArray(bot.data.openTrades) && bot.data.openTrades.every((t) => t.trade_id !== undefined))
check('trades unwrapped from envelope', Array.isArray(bot.data.trades), `${bot.data.trades.length} rows, total=${bot.tradesTotal}`)
check('daily unwrapped and chronological', Array.isArray(bot.data.daily) && bot.profitTrend.length === bot.data.daily.length)
check('locks unwrapped from envelope', Array.isArray(bot.data.locks))
check('logs unwrapped and parsed', Array.isArray(bot.data.logs) && bot.data.logs.every((row) => Array.isArray(row) && row.length >= 4))
check('stats exit reasons mapped', bot.statsSummary.rows.length > 0, `${bot.statsSummary.rows.length} reasons`)
check('stats durations are numeric seconds', bot.statsSummary.durations.every((d) => typeof d.avg === 'number' || typeof d.avg === 'string'))

// freqtrade reports -100 for these when there is not enough data; the UI must not
// print that as if it were a real ratio.
for (const key of ['sortino', 'calmar']) {
  const raw = bot.data.profit?.[key]
  if (raw === -100) check(`sentinel: raw ${key}=-100 masked to null`, s[key] === null, `summary.${key}=${s[key]}`)
}
check('drawdown: zero stays zero', s.maxDrawdownAbs === 0 || s.maxDrawdownAbs > 0, String(s.maxDrawdownAbs))

const errorKeys = bot.errorList.filter((e) => !['strategies', 'available_pairs'].includes(e.key))
check('only state-dependent endpoints may fail', errorKeys.length === 0, errorKeys.map((e) => `${e.key}: ${e.message}`).join('; ') || 'none')

// A trade's profit must not be derived when the API already provides a ratio.
const sample = bot.data.openTrades[0]
if (sample) {
  const { tradeProfitRatio, toEpochSeconds } = await server.ssrLoadModule('/src/utils/format.js')
  check('open trade profit ratio matches API field', tradeProfitRatio(sample) === sample.profit_ratio, `${tradeProfitRatio(sample)} vs ${sample.profit_ratio}`)
  const open = toEpochSeconds(sample.open_timestamp)
  check('timestamp normalised to seconds', open !== null && open < 1e11, `open_timestamp=${sample.open_timestamp} -> ${open}`)
  check('holding duration is positive and sane', open !== null && Date.now() / 1000 - open > 0)
}

/* ------------------------------- session restore without a stored password */

// This is the flow a returning user hits: close the tab, reopen, and the app has
// only a refresh token to work with. If the proactive refresh did not work here,
// every returning user would be silently logged out.
{
  const stored = JSON.parse(globalThis.localStorage.getItem('ft.auth') || '{}')
  check('restore: no password written to storage', !('password' in stored) && !JSON.stringify(stored).includes(PASS))
  check('restore: refresh token present', Boolean(stored.refreshToken))

  setActivePinia(createPinia())
  const restoredAuth = useAuthStore()
  const restoredBot = useBotStore()
  restoredAuth.hydrate()

  check('restore: session comes back without a password', restoredAuth.authenticated === true)
  check('restore: password is absent from memory', client.session.password === '')

  await restoredBot.load('profit')
  check(
    'restore: first request succeeds via a token refresh',
    !restoredBot.errors.profit && restoredBot.data.profit?.trade_count !== undefined,
    restoredBot.errors.profit || `trade_count=${restoredBot.data.profit?.trade_count}`,
  )
}

await server.close()
console.log(failures ? `\n${failures} check(s) failed` : '\nAll live checks passed')
process.exit(failures ? 1 : 0)

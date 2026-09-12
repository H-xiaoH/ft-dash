import { ref } from 'vue'
import { api } from '@/api/endpoints'
import { useBotStore } from '@/stores/bot'
import { useUiStore } from '@/stores/ui'

/**
 * Every mutating call to the bot funnels through here so that each one gets the
 * same treatment: optional confirmation, a command-log entry, a toast and a
 * data refresh.
 */
export function useBotActions() {
  const bot = useBotStore()
  const ui = useUiStore()
  const busy = ref('')

  const running = (key) => busy.value === key

  async function run(key, label, fn, { confirm, successMessage, refresh = true } = {}) {
    if (confirm) {
      const ok = await ui.confirm(confirm)
      if (!ok) return false
    }
    busy.value = key
    const entry = ui.log({ action: label, key })
    try {
      const result = await fn()
      const detail =
        result && typeof result === 'object'
          ? result.status || result.result || JSON.stringify(result).slice(0, 160)
          : String(result ?? '')
      entry.ok(detail)
      ui.success(successMessage || `${label} 成功`, detail)
      if (refresh) await bot.refreshCore({ silent: false })
      return true
    } catch (error) {
      const message = error?.message || '请求失败'
      entry.fail(message)
      ui.error(`${label} 失败`, message)
      return false
    } finally {
      busy.value = ''
    }
  }

  return {
    busy,
    running,
    start: () =>
      run('start', '启动机器人', () => api.start(), {
        confirm: {
          title: '启动机器人',
          message: '机器人将开始按照策略开仓。确认启动？',
          confirmLabel: '启动',
        },
      }),
    stop: () =>
      run('stop', '停止机器人', () => api.stop(), {
        confirm: {
          title: '停止机器人',
          message: '机器人将停止。已有持仓不会被自动平掉，需要你手动处理。',
          confirmLabel: '停止',
          danger: true,
        },
      }),
    pause: () =>
      run('pause', '暂停机器人', () => api.pause(), {
        confirm: {
          title: '暂停机器人',
          message: '暂停后不再开新仓，已有持仓按各自规则退出。',
          confirmLabel: '暂停',
        },
      }),
    stopBuy: () =>
      run('stopbuy', '停止开仓', () => api.stopBuy(), {
        confirm: {
          title: '停止开仓',
          message: '机器人将优雅地退出所有持仓，并且不再开新仓。',
          confirmLabel: '停止开仓',
        },
      }),
    reloadConfig: () =>
      run('reload', '重载配置', () => api.reloadConfig(), {
        confirm: {
          title: '重载配置',
          message: '将从 config 文件重新加载配置和策略参数。',
          confirmLabel: '重载',
        },
      }),

    forceExit: (trade, amount) =>
      run(`exit-${trade.trade_id}`, `强制平仓 #${trade.trade_id}`, () =>
        api.forceExit(trade.trade_id, { ordertype: 'market', amount }),
        {
          confirm: {
            title: `强制平仓 ${trade.pair} #${trade.trade_id}`,
            message: '将以市价立即平掉该持仓，忽略策略的止盈止损规则。',
            confirmLabel: '市价平仓',
            danger: true,
          },
        },
      ),

    forceExitAll: (trades) =>
      run('exit-all', '全部平仓', async () => {
        const results = await Promise.allSettled(
          trades.map((trade) => api.forceExit(trade.trade_id, { ordertype: 'market' })),
        )
        const failed = results.filter((r) => r.status === 'rejected').length
        if (failed) throw new Error(`${failed} 个持仓平仓失败`)
        return `已平掉 ${trades.length} 个持仓`
      }, {
        confirm: {
          title: '全部强制平仓',
          message: `将市价平掉当前全部 ${trades.length} 个持仓，忽略策略规则。`,
          confirmLabel: '全部平仓',
          danger: true,
        },
      }),

    forceEnter: (payload) =>
      run('forceenter', `强制开仓 ${payload.pair}`, () => api.forceEnter(payload)),

    cancelOrder: (trade) =>
      run(`cancel-${trade.trade_id}`, `取消挂单 #${trade.trade_id}`, () =>
        api.cancelOpenOrder(trade.trade_id),
        {
          confirm: {
            title: '取消挂单',
            message: `取消 #${trade.trade_id} ${trade.pair} 的未成交订单？`,
            confirmLabel: '取消挂单',
          },
        },
      ),

    reloadTrade: (trade) =>
      run(`reload-${trade.trade_id}`, `同步持仓 #${trade.trade_id}`, () =>
        api.reloadTrade(trade.trade_id),
        {
          confirm: {
            title: '从交易所同步',
            message: `重新从交易所读取 #${trade.trade_id} 的状态。仅实盘有效。`,
            confirmLabel: '同步',
          },
        },
      ),

    deleteTrade: (trade) =>
      run(`delete-${trade.trade_id}`, `删除交易 #${trade.trade_id}`, () =>
        api.deleteTrade(trade.trade_id),
        {
          confirm: {
            title: '从数据库删除交易',
            message: `删除 #${trade.trade_id}。这不会在交易所平仓，需要你自己手动处理该资产。`,
            confirmLabel: '删除',
            danger: true,
          },
        },
      ),

    addLock: (payload) => run('lock-add', `锁定 ${payload.pair}`, () => api.addLock(payload)),
    deleteLock: (lock) =>
      run(`lock-del-${lock.id}`, `解锁 ${lock.pair}`, () => api.deleteLock(lock.id), {
        confirm: {
          title: '解除锁定',
          message: `解除 ${lock.pair} 的交易锁？`,
          confirmLabel: '解锁',
        },
      }),

    addBlacklist: (pairs) =>
      run('blacklist-add', `加入黑名单 ${[].concat(pairs).join(', ')}`, () =>
        api.addBlacklist(pairs),
      ),
    removeBlacklist: (pairs) =>
      run('blacklist-del', `移除黑名单 ${[].concat(pairs).join(', ')}`, () =>
        api.deleteBlacklist(pairs),
      ),
  }
}

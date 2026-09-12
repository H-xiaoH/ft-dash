<script setup>
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useBotStore } from '@/stores/bot'
import { useBotActions } from '@/composables/useBotActions'
import { useUiStore } from '@/stores/ui'
import { fmtDate, fmtPercentRatio, fmtSigned, profitClass } from '@/utils/format'
import EmptyState from '@/components/EmptyState.vue'
import Icon from '@/components/Icon.vue'

const bot = useBotStore()
const actions = useBotActions()
const ui = useUiStore()
const { performanceRows } = storeToRefs(bot)

const search = ref('')
const newBlacklist = ref('')
const lockForm = ref({ pair: '', until: '', side: 'long', reason: '手动锁定' })

/** The whitelist and the blacklist are both narrowed by the same search box. */
function keep(list) {
  const needle = search.value.trim().toUpperCase()
  return needle ? list.filter((pair) => pair.includes(needle)) : list
}

const whitelist = computed(() => keep(bot.data.whitelist?.whitelist || []))
const blacklist = computed(() => keep(bot.data.blacklist?.blacklist || []))

const locks = computed(() => bot.data.locks || [])
const activeLocks = computed(() => locks.value.filter((lock) => lock.active !== false))

function performanceFor(pair) {
  return performanceRows.value.find((row) => row.pair === pair)
}

async function addBlacklist() {
  const value = newBlacklist.value.trim().toUpperCase()
  if (!value) return
  const ok = await actions.addBlacklist(value)
  if (ok) newBlacklist.value = ''
}

async function addLock() {
  const pair = lockForm.value.pair.trim().toUpperCase()
  if (!pair || !lockForm.value.until) {
    ui.warn('请填写交易对和锁定截止时间')
    return
  }
  const until = new Date(lockForm.value.until)
  if (Number.isNaN(until.getTime())) {
    ui.warn('截止时间格式不正确')
    return
  }
  const ok = await actions.addLock({
    pair,
    until: until.toISOString(),
    side: lockForm.value.side,
    reason: lockForm.value.reason,
  })
  if (ok) lockForm.value = { ...lockForm.value, pair: '', until: '' }
}

// `datetime-local` expects local wall-clock time, so shift the offset out of the
// ISO string instead of padding the fields by hand.
const defaultUntil = new Date(Date.now() + 6 * 3600 * 1000)
lockForm.value.until = new Date(
  defaultUntil.getTime() - defaultUntil.getTimezoneOffset() * 60_000,
)
  .toISOString()
  .slice(0, 16)
</script>

<template>
  <div class="page-head">
    <div>
      <h2 class="page-title">市场</h2>
      <p class="page-sub">
        白名单 {{ bot.data.whitelist?.length ?? whitelist.length }} 个交易对 ·
        黑名单 {{ bot.data.blacklist?.length ?? blacklist.length }} 个 ·
        锁定 {{ activeLocks.length }} 个
      </p>
    </div>
    <div class="row" style="gap: 8px">
      <button class="btn btn--sm" @click="bot.loadMany(['whitelist', 'blacklist', 'locks'])">
        <Icon name="refresh" :size="14" />
        刷新
      </button>
    </div>
  </div>

  <div class="input-group" style="max-width: 320px">
    <span class="input-icon"><Icon name="search" :size="15" /></span>
    <input v-model="search" class="input" placeholder="搜索交易对" />
  </div>

  <div class="grid grid-2">
    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title"><Icon name="list" :size="16" /> 白名单</div>
          <div class="card-sub">
            来源：{{ (bot.data.whitelist?.method || []).join(', ') || '—' }}
          </div>
        </div>
        <span class="badge badge--accent">{{ whitelist.length }}</span>
      </div>
      <div class="card-body card-body--flush">
        <EmptyState v-if="!whitelist.length" icon="list" title="白名单为空" />
        <div v-else class="table-wrap">
          <table class="table table--compact">
            <thead>
              <tr>
                <th>交易对</th>
                <th class="num">历史盈亏</th>
                <th class="num hide-xs">比例</th>
                <th class="right">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="pair in whitelist" :key="pair">
                <td class="strong">{{ pair }}</td>
                <td class="num" :class="profitClass(performanceFor(pair)?.abs)">
                  {{ performanceFor(pair) ? fmtSigned(performanceFor(pair).abs, 4) : '—' }}
                </td>
                <td class="num hide-xs faint">
                  {{ fmtPercentRatio(performanceFor(pair)?.ratio) }}
                </td>
                <td class="right">
                  <button
                    class="btn btn--xs"
                    :disabled="!!actions.busy.value"
                    title="加入黑名单"
                    @click="actions.addBlacklist(pair)"
                  >
                    <Icon name="plus" :size="12" />
                    黑名单
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-title"><Icon name="shield" :size="16" /> 黑名单</div>
        <span class="badge">{{ blacklist.length }}</span>
      </div>

      <div class="card-body">
        <div class="row" style="gap: 8px">
          <input
            v-model="newBlacklist"
            class="input"
            placeholder="例如 BTC/USDT"
            @keyup.enter="addBlacklist"
          />
          <button class="btn btn--primary" :disabled="!newBlacklist.trim()" @click="addBlacklist">
            <Icon name="plus" :size="15" />
            添加
          </button>
        </div>
      </div>

      <div class="card-body card-body--flush" style="border-top: 1px solid var(--border)">
        <EmptyState v-if="!blacklist.length" icon="shield" title="黑名单为空" />
        <div v-else class="table-wrap">
          <table class="table table--compact">
            <tbody>
              <tr v-for="pair in blacklist" :key="pair">
                <td class="strong">{{ pair }}</td>
                <td class="right">
                  <button
                    class="btn btn--xs btn--danger"
                    :disabled="!!actions.busy.value"
                    @click="actions.removeBlacklist(pair)"
                  >
                    <Icon name="trash" :size="12" />
                    移除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <div>
        <div class="card-title"><Icon name="lock" :size="16" /> 交易锁</div>
        <div class="card-sub">锁定期间机器人不会交易该交易对</div>
      </div>
      <span class="badge badge--warn">{{ activeLocks.length }} 个生效</span>
    </div>

    <div class="card-body">
      <div class="grid grid-4" style="gap: 10px">
        <div class="field">
          <label class="field-label">交易对</label>
          <input v-model="lockForm.pair" class="input" placeholder="BTC/USDT" />
        </div>
        <div class="field">
          <label class="field-label">锁定至</label>
          <input v-model="lockForm.until" class="input" type="datetime-local" />
        </div>
        <div class="field">
          <label class="field-label">方向</label>
          <select v-model="lockForm.side" class="select">
            <option value="long">做多</option>
            <option value="short">做空</option>
            <option value="*">全部</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label">原因</label>
          <div class="row" style="gap: 8px">
            <input v-model="lockForm.reason" class="input" placeholder="原因" />
            <button class="btn btn--primary" :disabled="!!actions.busy.value" @click="addLock">
              <Icon name="lock" :size="15" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="card-body card-body--flush" style="border-top: 1px solid var(--border)">
      <EmptyState v-if="!locks.length" icon="lock" title="没有交易锁" />
      <div v-else class="table-wrap">
        <table class="table table--compact">
          <thead>
            <tr>
              <th>交易对</th>
              <th>方向</th>
              <th>锁定至</th>
              <th class="hide-xs">原因</th>
              <th class="right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="lock in locks" :key="lock.id">
              <td class="strong">{{ lock.pair }}</td>
              <td>
                <span class="badge tiny">{{ lock.side || 'long' }}</span>
              </td>
              <td class="mono small">{{ fmtDate(lock.lock_end_time || lock.lock_end_timestamp) }}</td>
              <td class="hide-xs muted small truncate" style="max-width: 200px">
                {{ lock.reason || '—' }}
              </td>
              <td class="right">
                <button
                  class="btn btn--xs btn--danger"
                  :disabled="!!actions.busy.value"
                  @click="actions.deleteLock(lock)"
                >
                  <Icon name="trash" :size="12" />
                  解锁
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

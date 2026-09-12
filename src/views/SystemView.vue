<script setup>
import { computed, ref } from 'vue'
import { api } from '@/api/endpoints'
import { useBotStore } from '@/stores/bot'
import { fmtDate, fmtNumber, firstNumber } from '@/utils/format'
import BarChart from '@/components/charts/BarChart.vue'
import EmptyState from '@/components/EmptyState.vue'
import Icon from '@/components/Icon.vue'
import StatTile from '@/components/StatTile.vue'

const bot = useBotStore()
const strategyView = ref(null)
const strategyContent = ref('')
const strategyLoading = ref(false)

const sysinfo = computed(() => bot.data.sysinfo || {})
const health = computed(() => bot.data.health || {})
const version = computed(() => bot.data.version || {})
const config = computed(() => bot.data.config || {})

/** `cpu_pct` is one entry per core, not a time series. */
const cpuCores = computed(() => {
  const list = sysinfo.value.cpu_pct
  if (Array.isArray(list)) return list.map(Number)
  if (typeof list === 'number') return [list]
  return []
})

const cpuAvg = computed(() =>
  firstNumber(
    sysinfo.value.cpu_avg,
    cpuCores.value.length
      ? cpuCores.value.reduce((sum, value) => sum + (Number(value) || 0), 0) / cpuCores.value.length
      : null,
  ),
)

const coreBars = computed(() =>
  cpuCores.value.map((value, index) => ({ label: `C${index}`, value })),
)

const loadAvg = computed(() => sysinfo.value.cpu_load_avg || null)

const loadAvgText = computed(() => {
  const value = loadAvg.value
  if (!value) return '—'
  if (typeof value === 'object') {
    return ['1m', '5m', '15m'].map((key) => fmtNumber(value[key], 2)).join(' / ')
  }
  return fmtNumber(value, 2)
})

const ramUsed = computed(() => firstNumber(sysinfo.value.ram_used, null))
const ramTotal = computed(() => firstNumber(sysinfo.value.ram_total, null))

const strategyNames = computed(() => {
  const raw = bot.data.strategies
  if (!raw || typeof raw !== 'object') return []
  return Object.keys(raw)
})

const configRows = computed(() => flatten(bot.data.config))

function flatten(object, prefix = '') {
  const rows = []
  for (const [key, value] of Object.entries(object || {})) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      rows.push(...flatten(value, path))
    } else if (Array.isArray(value)) {
      rows.push({ key: path, value: value.map((item) => (typeof item === 'object' ? JSON.stringify(item) : item)).join(', ') })
    } else {
      rows.push({ key: path, value: value === null || value === undefined ? '—' : String(value) })
    }
  }
  return rows.sort((a, b) => a.key.localeCompare(b.key))
}

function bytes(value) {
  const n = firstNumber(value, null)
  if (n === null) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let index = 0
  let size = n
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  return `${size.toFixed(1)} ${units[index]}`
}

async function openStrategy(name) {
  strategyView.value = name
  strategyContent.value = ''
  strategyLoading.value = true
  try {
    const raw = bot.data.strategies?.[name]
    if (typeof raw === 'string') {
      strategyContent.value = raw
    } else {
      const result = await api.strategy(name)
      strategyContent.value =
        typeof result === 'string' ? result : JSON.stringify(result, null, 2)
    }
  } catch (error) {
    strategyContent.value = `加载失败：${error?.message || '未知错误'}`
  } finally {
    strategyLoading.value = false
  }
}

</script>

<template>
  <div class="page-head">
    <div>
      <h2 class="page-title">系统</h2>
      <p class="page-sub">
        {{ bot.data.config?.exchange || '—' }} · {{ bot.runmode }} ·
        freqtrade {{ version.version || '—' }}
      </p>
    </div>
    <button
      class="btn btn--sm"
      @click="bot.loadMany(['sysinfo', 'health', 'version', 'config', 'strategies'])"
    >
      <Icon name="refresh" :size="14" />
      刷新
    </button>
  </div>

  <div class="grid grid-4">
    <StatTile
      label="CPU 平均占用"
      icon="activity"
      :tone="cpuAvg >= 85 ? 'loss' : 'neutral'"
      :value="cpuAvg === null ? '—' : `${fmtNumber(cpuAvg, 1)}%`"
      :sub="`${sysinfo.cpu_count ?? '—'} 核心`"
    />
    <StatTile
      label="内存占用"
      icon="database"
      :tone="sysinfo.ram_pct >= 90 ? 'loss' : 'neutral'"
      :value="sysinfo.ram_pct === undefined ? '—' : `${fmtNumber(sysinfo.ram_pct, 1)}%`"
      :sub="ramUsed !== null ? `${bytes(ramUsed)} / ${bytes(ramTotal)}` : ''"
    />
    <StatTile
      label="系统负载 (1/5/15m)"
      icon="gauge"
      :value="loadAvgText"
      :sub="health.last_process ? '机器人主循环' : ''"
    />
    <StatTile
      label="最后心跳"
      icon="clock"
      :value="fmtDate(health.last_process)"
      :sub="health.bot_startup ? `最近重启 ${fmtDate(health.bot_startup)}` : ''"
    />
  </div>

  <div class="grid grid-2">
    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title"><Icon name="activity" :size="16" /> 各核心占用</div>
          <div class="card-sub">当前瞬时值 · 共 {{ cpuCores.length }} 个核心</div>
        </div>
      </div>
      <div class="card-body">
        <BarChart
          :items="coreBars"
          :height="180"
          :max="100"
          :format="(v) => `${fmtNumber(v, 1)}%`"
        />
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-title"><Icon name="info" :size="16" /> 版本与运行模式</div>
      </div>
      <div class="card-body col" style="gap: 2px">
        <div
          v-for="item in [
            { label: 'Freqtrade 版本', value: version.version || '—' },
            { label: 'API 版本', value: config.api_version ?? version.api_version ?? '—' },
            { label: '策略版本', value: config.strategy_version || '—' },
            { label: '运行模式', value: `${config.runmode || '—'}${config.dry_run ? ' · Dry-run' : ' · 实盘'}` },
            { label: '交易模式', value: `${config.trading_mode || '—'}${config.margin_mode ? ` · ${config.margin_mode}` : ''}` },
            { label: '允许做空', value: config.short_allowed ? '是' : '否' },
            { label: '机器人启动', value: fmtDate(health.bot_start || health.bot_startup) },
          ]"
          :key="item.label"
          class="row-between"
          style="padding: 9px 0; border-bottom: 1px solid var(--border)"
        >
          <span class="small muted">{{ item.label }}</span>
          <span class="small mono">{{ item.value }}</span>
        </div>

        <pre
          class="mono tiny"
          style="
            margin-top: 12px;
            padding: 12px;
            background: var(--surface-2);
            border-radius: 10px;
            overflow: auto;
            max-height: 160px;
            color: var(--text-dim);
          "
        >{{ JSON.stringify({ health, sysinfo }, null, 2) }}</pre>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <div>
        <div class="card-title"><Icon name="settings" :size="16" /> 运行配置</div>
        <div class="card-sub">来自 /show_config（敏感字段不会返回）</div>
      </div>
      <span class="badge">{{ configRows.length }} 项</span>
    </div>
    <div class="card-body card-body--flush">
      <EmptyState v-if="!configRows.length" icon="settings" title="暂无配置数据" />
      <div v-else class="table-wrap">
        <table class="table table--compact">
          <tbody>
            <tr v-for="row in configRows" :key="row.key">
              <td class="muted small" style="width: 40%">{{ row.key }}</td>
              <td class="mono small" style="word-break: break-all">{{ row.value }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <div>
        <div class="card-title"><Icon name="layers" :size="16" /> 策略</div>
        <div class="card-sub">点击查看策略源码</div>
      </div>
      <span class="badge">{{ strategyNames.length }}</span>
    </div>
    <div class="card-body">
      <div v-if="bot.errors.strategies" class="form-error" style="margin-bottom: 12px">
        <Icon name="alert" :size="15" style="flex: none" />
        <span>
          {{ bot.errors.strategies }} —— 该接口仅在机器人处于特定状态时可用（运行中会返回 503）。
        </span>
      </div>
      <EmptyState v-if="!strategyNames.length" icon="layers" title="没有可用策略" />
      <div v-else class="row wrap" style="gap: 8px">
        <button
          v-for="name in strategyNames"
          :key="name"
          class="pill"
          @click="openStrategy(name)"
        >
          <Icon name="list" :size="13" />
          {{ name }}
        </button>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <Transition name="fade">
      <div v-if="strategyView" class="modal-backdrop" @click.self="strategyView = null">
        <div class="modal modal--wide">
          <div class="modal-head">
            <span class="modal-title mono">{{ strategyView }}</span>
            <button class="icon-btn" @click="strategyView = null">
              <Icon name="close" :size="18" />
            </button>
          </div>
          <div class="modal-body">
            <div v-if="strategyLoading" class="row" style="gap: 10px">
              <span class="spinner-lg" />
              <span class="muted small">加载中…</span>
            </div>
            <pre
              v-else
              class="mono tiny"
              style="
                white-space: pre-wrap;
                word-break: break-word;
                background: var(--surface-2);
                padding: 14px;
                border-radius: 12px;
                max-height: 60vh;
                overflow: auto;
                color: var(--text-dim);
              "
            >{{ strategyContent }}</pre>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 180ms var(--ease);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

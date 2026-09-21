<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/useFormat'
import { useBotStore } from '@/stores/bot'
import { useEventsStore } from '@/stores/events'
import AppIcon from './AppIcon.vue'

const { t } = useI18n()
const format = useFormat()
const bot = useBotStore()
const events = useEventsStore()
const emit = defineEmits<{ refresh: []; openTape: [] }>()

const stateKey = computed(() => {
  if (bot.connection === 'connecting') return 'status.starting'
  if (bot.connection === 'unauthorized') return 'errors.auth'
  if (bot.connection === 'unreachable') return 'errors.cors'
  const state = bot.showConfig?.state
  if (state === 'running') return 'status.running'
  if (state === 'paused') return 'status.paused'
  if (state === 'stopped') return 'status.stopped'
  return bot.connection === 'online' ? 'status.running' : 'status.unknown'
})

const stateTone = computed(() => {
  if (bot.connection !== 'online') return 'bad'
  const state = bot.showConfig?.state
  if (state === 'paused') return 'warn'
  if (state === 'stopped') return 'bad'
  return 'good'
})

const equity = computed(() => bot.balance)
const totalPnl = computed(() => bot.profit?.profit_all_coin ?? null)
const totalPnlRatio = computed(() => bot.profit?.profit_all_ratio ?? null)
const openCount = computed(() => bot.count?.current ?? bot.openTrades.length)
const maxOpen = computed(() => bot.count?.max ?? bot.showConfig?.max_open_trades ?? 0)
const heartbeat = computed(() => {
  const age = bot.heartbeatAgeMs
  if (age === null) return '—'
  return format.duration(Math.max(0, age))
})
const heartbeatStale = computed(() => (bot.heartbeatAgeMs ?? 0) > 5 * 60 * 1000)

const streamLabel = computed(() => {
  switch (events.status) {
    case 'open':
      return t('system.wsConnected')
    case 'connecting':
      return t('system.wsConnecting')
    case 'error':
      return t('system.wsDisconnected')
    case 'closed':
      return t('system.wsDisconnected')
    default:
      return t('system.wsDisabled')
  }
})

/** The reason key wins in the tooltip so a rejected handshake is self-explaining. */
const streamTooltip = computed(() =>
  bot.streamReasonKey ? t(bot.streamReasonKey) : streamLabel.value,
)

const streamTone = computed<'good' | 'warn' | 'bad' | 'flat'>(() => {
  if (bot.streamReasonKey) return 'bad'
  switch (events.status) {
    case 'open':
      return 'good'
    case 'connecting':
      return 'warn'
    case 'error':
      return 'bad'
    default:
      return 'flat'
  }
})

function onStreamClick() {
  if (bot.streamReasonKey) {
    bot.retryStream()
    return
  }
  emit('openTape')
}
</script>

<template>
  <header class="strip">
    <div class="strip__state" :data-tone="stateTone">
      <span :key="bot.lastFetchAt ?? 0" class="strip__pulse" :data-tone="stateTone" />
      <span class="strip__state-label">{{ t(stateKey) }}</span>
      <span v-if="bot.isLiveAccount" class="chip chip--bad">{{ t('connect.liveTrading') }}</span>
      <span v-else-if="bot.showConfig" class="chip">{{ t('connect.dryRun') }}</span>
    </div>

    <div class="strip__metrics">
      <div class="strip__metric">
        <span class="strip__metric-label">{{ t('kpi.equity') }}</span>
        <span class="num strip__metric-value">
          {{ format.money(equity?.total ?? null, equity?.stake ?? bot.stakeCurrency) }}
          <small :class="format.toneClass(totalPnlRatio)">
            {{ format.ratio(totalPnlRatio) }}
          </small>
        </span>
      </div>
      <div class="strip__metric">
        <span class="strip__metric-label">{{ t('kpi.totalPnl') }}</span>
        <span class="num strip__metric-value" :class="format.toneClass(totalPnl)">
          {{ format.signedMoney(totalPnl, bot.stakeCurrency) }}
          <small v-if="totalPnlRatio !== null">{{ format.ratio(totalPnlRatio) }}</small>
        </span>
      </div>
      <div class="strip__metric">
        <span class="strip__metric-label">{{ t('kpi.openTrades') }}</span>
        <span class="num strip__metric-value">{{ openCount }}<small>/{{ maxOpen }}</small></span>
      </div>
      <div class="strip__metric" :class="{ 'strip__metric--warn': heartbeatStale }">
        <span class="strip__metric-label">{{ t('dashboard.heartbeat') }}</span>
        <span class="num strip__metric-value">{{ heartbeat }}</span>
      </div>
    </div>

    <div class="strip__actions">
      <button
        type="button"
        class="strip__stream"
        :data-tone="streamTone"
        :title="streamTooltip"
        @click="onStreamClick"
      >
        <span
          class="dot"
          :class="[`dot--${streamTone}`, { 'dot--pulse': streamTone === 'good' }]"
        />
        <span class="strip__stream-text">{{ streamLabel }}</span>
      </button>
      <span v-if="bot.latencyMs !== null" class="strip__latency num muted small">
        {{ bot.latencyMs }}ms
      </span>
      <button
        type="button"
        class="btn btn--icon btn--ghost"
        :disabled="bot.refreshing"
        :title="t('common.refresh')"
        @click="emit('refresh')"
      >
        <AppIcon name="refresh" :class="{ 'is-spinning': bot.refreshing }" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.strip {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  padding: 0 var(--sp-4);
  min-height: var(--topbar-h);
  background: var(--ink-850);
  border-bottom: 1px solid var(--line);
  position: sticky;
  top: 0;
  z-index: 20;
  padding-top: env(safe-area-inset-top, 0px);
}

.strip__state {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex: none;
}

.strip__state-label {
  font-weight: 500;
  white-space: nowrap;
}

.strip__pulse {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--text-3);
  animation: beat 900ms ease-out;
  flex: none;
}

.strip__pulse[data-tone='good'] {
  background: var(--long);
}

.strip__pulse[data-tone='warn'] {
  background: var(--warn);
}

.strip__pulse[data-tone='bad'] {
  background: var(--short);
}

@keyframes beat {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 color-mix(in srgb, currentColor 70%, transparent);
  }
  40% {
    transform: scale(1.35);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 9px transparent;
  }
}

.strip__metrics {
  display: flex;
  align-items: center;
  gap: var(--sp-5);
  overflow-x: auto;
  flex: 1;
  min-width: 0;
  scrollbar-width: none;
}

.strip__metrics::-webkit-scrollbar {
  display: none;
}

.strip__metric {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: none;
}

.strip__metric-label {
  font-size: var(--fs-xs);
  color: var(--text-3);
}

.strip__metric-value {
  font-size: var(--fs-md);
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.strip__metric-value small {
  font-size: var(--fs-sm);
  color: var(--text-3);
}

/* The P&L suffix only appears on mobile, where the dedicated metric is hidden. */
.strip__metric-value small {
  display: none;
}

.strip__metric--warn .strip__metric-value {
  color: var(--warn);
}

.strip__actions {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex: none;
  margin-left: auto;
}

.strip__stream {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--r-1);
  padding: 5px 8px;
  cursor: pointer;
  color: var(--text-2);
  font-size: var(--fs-sm);
}

.strip__stream:hover {
  border-color: var(--line-strong);
  color: var(--text);
}

.strip__stream[data-tone='good'] .dot {
  color: var(--long);
}

.strip__stream[data-tone='warn'] .dot {
  color: var(--warn);
}

.strip__stream[data-tone='bad'] .dot {
  color: var(--short);
}

.is-spinning {
  animation: spin 900ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 900px) {
  .strip {
    gap: var(--sp-3);
    padding: 0 var(--sp-3);
  }

  /* One dense metric keeps the mobile bar readable; everything else lives in the views. */
  .strip__metric:nth-child(n + 2) {
    display: none;
  }

  .strip__metric-value small {
    display: inline;
  }

  .strip__stream-text,
  .strip__latency {
    display: none;
  }
}
</style>

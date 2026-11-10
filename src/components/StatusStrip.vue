<script setup lang="ts">
import { useMediaQuery, useResizeObserver } from '@vueuse/core'
import { computed, ref, watchPostEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { WIDE_LAYOUT_QUERY } from '@/lib/layout'
import { useFormat } from '@/composables/useFormat'
import { HEARTBEAT_STALE_MS, useBotStore } from '@/stores/bot'
import { useSettingsStore } from '@/stores/settings'
import AppIcon from './AppIcon.vue'
import TopbarBotPicker from './TopbarBotPicker.vue'

const { t } = useI18n()
const format = useFormat()
const bot = useBotStore()
const settings = useSettingsStore()
const emit = defineEmits<{ refresh: [] }>()

const metrics = ref<HTMLElement | null>(null)
const metricRow = ref<HTMLElement | null>(null)
const picker = ref<HTMLElement | null>(null)
const latency = ref<HTMLElement | null>(null)
const hideLatency = ref(false)
const hidePicker = ref(true)

const wide = useMediaQuery(WIDE_LAYOUT_QUERY)
function updateActions() {
  const area = metrics.value
  const row = metricRow.value
  const label = latency.value
  const selector = picker.value
  const actions = label?.parentElement ?? selector?.parentElement
  if (!area || !row || !actions) return
  const gap = parseFloat(getComputedStyle(actions).columnGap) || 0
  const latencyWidth = label ? label.getBoundingClientRect().width + gap : 0
  const pickerWidth = selector ? selector.getBoundingClientRect().width + gap : 0
  const available =
    area.getBoundingClientRect().width +
    (hideLatency.value ? 0 : latencyWidth) +
    (hidePicker.value ? 0 : pickerWidth)
  const metricsWidth = row.getBoundingClientRect().width
  const showLatency = wide.value || available >= metricsWidth + latencyWidth
  hideLatency.value = !showLatency
  hidePicker.value =
    !selector || available < metricsWidth + (showLatency ? latencyWidth : 0) + pickerWidth
}
useResizeObserver([metrics, metricRow, latency, picker], updateActions)
watchPostEffect(updateActions)

const status = computed(() => {
  // A cached backend state cannot override the current connection state.
  switch (bot.connection) {
    case 'connecting':
      return { key: 'status.connecting', tone: 'warn' }
    case 'unreachable':
      return { key: 'status.unreachable', tone: 'bad' }
    case 'unauthorized':
      return { key: 'status.unauthorized', tone: 'bad' }
    case 'idle':
      return { key: 'status.idle', tone: 'muted' }
  }
  switch (bot.showConfig?.state) {
    case 'running':
      return { key: 'status.running', tone: 'good' }
    case 'paused':
      return { key: 'status.paused', tone: 'warn' }
    case 'stopped':
      return { key: 'status.stopped', tone: 'bad' }
    default:
      return { key: 'status.unknown', tone: 'muted' }
  }
})

const statusColors: Record<string, string> = {
  good: 'success',
  warn: 'warning',
  bad: 'error',
  muted: 'secondary',
}

const equity = computed(() => bot.balance)
const totalPnl = computed(() => bot.profit?.profit_all_coin ?? null)
const totalPnlRatio = computed(() => bot.profit?.profit_all_ratio ?? null)
const openCount = computed(() => bot.count?.current ?? bot.openTrades.length)
const maxOpen = computed(() => bot.count?.max ?? bot.showConfig?.max_open_trades ?? 0)
const heartbeatTimestamp = computed(
  () => bot.health?.last_process_ts ?? bot.health?.last_process ?? null,
)

const heartbeat = computed(() => {
  const age = bot.heartbeatAgeMs
  if (age === null) return '—'
  return format.duration(Math.max(0, age))
})
const heartbeatStale = computed(() => (bot.heartbeatAgeMs ?? 0) > HEARTBEAT_STALE_MS)
</script>

<template>
  <VToolbar class="strip" :height="56" color="surface">
    <div class="strip__state" :data-tone="status.tone">
      <VBadge
        :key="`${status.key}-${status.tone}-${bot.connection}-${heartbeatTimestamp}`"
        dot
        inline
        :color="statusColors[status.tone]"
        :style="{ color: `rgb(var(--v-theme-${statusColors[status.tone]}))` }"
        class="strip__pulse"
        :data-tone="status.tone"
      />
      <span class="strip__state-label">{{ t(status.key) }}</span>
      <VChip v-if="bot.isLiveAccount" size="x-small" variant="tonal" color="error">{{
        t('connect.liveTrading')
      }}</VChip>
      <VChip v-else-if="bot.showConfig?.dry_run === true" size="x-small" variant="tonal">{{
        t('connect.dryRun')
      }}</VChip>
    </div>

    <div ref="metrics" class="strip__metrics" tabindex="0">
      <div ref="metricRow" class="strip__metric-row">
        <div class="strip__metric">
          <span class="strip__metric-label">{{ t('kpi.equity') }}</span>
          <span class="num strip__metric-value">
            {{
              format.money(
                equity?.total_bot ?? equity?.total ?? null,
                equity?.stake ?? bot.stakeCurrency,
              )
            }}
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
          <span class="num strip__metric-value"
            >{{ openCount }}<small>/{{ maxOpen }}</small></span
          >
        </div>
        <div
          class="strip__metric"
          :class="{ 'strip__metric--warn': heartbeatStale || bot.healthRequestFailed }"
          :title="bot.healthRequestFailed ? t('system.heartbeatRequestFailed') : undefined"
        >
          <span class="strip__metric-label">{{ t('dashboard.heartbeat') }}</span>
          <span class="num strip__metric-value">{{ heartbeat }}</span>
        </div>
      </div>
    </div>

    <div class="strip__actions">
      <div
        v-if="settings.bots.length > 1"
        ref="picker"
        class="strip__picker"
        :class="{ 'strip__picker--hidden': hidePicker }"
      >
        <TopbarBotPicker
          :hidden="hidePicker"
          @focus-fallback="metrics?.focus({ preventScroll: true })"
        />
      </div>
      <span
        v-if="bot.latencyMs !== null"
        ref="latency"
        class="strip__latency num muted small"
        :class="{ 'strip__latency--hidden': hideLatency }"
      >
        {{ bot.latencyMs }}ms
      </span>
      <VBtn
        variant="text"
        :icon="true"
        type="button"
        :disabled="bot.refreshing"
        :title="t('common.refresh')"
        :aria-label="t('common.refresh')"
        @click="emit('refresh')"
      >
        <AppIcon name="refresh" :class="{ 'is-spinning': bot.refreshing }" />
      </VBtn>
    </div>
  </VToolbar>
</template>

<style scoped>
.strip {
  padding: 0 var(--sp-4);

  background: var(--ink-850);
  border-bottom: 1px solid var(--line);
  position: sticky;
  top: 0;
  z-index: 20;
  padding-top: env(safe-area-inset-top, 0px);
  height: calc(var(--topbar-h) + env(safe-area-inset-top, 0px)) !important;
}

.strip :deep(.v-toolbar__content) {
  gap: var(--sp-4);
  overflow: visible;
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
  flex: none;
}
.strip__pulse :deep(.v-badge__badge) {
  animation: beat 900ms ease-out;
  color: inherit !important;
}

@keyframes beat {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 currentColor;
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
  overflow-x: auto;
  flex: 1;
  min-width: 0;
  scrollbar-width: none;
}

.strip__metric-row {
  display: flex;
  align-items: center;
  gap: var(--sp-5);
  width: max-content;
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

.strip__picker {
  width: max-content;
  flex: none;
}

.strip__picker--hidden {
  position: absolute;
  inset-inline-end: 0;
  visibility: hidden;
}

.strip__latency {
  white-space: nowrap;
}

.is-spinning {
  animation: spin 900ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media not all and (min-width: 720px) {
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

  .strip__latency--hidden {
    position: absolute;
    visibility: hidden;
  }
}
</style>

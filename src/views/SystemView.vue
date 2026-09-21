<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useFormat } from '@/composables/useFormat'
import { pushToast } from '@/composables/useToast'
import { useBotStore } from '@/stores/bot'
import { useEventsStore } from '@/stores/events'
import { useSettingsStore } from '@/stores/settings'

const { t } = useI18n()
const format = useFormat()
const bot = useBotStore()
const settings = useSettingsStore()
const events = useEventsStore()

const stopConfirm = ref(false)

function meterTone(value: number | null): string {
  if (value === null) return ''
  if (value >= 90) return 'meter__fill--bad'
  if (value >= 70) return 'meter__fill--warn'
  return 'meter__fill--good'
}

const heartbeatLate = computed(() => (bot.heartbeatAgeMs ?? 0) > 5 * 60 * 1000)
/** Process uptime; `bot_start` is the first ever start, which operators do not want here. */
const uptime = computed(() =>
  bot.health ? Date.now() - (format.timestamp(bot.health.bot_startup_ts) ?? Date.now()) : null,
)
const config = computed(() => bot.showConfig)

const wsLabel = computed(() => {
  switch (events.status) {
    case 'open':
      return t('system.wsConnected')
    case 'connecting':
      return t('system.wsConnecting')
    case 'error':
    case 'closed':
      return t('system.wsDisconnected')
    default:
      return t('system.wsDisabled')
  }
})

const wsAuthLabel = computed(() => {
  switch (bot.streamAuthMode) {
    case 'jwt':
      return t('system.wsAuthJwt')
    case 'ws_token':
      return t('system.wsAuthToken')
    case 'unavailable':
      return t('system.wsAuthUnavailable')
    default:
      return t('system.wsAuthOff')
  }
})

async function runStop() {
  const result = await bot.stop()
  stopConfirm.value = false
  pushToast(result ? t('actions.sent') : t('actions.failed'), result ? 'good' : 'bad')
}

async function runSimple(action: () => Promise<unknown>, label: string) {
  const result = await action()
  pushToast(result ? label : t('actions.failed'), result ? 'good' : 'bad')
}
</script>

<template>
  <div class="stack">
    <section v-if="heartbeatLate" class="banner banner--warn">
      <AppIcon name="alert" :size="18" />
      <div>{{ t('system.lagging') }}</div>
    </section>

    <div class="metric-grid">
      <div class="metric">
        <span class="metric__label">{{ t('system.cpu') }}</span>
        <span class="metric__value">{{ format.percent(bot.sysinfo?.cpu_avg ?? null, 1) }}</span>
        <div class="meter" style="margin-top: 6px">
          <div
            class="meter__fill"
            :class="meterTone(bot.sysinfo?.cpu_avg ?? null)"
            :style="{ width: `${bot.sysinfo?.cpu_avg ?? 0}%` }"
          />
        </div>
      </div>
      <div class="metric">
        <span class="metric__label">{{ t('system.ram') }}</span>
        <span class="metric__value">{{ format.percent(bot.sysinfo?.ram_pct ?? null, 1) }}</span>
        <div class="meter" style="margin-top: 6px">
          <div
            class="meter__fill"
            :class="meterTone(bot.sysinfo?.ram_pct ?? null)"
            :style="{ width: `${bot.sysinfo?.ram_pct ?? 0}%` }"
          />
        </div>
      </div>
      <div class="metric">
        <span class="metric__label">{{ t('system.loadAvg') }}</span>
        <span class="metric__value metric__value--sm">
          {{ format.number(bot.sysinfo?.cpu_load_avg?.['1m'] ?? null, 1) }} /
          {{ format.number(bot.sysinfo?.cpu_load_avg?.['5m'] ?? null, 1) }} /
          {{ format.number(bot.sysinfo?.cpu_load_avg?.['15m'] ?? null, 1) }}
        </span>
        <span class="metric__sub">{{ t('system.cores') }} {{ bot.sysinfo?.cpu_count ?? '—' }}</span>
      </div>
      <div class="metric">
        <span class="metric__label">{{ t('system.uptime') }}</span>
        <span class="metric__value metric__value--sm">{{ format.duration(uptime) }}</span>
        <span class="metric__sub">{{ format.dateTime(bot.health?.bot_startup ?? null) }}</span>
      </div>
      <div class="metric" :class="{ 'metric--warn': heartbeatLate }">
        <span class="metric__label">{{ t('system.heartbeatAge') }}</span>
        <span class="metric__value metric__value--sm">{{ format.duration(bot.heartbeatAgeMs) }}</span>
        <span class="metric__sub">{{ format.dateTime(bot.health?.last_process ?? null) }}</span>
      </div>
      <div class="metric">
        <span class="metric__label">{{ t('system.wsStatus') }}</span>
        <span class="metric__value metric__value--sm">{{ wsLabel }}</span>
        <span class="metric__sub">
          {{ t('system.polling') }} {{ settings.refreshInterval }}s ·
          {{ bot.latencyMs !== null ? `${bot.latencyMs}ms` : '—' }}
        </span>
      </div>
    </div>

    <div class="grid-2">
      <section class="panel">
        <div class="panel__head">
          <span class="panel__title">{{ t('system.config') }}</span>
        </div>
        <div class="panel__body">
          <dl class="dl">
            <dt>{{ t('system.version') }}</dt>
            <dd>{{ config?.version ?? '—' }}</dd>
            <dt>{{ t('system.apiVersion') }}</dt>
            <dd>{{ config?.api_version ?? '—' }}</dd>
            <dt>{{ t('system.strategy') }}</dt>
            <dd>{{ config?.strategy ?? '—' }}</dd>
            <dt>{{ t('system.exchange') }}</dt>
            <dd>{{ config?.exchange ?? '—' }}</dd>
            <dt>{{ t('system.timeframe') }}</dt>
            <dd>{{ config?.timeframe ?? '—' }}</dd>
            <dt>{{ t('system.tradingMode') }}</dt>
            <dd>{{ config?.trading_mode ?? '—' }}</dd>
            <dt>{{ t('system.marginMode') }}</dt>
            <dd>{{ config?.margin_mode ?? '—' }}</dd>
            <dt>{{ t('system.stakeCurrency') }}</dt>
            <dd>{{ config?.stake_currency ?? '—' }}</dd>
            <dt>{{ t('system.stakeAmount') }}</dt>
            <dd>
              {{
                typeof config?.stake_amount === 'number'
                  ? format.number(config.stake_amount, 2)
                  : (config?.stake_amount ?? '—')
              }}
            </dd>
            <dt>{{ t('system.maxOpenTrades') }}</dt>
            <dd>{{ config?.max_open_trades ?? '—' }}</dd>
            <dt>{{ t('system.stoploss') }}</dt>
            <dd>
              {{
                format.percent(
                  (config?.stoploss ?? null) === null ? null : (config?.stoploss ?? 0) * 100,
                )
              }}
            </dd>
            <dt>{{ t('system.trailingStop') }}</dt>
            <dd>{{ config?.trailing_stop ? t('common.on') : t('common.off') }}</dd>
            <dt>{{ t('system.shortAllowed') }}</dt>
            <dd>{{ config?.short_allowed ? t('common.on') : t('common.off') }}</dd>
            <dt>{{ t('system.forceEntryEnabled') }}</dt>
            <dd>{{ config?.force_entry_enable ? t('common.on') : t('common.off') }}</dd>
            <dt>{{ t('system.positionAdjustment') }}</dt>
            <dd>{{ config?.position_adjustment_enable ? t('common.on') : t('common.off') }}</dd>
          </dl>
        </div>
      </section>

      <section class="panel">
        <div class="panel__head">
          <span class="panel__title">{{ t('system.connection') }}</span>
          <div class="panel__actions">
            <button type="button" class="btn btn--sm" @click="bot.refreshAll()">
              <AppIcon name="refresh" />
              {{ t('common.refresh') }}
            </button>
          </div>
        </div>
        <div class="panel__body">
          <dl class="dl">
            <dt>{{ t('system.endpoint') }}</dt>
            <dd>{{ settings.baseUrl || '—' }}</dd>
            <dt>{{ t('system.latency') }}</dt>
            <dd>{{ bot.latencyMs !== null ? `${bot.latencyMs} ms` : '—' }}</dd>
            <dt>{{ t('system.lastFetch') }}</dt>
            <dd>{{ format.dateTime(bot.lastFetchAt) }}</dd>
            <dt>{{ t('system.wsStatus') }}</dt>
            <dd>{{ wsLabel }}</dd>
            <dt>{{ t('system.wsAuth') }}</dt>
            <dd>{{ wsAuthLabel }}</dd>
          </dl>

          <p
            v-if="bot.streamReasonKey"
            class="banner banner--warn small"
            style="margin-top: var(--sp-4)"
          >
            {{ t(bot.streamReasonKey) }}
            <button
              type="button"
              class="btn btn--sm"
              style="margin-left: 8px"
              @click="bot.retryStream()"
            >
              {{ t('settings.retryStream') }}
            </button>
          </p>

          <div v-if="settings.writesEnabled" class="row row--wrap" style="margin-top: var(--sp-4)">
            <button
              type="button"
              class="btn"
              :disabled="bot.actionPending !== null"
              @click="runSimple(() => bot.pauseEntries(), t('actions.pause'))"
            >
              <AppIcon name="pause" />
              {{ t('actions.pause') }}
            </button>
            <button
              type="button"
              class="btn"
              :disabled="bot.actionPending !== null"
              @click="runSimple(() => bot.start(), t('actions.resume'))"
            >
              <AppIcon name="check" />
              {{ t('actions.resume') }}
            </button>
            <button
              type="button"
              class="btn"
              :disabled="bot.actionPending !== null"
              @click="runSimple(() => bot.reloadConfig(), t('actions.reloadConfig'))"
            >
              <AppIcon name="refresh" />
              {{ t('actions.reloadConfig') }}
            </button>
            <button
              type="button"
              class="btn btn--danger"
              :disabled="bot.actionPending !== null"
              @click="stopConfirm = true"
            >
              <AppIcon name="power" />
              {{ t('actions.stop') }}
            </button>
          </div>
          <p v-else class="small muted" style="margin-top: var(--sp-4)">
            {{ t('actions.controlsDisabledHint') }}
          </p>
        </div>
      </section>
    </div>

    <section v-if="bot.sysinfo" class="panel">
      <div class="panel__head">
        <span class="panel__title">{{ t('system.cpu') }}</span>
        <span class="panel__meta num">{{ bot.sysinfo.cpu_count }} {{ t('system.cores') }}</span>
      </div>
      <div class="panel__body">
        <div class="cores">
          <div v-for="core in bot.sysinfo.cpu_load" :key="core.cpu" class="cores__item">
            <span class="small muted num">CPU {{ core.cpu }}</span>
            <div class="meter">
              <div
                class="meter__fill"
                :class="meterTone(core.pct)"
                :style="{ width: `${core.pct}%` }"
              />
            </div>
            <span class="small num">{{ format.percent(core.pct, 0) }}</span>
          </div>
        </div>
      </div>
    </section>

    <ConfirmDialog
      :open="stopConfirm"
      tone="danger"
      :title="t('actions.stop')"
      :body="t('actions.stopHint')"
      :confirm-label="t('actions.stop')"
      :pending="bot.actionPending === 'stop'"
      @cancel="stopConfirm = false"
      @confirm="runStop"
    />
  </div>
</template>

<style scoped>
.metric--warn .metric__value {
  color: var(--warn);
}

.cores {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--sp-3);
}

.cores__item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--sp-2);
  align-items: center;
}
</style>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import MetricTile from '@/components/MetricTile.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useFormat } from '@/composables/useFormat'
import { pushToast } from '@/composables/useToast'
import { HEARTBEAT_STALE_MS, useBotStore } from '@/stores/bot'
import { useSettingsStore } from '@/stores/settings'

const { t } = useI18n()
const format = useFormat()
const bot = useBotStore()
const settings = useSettingsStore()

const stopConfirm = ref(false)

function meterColor(value: number | null): string {
  if (value === null) return ''
  if (value >= 90) return 'error'
  if (value >= 70) return 'warning'
  return 'success'
}

// Same threshold that triggers the alert notification.
const heartbeatLate = computed(() => (bot.heartbeatAgeMs ?? 0) > HEARTBEAT_STALE_MS)
/** Process uptime; `bot_start` is the first ever start, which operators do not want here. */
const uptime = computed(() =>
  bot.health ? Date.now() - (format.timestamp(bot.health.bot_startup_ts) ?? Date.now()) : null,
)
/** 1 / 5 / 15 minute load averages, as the bot reports them. */
const loadAverage = computed(() => {
  const load = bot.sysinfo?.cpu_load_avg
  return [load?.['1m'], load?.['5m'], load?.['15m']]
    .map((value) => format.number(value ?? null, 1))
    .join(' / ')
})
const config = computed(() => bot.showConfig)

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
  <div class="d-flex flex-column ga-4">
    <VRow dense class="metric-grid">
      <VCol cols="6" sm="4" lg="2"
        ><MetricTile
          :label="t('system.cpu')"
          :value="bot.sysinfo?.cpu_avg ?? null"
          kind="percent"
          :digits="1"
        >
          <VProgressLinear
            :model-value="bot.sysinfo?.cpu_avg ?? 0"
            :color="meterColor(bot.sysinfo?.cpu_avg ?? null)"
            :height="6"
            rounded
            class="mt-2"
            :aria-label="t('system.cpu')"
          /> </MetricTile
      ></VCol>
      <VCol cols="6" sm="4" lg="2"
        ><MetricTile
          :label="t('system.ram')"
          :value="bot.sysinfo?.ram_pct ?? null"
          kind="percent"
          :digits="1"
        >
          <VProgressLinear
            :model-value="bot.sysinfo?.ram_pct ?? 0"
            :color="meterColor(bot.sysinfo?.ram_pct ?? null)"
            :height="6"
            rounded
            class="mt-2"
            :aria-label="t('system.ram')"
          /> </MetricTile
      ></VCol>
      <VCol cols="6" sm="4" lg="2"
        ><MetricTile
          :label="t('system.loadAvg')"
          :value="loadAverage"
          kind="text"
          small
          :sub="`${t('system.cores')} ${bot.sysinfo?.cpu_count ?? '—'}`"
      /></VCol>
      <VCol cols="6" sm="4" lg="2"
        ><MetricTile
          :label="t('system.uptime')"
          :value="format.duration(uptime)"
          kind="text"
          small
          :sub="format.dateTime(bot.health?.bot_startup ?? null)"
      /></VCol>
      <VCol cols="6" sm="4" lg="2"
        ><MetricTile
          :label="t('system.heartbeatAge')"
          :value="format.duration(bot.heartbeatAgeMs)"
          kind="text"
          small
          :class="{ 'metric--warn': heartbeatLate || bot.healthRequestFailed }"
          :sub="
            bot.healthRequestFailed
              ? t('system.heartbeatRequestFailed')
              : format.dateTime(bot.health?.last_process ?? null)
          "
      /></VCol>
      <VCol cols="6" sm="4" lg="2"
        ><MetricTile
          :label="t('system.latency')"
          :value="bot.latencyMs !== null ? `${bot.latencyMs} ms` : '—'"
          kind="text"
          small
          :sub="`${t('system.polling')} ${bot.pollIntervalSeconds}s`"
      /></VCol>
    </VRow>

    <VRow dense class="grid-2">
      <!-- Moved here from the overview; uptime itself is already in the tiles above. -->
      <VCol cols="12" md="6"
        ><VCard tag="section" class="panel">
          <VCardItem class="panel__head">
            <VCardTitle tag="span" class="panel__title">{{ t('system.health') }}</VCardTitle>
          </VCardItem>
          <VCardText class="panel__body">
            <dl class="dl">
              <dt>{{ t('system.botStartup') }}</dt>
              <dd>{{ format.dateTime(bot.health?.bot_startup ?? null) }}</dd>
              <dt>{{ t('system.lastProcess') }}</dt>
              <dd>{{ format.dateTime(bot.health?.last_process ?? null) }}</dd>
              <dt>{{ t('system.uptime') }}</dt>
              <dd>{{ format.duration(uptime) }}</dd>
            </dl>
          </VCardText>
        </VCard></VCol
      >

      <VCol cols="12" md="6"
        ><VCard tag="section" class="panel">
          <VCardItem class="panel__head">
            <VCardTitle tag="span" class="panel__title">{{ t('system.config') }}</VCardTitle>
          </VCardItem>
          <VCardText class="panel__body">
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
          </VCardText>
        </VCard></VCol
      >

      <VCol cols="12" md="6"
        ><VCard tag="section" class="panel">
          <VCardItem class="panel__head">
            <VCardTitle tag="span" class="panel__title">{{ t('system.connection') }}</VCardTitle>
          </VCardItem>
          <VCardText class="panel__body">
            <dl class="dl">
              <dt>{{ t('system.endpoint') }}</dt>
              <dd>{{ settings.baseUrl || '—' }}</dd>
              <dt>{{ t('system.latency') }}</dt>
              <dd>{{ bot.latencyMs !== null ? `${bot.latencyMs} ms` : '—' }}</dd>
              <dt>{{ t('system.lastFetch') }}</dt>
              <dd>{{ format.dateTime(bot.lastFetchAt) }}</dd>
            </dl>

            <div
              v-if="bot.writesAllowed || bot.canResume"
              class="d-flex align-center ga-2 flex-wrap"
              style="margin-top: var(--sp-4)"
            >
              <VBtn
                v-if="bot.writesAllowed"
                type="button"
                :disabled="bot.actionPending !== null"
                @click="runSimple(() => bot.pauseEntries(), t('actions.pause'))"
              >
                <AppIcon name="pause" />
                {{ t('actions.pause') }}
              </VBtn>
              <VBtn
                v-if="bot.canResume"
                type="button"
                :disabled="bot.actionPending !== null"
                @click="runSimple(() => bot.start(), t('actions.resume'))"
              >
                <AppIcon name="check" />
                {{ t('actions.resume') }}
              </VBtn>
              <VBtn
                v-if="bot.writesAllowed"
                type="button"
                :disabled="bot.actionPending !== null"
                @click="runSimple(() => bot.reloadConfig(), t('actions.reloadConfig'))"
              >
                <AppIcon name="refresh" />
                {{ t('actions.reloadConfig') }}
              </VBtn>
              <VBtn
                v-if="bot.writesAllowed"
                color="error"
                type="button"
                :disabled="bot.actionPending !== null"
                @click="stopConfirm = true"
              >
                <AppIcon name="power" />
                {{ t('actions.stop') }}
              </VBtn>
            </div>
            <p v-else class="small muted" style="margin-top: var(--sp-4)">
              {{ t('actions.controlsShortHint') }}
            </p>
          </VCardText>
        </VCard></VCol
      >
    </VRow>

    <VCard v-if="bot.sysinfo" tag="section" class="panel">
      <VCardItem class="panel__head">
        <VCardTitle tag="span" class="panel__title">{{ t('system.cpu') }}</VCardTitle>
        <span class="panel__meta num">{{ bot.sysinfo.cpu_count }} {{ t('system.cores') }}</span>
      </VCardItem>
      <VCardText class="panel__body">
        <div class="cores">
          <div v-for="core in bot.sysinfo.cpu_load" :key="core.cpu" class="cores__item">
            <span class="small muted num">CPU {{ core.cpu }}</span>
            <VProgressLinear
              :model-value="core.pct"
              :color="meterColor(core.pct)"
              :height="6"
              rounded
              :aria-label="`CPU ${core.cpu}`"
            />
            <span class="small num">{{ format.percent(core.pct, 0) }}</span>
          </div>
        </div>
      </VCardText>
    </VCard>

    <ConfirmDialog
      :open="stopConfirm"
      tone="danger"
      :title="bot.labelWithBot(t('actions.stop'))"
      :body="t('actions.stopHint')"
      :confirm-label="t('actions.stop')"
      :pending="bot.actionPending === 'stop'"
      @cancel="stopConfirm = false"
      @confirm="runStop"
    />
  </div>
</template>

<style scoped>
.metric--warn :deep(.metric__value) {
  color: var(--warn);
}

.system__tape {
  height: clamp(240px, 42vh, 460px);
}

.cores {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(190px, 100%), 1fr));
  gap: var(--sp-3);
}

.cores__item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--sp-2);
  align-items: center;
}
</style>

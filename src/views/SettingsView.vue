<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import BotsPanel from '@/components/BotsPanel.vue'
import FilterMenu from '@/components/FilterMenu.vue'
import { pushToast } from '@/composables/useToast'
import { useSegBlock } from '@/composables/useSegBlock'
import { LOCALE_LABELS, SUPPORTED_LOCALES, type LocalePreference } from '@/i18n'
import { canInstall, isStandalone, offlineReady, promptInstall } from '@/pwa'
import { useBotStore } from '@/stores/bot'
import { useEventsStore } from '@/stores/events'
import type { TimezonePreference } from '@/lib/timezone'
import { useSettingsStore } from '@/stores/settings'
import type { StreamAuthPreference } from '@/lib/stream'

const { t } = useI18n()
const settings = useSettingsStore()
const bot = useBotStore()
const events = useEventsStore()

const clearConfirm = ref(false)
/** The block behind the stream-auth choices, which slides to whichever one is active. */
const authSeg = ref<HTMLElement | null>(null)
const { blockStyle: authBlockStyle, blockReady: authBlockReady } = useSegBlock(
  authSeg,
  () => settings.streamAuth,
)
/** The block behind the time zone choices, which slides to whichever one is active. */
const timezoneSeg = ref<HTMLElement | null>(null)
const { blockStyle: timezoneBlockStyle, blockReady: timezoneBlockReady } = useSegBlock(
  timezoneSeg,
  () => settings.timezone,
)
const appVersion = __APP_VERSION__

const languageOptions = computed(() => [
  { value: 'system' as LocalePreference, label: t('settings.languageSystem') },
  ...SUPPORTED_LOCALES.map((code) => ({ value: code, label: LOCALE_LABELS[code] })),
])

/** Same pair of choices FreqUI offers: the browser's own zone, or the exchanges' UTC. */
const timezoneOptions = computed(() => [
  { value: 'browser' as TimezonePreference, label: t('settings.timezoneBrowser') },
  { value: 'UTC' as TimezonePreference, label: t('settings.timezoneUtc') },
])

const STREAM_AUTH_CHOICES: { value: StreamAuthPreference; label: string }[] = [
  { value: 'auto', label: 'settings.streamAuthAuto' },
  { value: 'ws_token', label: 'settings.streamAuthToken' },
]

const streamAuthLabel = computed(() => {
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

const streamAuthTone = computed(() => {
  if (bot.streamBlocked || bot.streamAuthMode === 'unavailable') return 'chip--bad'
  if (bot.streamAuthMode === 'off') return ''
  return 'chip--good'
})

const notifState = computed(() => {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
})

async function clearData() {
  settings.clearStoredData()
  clearConfirm.value = false
  bot.cleanup()
  bot.resetData()
  events.clear()
  settings.disconnect()
  pushToast(t('actions.done'), 'good')
}

async function enableNotifications() {
  if (notifState.value === 'unsupported') return
  const result = await Notification.requestPermission()
  settings.notifications = result === 'granted'
  pushToast(
    result === 'granted' ? t('settings.testOk') : t('actions.failed'),
    result === 'granted' ? 'good' : 'bad',
  )
}

async function enableControls() {
  settings.controlsAcknowledged = true
  settings.allowControls = true
  pushToast(t('common.saved'), 'good')
}

/** The chip above already reports the outcome; this only acknowledges the click. */
function retryStream() {
  bot.retryStream()
  pushToast(t('settings.retryingStream'), 'info')
}

function disableControls() {
  settings.allowControls = false
  settings.controlsAcknowledged = false
}

async function install() {
  const accepted = await promptInstall()
  if (accepted) pushToast(t('settings.installed'), 'good')
}
</script>

<template>
  <div class="stack settings">
    <BotsPanel />

    <div class="settings__columns">
      <div class="settings__col">
        <section class="panel">
          <div class="panel__head">
            <span class="panel__title">{{ t('settings.language') }}</span>
          </div>
          <div class="panel__body stack">
            <div class="field">
              <FilterMenu
                v-model="settings.localePreference"
                :options="languageOptions"
                :label="t('settings.language')"
              />
            </div>
            <div class="field">
              <span class="field__label">{{ t('settings.timezone') }}</span>
              <div ref="timezoneSeg" class="seg">
                <button
                  v-for="choice in timezoneOptions"
                  :key="choice.value"
                  type="button"
                  class="seg__item"
                  :aria-pressed="settings.timezone === choice.value"
                  @click="settings.timezone = choice.value"
                >
                  {{ choice.label }}
                </button>
                <span
                  class="seg__block"
                  :class="{ 'is-ready': timezoneBlockReady }"
                  :style="timezoneBlockStyle"
                />
              </div>
              <span class="field__hint">{{ t('settings.timezoneHint') }}</span>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel__head">
            <span class="panel__title">{{ t('settings.push') }}</span>
          </div>
          <div class="panel__body stack">
            <label class="switch">
              <input v-model="settings.websocket" type="checkbox" />
              <span class="switch__track" />
              <span class="switch__text">
                <span class="switch__title">{{ t('settings.websocket') }}</span>
                <span class="switch__hint">{{ t('settings.websocketHint') }}</span>
              </span>
            </label>

            <div class="stream-auth" :class="{ 'stream-auth--disabled': !settings.websocket }">
              <div class="row row--wrap">
                <span class="chip" :class="streamAuthTone">{{ streamAuthLabel }}</span>
                <button
                  v-if="settings.websocket"
                  type="button"
                  class="btn btn--sm"
                  @click="retryStream"
                >
                  <AppIcon name="refresh" />
                  {{ t('settings.retryStream') }}
                </button>
              </div>
              <p class="small muted">{{ t('settings.streamAuthHint') }}</p>
              <p v-if="bot.streamReasonKey" class="banner banner--warn small">
                {{ t(bot.streamReasonKey) }}
              </p>
              <div class="settings__grid">
                <div class="field">
                  <span class="field__label">{{ t('settings.streamAuth') }}</span>
                  <div ref="authSeg" class="seg">
                    <button
                      v-for="choice in STREAM_AUTH_CHOICES"
                      :key="choice.value"
                      type="button"
                      class="seg__item"
                      :aria-pressed="settings.streamAuth === choice.value"
                      @click="settings.streamAuth = choice.value"
                    >
                      {{ t(choice.label) }}
                    </button>
                    <span
                      class="seg__block"
                      :class="{ 'is-ready': authBlockReady }"
                      :style="authBlockStyle"
                    />
                  </div>
                </div>
                <label v-if="settings.streamAuth === 'ws_token'" class="field">
                  <span class="field__label">{{ t('settings.wsToken') }}</span>
                  <input
                    v-model="settings.wsToken"
                    class="input num"
                    type="password"
                    autocomplete="off"
                    spellcheck="false"
                    :placeholder="t('settings.wsTokenPlaceholder')"
                  />
                  <span class="field__hint">{{ t('settings.wsTokenHint') }}</span>
                </label>
              </div>
            </div>

            <div class="row row--wrap">
              <label class="switch">
                <input
                  v-model="settings.notifications"
                  type="checkbox"
                  :disabled="notifState !== 'granted'"
                />
                <span class="switch__track" />
                <span class="switch__text">
                  <span class="switch__title">{{ t('settings.notifTitle') }}</span>
                  <span class="switch__hint">{{ t('settings.notifHint') }}</span>
                </span>
              </label>
              <button
                v-if="notifState !== 'granted'"
                type="button"
                class="btn btn--sm"
                :disabled="notifState === 'unsupported'"
                @click="enableNotifications"
              >
                <AppIcon name="bell" />
                {{ t('settings.notifTitle') }}
              </button>
            </div>
            <p v-if="notifState === 'unsupported'" class="small muted">
              {{ t('settings.notifPermission') }}
            </p>
          </div>
        </section>
      </div>

      <div class="settings__col">
        <section class="panel settings__danger">
          <div class="panel__head">
            <span class="panel__title">{{ t('actions.title') }}</span>
            <div class="panel__actions">
              <span class="chip" :class="settings.writesEnabled ? 'chip--warn' : ''">
                {{ settings.writesEnabled ? t('common.enabled') : t('common.disabled') }}
              </span>
            </div>
          </div>
          <div class="panel__body stack">
            <p class="small">{{ t('actions.controlsDisabledHint') }}</p>
            <ul class="settings__list">
              <li>{{ t('actions.pauseHint') }}</li>
              <li>{{ t('actions.stopHint') }}</li>
              <li>{{ t('actions.forceExitHint') }}</li>
              <li>{{ t('actions.blacklistAddHint') }}</li>
            </ul>
            <div class="row row--wrap">
              <!-- Once writes are on, the acknowledgement button has nothing left to do. -->
              <button
                v-if="!settings.writesEnabled"
                type="button"
                class="btn btn--danger"
                @click="enableControls"
              >
                <AppIcon name="alert" />
                {{ t('actions.enableControls') }}
              </button>
              <button
                v-if="settings.writesEnabled"
                type="button"
                class="btn"
                @click="disableControls"
              >
                {{ t('actions.disableControls') }}
              </button>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel__head">
            <span class="panel__title">{{ t('settings.pwaTitle') }}</span>
            <div class="panel__actions">
              <span v-if="offlineReady" class="chip chip--good">{{
                t('settings.offlineReady')
              }}</span>
            </div>
          </div>
          <div class="panel__body row row--wrap">
            <button v-if="canInstall" type="button" class="btn btn--primary" @click="install">
              <AppIcon name="install" />
              {{ t('settings.install') }}
            </button>
            <span v-else-if="isStandalone" class="chip chip--good">{{
              t('settings.installed')
            }}</span>
            <p v-else class="small muted">{{ t('settings.installManual') }}</p>
            <p class="small muted settings__hint">{{ t('settings.installHint') }}</p>
          </div>
        </section>
      </div>
    </div>

    <section class="panel">
      <div class="panel__head">
        <span class="panel__title">{{ t('settings.dataTitle') }}</span>
      </div>
      <div class="panel__body stack">
        <p class="small muted">{{ t('settings.dataHint') }}</p>
        <div class="row row--wrap">
          <button type="button" class="btn btn--danger" @click="clearConfirm = true">
            <AppIcon name="trash" />
            {{ t('settings.clearData') }}
          </button>
          <span class="small muted">
            {{ t('app.name') }} - {{ appVersion }} · {{ t('app.freqtrade') }} -
            {{ bot.showConfig?.version ?? '—' }}
          </span>
        </div>
        <p v-if="clearConfirm" class="banner banner--warn">
          {{ t('settings.clearDataConfirm') }}
          <button
            type="button"
            class="btn btn--sm btn--danger"
            style="margin-left: 8px"
            @click="clearData"
          >
            {{ t('common.confirm') }}
          </button>
          <button type="button" class="btn btn--sm" @click="clearConfirm = false">
            {{ t('common.cancel') }}
          </button>
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.settings {
  /*
   * Column flow rather than a grid: a grid row is as tall as its tallest card, which
   * left a hole under the short language card. `display` is restated because the
   * `.stack` helper already made the root a flex column.
   */
  display: flex;
  flex-direction: column;
}

/*
 * Two explicit stacks instead of CSS columns or a grid: the cards keep their order, both
 * columns start at the same line, and every gap is the same — balancing a multi-column box
 * moved the right-hand stack down and closed the gap before the full-width card.
 */
.settings__columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-4);
  align-items: start;
}

.settings__col {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  min-width: 0;
}

@media (max-width: 1100px) {
  .settings__columns {
    grid-template-columns: minmax(0, 1fr);
  }
}

.settings__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
  gap: var(--sp-3);
}

.settings__list {
  margin: 0;
  padding-left: 18px;
  color: var(--text-2);
  font-size: var(--fs-sm);
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.settings__hint {
  flex-basis: 100%;
}

.settings__danger {
  border-color: color-mix(in srgb, var(--short) 35%, var(--line));
}

.stream-auth {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-4);
  border: 1px solid var(--line);
  border-radius: var(--r-2);
  background: var(--ink-800);
}

.stream-auth--disabled {
  opacity: 0.6;
}
</style>

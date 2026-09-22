<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import { pushToast } from '@/composables/useToast'
import { LOCALE_LABELS, SUPPORTED_LOCALES } from '@/i18n'
import { normalizeBaseUrl } from '@/lib/api'
import {
  applyUpdate,
  canInstall,
  isStandalone,
  needRefresh,
  offlineReady,
  promptInstall,
} from '@/pwa'
import { useBotStore } from '@/stores/bot'
import { useEventsStore } from '@/stores/events'
import { useSettingsStore } from '@/stores/settings'
import type { StreamAuthPreference } from '@/lib/stream'

const { t } = useI18n()
const settings = useSettingsStore()
const bot = useBotStore()
const events = useEventsStore()

const baseUrl = ref(settings.baseUrl)
const username = ref(settings.username)
const password = ref('')
const saving = ref(false)
const tested = ref<null | 'ok' | 'fail'>(null)
const clearConfirm = ref(false)
const appVersion = __APP_VERSION__

const STREAM_AUTH_CHOICES: { value: StreamAuthPreference; label: string }[] = [
  { value: 'auto', label: 'settings.streamAuthAuto' },
  { value: 'ws_token', label: 'settings.streamAuthToken' },
  { value: 'off', label: 'settings.streamAuthOff' },
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

const passwordPlaceholder = computed(() =>
  settings.password ? t('settings.passwordKept') : '••••••••',
)

const notifState = computed(() => {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
})

async function saveConnection() {
  saving.value = true
  settings.updateCredentialFields({
    baseUrl: normalizeBaseUrl(baseUrl.value) || baseUrl.value.trim(),
    username: username.value,
    password: password.value || settings.password,
  })
  bot.rebuildClient()
  const ok = await bot.connect()
  saving.value = false
  tested.value = ok ? 'ok' : 'fail'
  pushToast(
    ok ? t('settings.testOk') : t(bot.errorKey?.key ?? 'actions.failed'),
    ok ? 'good' : 'bad',
  )
  if (ok) {
    baseUrl.value = settings.baseUrl
    password.value = ''
  }
}

async function testConnection() {
  saving.value = true
  const probe = normalizeBaseUrl(baseUrl.value) || baseUrl.value.trim()
  const previous = {
    baseUrl: settings.baseUrl,
    username: settings.username,
    password: settings.password,
  }
  settings.updateCredentialFields({
    baseUrl: probe,
    username: username.value,
    password: password.value || settings.password,
  })
  bot.rebuildClient()
  const ok = await bot.connect()
  tested.value = ok ? 'ok' : 'fail'
  pushToast(
    ok ? t('settings.testOk') : t(bot.errorKey?.key ?? 'actions.failed'),
    ok ? 'good' : 'bad',
  )
  if (!ok) {
    // Restore the working configuration when a test fails.
    settings.updateCredentialFields(previous)
    bot.rebuildClient()
  }
  saving.value = false
}

function disconnect() {
  bot.cleanup()
  bot.resetData()
  events.clear()
  settings.disconnect()
  baseUrl.value = ''
  username.value = ''
  password.value = ''
  tested.value = null
}

async function clearData() {
  settings.clearStoredData()
  clearConfirm.value = false
  disconnect()
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
    <section class="panel">
      <div class="panel__head">
        <span class="panel__title">{{ t('settings.connection') }}</span>
        <div class="panel__actions">
          <span
            class="chip"
            :class="
              bot.connection === 'online'
                ? 'chip--good'
                : bot.connection === 'idle'
                  ? ''
                  : 'chip--bad'
            "
          >
            {{
              bot.connection === 'online'
                ? t('system.wsConnected')
                : bot.connection === 'idle'
                  ? t('common.unknown')
                  : t('common.offline')
            }}
          </span>
        </div>
      </div>
      <div class="panel__body stack">
        <div class="settings__grid">
          <label class="field">
            <span class="field__label">{{ t('settings.apiBase') }}</span>
            <input
              v-model="baseUrl"
              class="input num"
              type="text"
              inputmode="url"
              spellcheck="false"
              :placeholder="t('connect.baseUrlPlaceholder')"
            />
          </label>
          <label class="field">
            <span class="field__label">{{ t('settings.username') }}</span>
            <input v-model="username" class="input" type="text" autocomplete="username" />
          </label>
          <label class="field">
            <span class="field__label">{{ t('settings.password') }}</span>
            <input
              v-model="password"
              class="input"
              type="password"
              autocomplete="current-password"
              :placeholder="passwordPlaceholder"
            />
          </label>
        </div>

        <label class="switch">
          <input v-model="settings.remember" type="checkbox" />
          <span class="switch__track" />
          <span class="switch__text">
            <span class="switch__title">{{ t('connect.remember') }}</span>
            <span class="switch__hint">{{ t('connect.rememberHint') }}</span>
          </span>
        </label>

        <div class="row row--wrap">
          <button type="button" class="btn btn--primary" :disabled="saving" @click="saveConnection">
            <AppIcon name="check" />
            {{ t('common.save') }}
          </button>
          <button type="button" class="btn" :disabled="saving" @click="testConnection">
            <AppIcon name="wifi" />
            {{ t('settings.testConnection') }}
          </button>
          <button type="button" class="btn btn--danger" @click="disconnect">
            <AppIcon name="logout" />
            {{ t('settings.disconnect') }}
          </button>
          <span v-if="tested === 'ok'" class="chip chip--good">{{ t('settings.testOk') }}</span>
          <span v-else-if="tested === 'fail'" class="chip chip--bad">{{
            t('connect.failed')
          }}</span>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel__head">
        <span class="panel__title">{{ t('settings.title') }}</span>
      </div>
      <div class="panel__body stack">
        <div class="field">
          <span class="field__label">{{ t('settings.language') }}</span>
          <div class="seg">
            <button
              v-for="code in SUPPORTED_LOCALES"
              :key="code"
              type="button"
              class="seg__item"
              :aria-pressed="settings.locale === code"
              @click="settings.locale = code"
            >
              {{ LOCALE_LABELS[code] }}
            </button>
          </div>
        </div>

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
              @click="bot.retryStream()"
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
              <div class="seg">
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
              </div>
            </div>
            <label class="field">
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
          <button type="button" class="btn btn--danger" @click="enableControls">
            <AppIcon name="alert" />
            {{ t('actions.enableControls') }}
          </button>
          <button v-if="settings.writesEnabled" type="button" class="btn" @click="disableControls">
            {{ t('actions.disableControls') }}
          </button>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel__head">
        <span class="panel__title">{{ t('settings.pwaTitle') }}</span>
        <div class="panel__actions">
          <span v-if="offlineReady" class="chip chip--good">{{ t('settings.offlineReady') }}</span>
          <span v-if="needRefresh" class="chip chip--warn">{{
            t('settings.updateAvailable')
          }}</span>
        </div>
      </div>
      <div class="panel__body row row--wrap">
        <button v-if="canInstall" type="button" class="btn btn--primary" @click="install">
          <AppIcon name="install" />
          {{ t('settings.install') }}
        </button>
        <span v-else-if="isStandalone" class="chip chip--good">{{ t('settings.installed') }}</span>
        <p v-else class="small muted">{{ t('settings.installManual') }}</p>
        <button v-if="needRefresh" type="button" class="btn btn--primary" @click="applyUpdate">
          {{ t('settings.update') }}
        </button>
        <p class="small muted settings__hint">{{ t('settings.installHint') }}</p>
      </div>
    </section>

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
            {{ t('app.name') }} {{ appVersion }} · {{ t('system.version') }}
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
  /* Cards reflow into as many columns as fit, so no dead space on wide screens. */
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(460px, 100%), 1fr));
  gap: var(--sp-4);
  align-items: start;
}

/* The connection form is the primary task: give it the full width. */
.settings > .panel:first-child {
  grid-column: 1 / -1;
}

.settings > .panel:last-child {
  grid-column: 1 / -1;
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

.select--sm {
  width: auto;
  padding: 5px 8px;
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

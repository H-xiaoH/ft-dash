<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import AppIcon from '@/components/AppIcon.vue'
import { pushToast } from '@/composables/useToast'
import { describeError, FreqtradeApi, normalizeBaseUrl } from '@/lib/api'
import { botNameFromUrl, type Bot } from '@/lib/bots'
import { useBotStore } from '@/stores/bot'
import { useSettingsStore } from '@/stores/settings'

interface BotForm {
  /** `null` while adding a new bot. */
  id: string | null
  name: string
  baseUrl: string
  username: string
  password: string
  wsToken: string
}

const { t } = useI18n()
const settings = useSettingsStore()
const bot = useBotStore()

const form = ref<BotForm | null>(null)
const saving = ref(false)
const testing = ref<string | null>(null)
/** Last manual probe result, kept per bot so it survives the toast. */
const testResult = ref<Record<string, 'ok' | 'fail'>>({})
const removeTarget = ref<Bot | null>(null)
/** Set when switching to a bot whose password is not at hand. */
const passwordTarget = ref<Bot | null>(null)
const passwordDraft = ref('')
const noticeDismissed = ref(false)

const showLegacyNotice = computed(() => settings.legacyCleared && !noticeDismissed.value)
const canSave = computed(() => {
  const entry = form.value
  if (!entry) return false
  const storedPassword = entry.id
    ? (settings.bots.find((item) => item.id === entry.id)?.password ?? '')
    : ''
  return Boolean(
    entry.baseUrl.trim() && entry.username.trim() && (entry.password || storedPassword),
  )
})
/** Two bots may share a name, but the operator should know it will be ambiguous. */
const duplicateName = computed(() => {
  const entry = form.value
  const name = entry?.name.trim().toLowerCase()
  if (!entry || !name) return false
  return settings.bots.some((item) => item.id !== entry.id && item.name.toLowerCase() === name)
})

function startAdd() {
  form.value = { id: null, name: '', baseUrl: '', username: '', password: '', wsToken: '' }
}

function startEdit(entry: Bot) {
  form.value = {
    id: entry.id,
    name: entry.name,
    baseUrl: entry.baseUrl,
    username: entry.username,
    // Left blank on purpose: an empty box keeps the stored password.
    password: '',
    wsToken: entry.wsToken,
  }
}

function cancelEdit() {
  form.value = null
}

async function submit() {
  const entry = form.value
  if (!entry || !canSave.value || saving.value) return
  saving.value = true
  const baseUrl = normalizeBaseUrl(entry.baseUrl) || entry.baseUrl.trim()
  const name = entry.name.trim() || botNameFromUrl(baseUrl)
  if (entry.id) {
    settings.updateBot(entry.id, {
      name,
      baseUrl,
      username: entry.username,
      password: entry.password || undefined,
      wsToken: entry.wsToken,
    })
    if (entry.id === settings.activeBotId) {
      bot.rebuildClient()
      await bot.connect()
    } else {
      pushToast(t('common.saved'), 'good')
    }
  } else {
    settings.addBot({
      name,
      baseUrl,
      username: entry.username,
      password: entry.password,
      wsToken: entry.wsToken,
    })
    pushToast(t('bots.added', { name }), 'good')
  }
  saving.value = false
  form.value = null
}

/** Probes one bot on its own client so the active connection is left alone. */
async function testConnection(entry: Bot) {
  if (!entry.password) {
    pushToast(t('bots.testNeedsPassword'), 'bad')
    return
  }
  testing.value = entry.id
  try {
    const api = new FreqtradeApi({
      baseUrl: entry.baseUrl,
      username: entry.username,
      password: entry.password,
    })
    await api.ping()
    await api.showConfig()
    testResult.value = { ...testResult.value, [entry.id]: 'ok' }
    pushToast(t('bots.testOk'), 'good')
  } catch (error) {
    const described = describeError(error)
    testResult.value = { ...testResult.value, [entry.id]: 'fail' }
    pushToast(t(described.key, described.params ?? {}), 'bad')
  } finally {
    testing.value = null
  }
}

async function switchTo(entry: Bot) {
  if (bot.actionPending !== null) {
    pushToast(t('bots.busy'), 'bad')
    return
  }
  if (entry.id === settings.activeBotId) return
  if (!entry.password) {
    passwordTarget.value = entry
    passwordDraft.value = ''
    return
  }
  await runSwitch(entry)
}

async function runSwitch(entry: Bot) {
  const ok = await bot.switchBot(entry.id)
  pushToast(
    ok ? t('bots.switched', { name: entry.name }) : t(bot.errorKey?.key ?? 'actions.failed'),
    ok ? 'good' : 'bad',
  )
}

async function submitPassword() {
  const entry = passwordTarget.value
  if (!entry || !passwordDraft.value) return
  settings.updateBot(entry.id, { password: passwordDraft.value })
  passwordTarget.value = null
  passwordDraft.value = ''
  await runSwitch({ ...entry, password: passwordDraft.value })
}

/** Credentials for the bot that is already selected but has no password at hand. */
const activePasswordDraft = ref('')

async function connectActive() {
  const entry = settings.activeBot
  if (!entry || !activePasswordDraft.value) return
  settings.updateBot(entry.id, { password: activePasswordDraft.value })
  activePasswordDraft.value = ''
  bot.rebuildClient()
  const ok = await bot.connect()
  pushToast(ok ? t('bots.testOk') : t(bot.errorKey?.key ?? 'actions.failed'), ok ? 'good' : 'bad')
}

async function confirmRemove() {
  const entry = removeTarget.value
  removeTarget.value = null
  if (!entry) return
  const wasActive = entry.id === settings.activeBotId
  settings.removeBot(entry.id)
  pushToast(t('bots.removed', { name: entry.name }), 'good')
  if (!settings.bots.length) {
    bot.cleanup()
    bot.resetData()
    return
  }
  if (wasActive) await bot.connect()
}
</script>

<template>
  <section class="panel">
    <div class="panel__head">
      <span class="panel__title">{{ t('bots.title') }}</span>
      <div class="panel__actions row row--wrap">
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
        <button type="button" class="btn btn--sm" @click="startAdd">
          <AppIcon name="plus" />
          {{ t('bots.add') }}
        </button>
      </div>
    </div>

    <div class="panel__body stack">
      <div v-if="showLegacyNotice" class="banner banner--warn" role="status">
        <AppIcon name="alert" :size="18" />
        <div>{{ t('bots.legacyCleared') }}</div>
        <div class="spacer" />
        <button type="button" class="btn btn--sm" @click="noticeDismissed = true">
          {{ t('common.close') }}
        </button>
      </div>

      <p v-if="!settings.bots.length" class="empty">{{ t('bots.empty') }}</p>

      <ul v-else class="bots">
        <li
          v-for="entry in settings.bots"
          :key="entry.id"
          class="bots__row"
          :class="{ 'is-active': entry.id === settings.activeBotId }"
        >
          <div class="bots__meta">
            <span class="bots__name">{{ entry.name }}</span>
            <span v-if="entry.id === settings.activeBotId" class="chip chip--good">
              {{ t('bots.current') }}
            </span>
            <span v-if="testResult[entry.id] === 'ok'" class="chip chip--good">
              {{ t('bots.testOk') }}
            </span>
            <span v-else-if="testResult[entry.id] === 'fail'" class="chip chip--bad">
              {{ t('connect.failed') }}
            </span>
            <span class="num small muted bots__url">{{ entry.baseUrl }}</span>
          </div>
          <div class="row row--wrap">
            <button
              v-if="entry.id !== settings.activeBotId"
              type="button"
              class="btn btn--sm btn--primary"
              @click="switchTo(entry)"
            >
              <AppIcon name="power" />
              {{ t('bots.switchTo') }}
            </button>
            <button type="button" class="btn btn--sm" @click="startEdit(entry)">
              {{ t('bots.edit') }}
            </button>
            <button
              type="button"
              class="btn btn--sm"
              :disabled="testing === entry.id"
              @click="testConnection(entry)"
            >
              <AppIcon name="wifi" />
              {{ t('bots.test') }}
            </button>
            <button type="button" class="btn btn--sm btn--danger" @click="removeTarget = entry">
              <AppIcon name="trash" />
              {{ t('bots.remove') }}
            </button>
          </div>

          <form
            v-if="passwordTarget?.id === entry.id"
            class="bots__prompt"
            @submit.prevent="submitPassword"
          >
            <label class="field">
              <span class="field__label">{{ t('bots.needPassword', { name: entry.name }) }}</span>
              <input
                v-model="passwordDraft"
                class="input"
                type="password"
                autocomplete="current-password"
              />
            </label>
            <div class="row">
              <button type="submit" class="btn btn--sm btn--primary" :disabled="!passwordDraft">
                {{ t('bots.connect') }}
              </button>
              <button type="button" class="btn btn--sm" @click="passwordTarget = null">
                {{ t('common.cancel') }}
              </button>
            </div>
          </form>
        </li>
      </ul>

      <form v-if="settings.needsPassword" class="bots__prompt" @submit.prevent="connectActive">
        <label class="field">
          <span class="field__label">
            {{ t('bots.needPassword', { name: settings.activeBotName }) }}
          </span>
          <input
            v-model="activePasswordDraft"
            class="input"
            type="password"
            autocomplete="current-password"
          />
        </label>
        <div class="row">
          <button type="submit" class="btn btn--sm btn--primary" :disabled="!activePasswordDraft">
            {{ t('bots.connect') }}
          </button>
        </div>
      </form>

      <form v-if="form" class="bots__editor" @submit.prevent="submit">
        <div class="bots__grid">
          <label class="field">
            <span class="field__label">{{ t('bots.name') }}</span>
            <input
              v-model="form.name"
              class="input"
              type="text"
              :placeholder="t('bots.namePlaceholder')"
            />
            <span v-if="duplicateName" class="field__hint">{{ t('bots.duplicateName') }}</span>
          </label>
          <label class="field">
            <span class="field__label">{{ t('connect.baseUrl') }}</span>
            <input
              v-model="form.baseUrl"
              class="input num"
              type="text"
              inputmode="url"
              spellcheck="false"
              :placeholder="t('connect.baseUrlPlaceholder')"
            />
          </label>
          <label class="field">
            <span class="field__label">{{ t('connect.username') }}</span>
            <input v-model="form.username" class="input" type="text" autocomplete="username" />
          </label>
          <label class="field">
            <span class="field__label">{{ t('connect.password') }}</span>
            <input
              v-model="form.password"
              class="input"
              type="password"
              autocomplete="current-password"
              :placeholder="form.id ? t('settings.passwordKept') : '••••••••'"
            />
          </label>
          <label class="field">
            <span class="field__label">{{ t('settings.wsToken') }}</span>
            <input
              v-model="form.wsToken"
              class="input num"
              type="password"
              autocomplete="off"
              spellcheck="false"
              :placeholder="t('settings.wsTokenPlaceholder')"
            />
          </label>
        </div>
        <div class="row row--wrap">
          <button type="submit" class="btn btn--primary" :disabled="!canSave || saving">
            <AppIcon name="check" />
            {{ t('common.save') }}
          </button>
          <button type="button" class="btn" @click="cancelEdit">{{ t('common.cancel') }}</button>
        </div>
      </form>

      <label class="switch">
        <input v-model="settings.remember" type="checkbox" />
        <span class="switch__track" />
        <span class="switch__text">
          <span class="switch__title">{{ t('connect.remember') }}</span>
          <span class="switch__hint">{{ t('connect.rememberHint') }}</span>
        </span>
      </label>
    </div>

    <ConfirmDialog
      :open="removeTarget !== null"
      tone="danger"
      :title="t('bots.removeTitle')"
      :body="t('bots.removeBody', { name: removeTarget?.name ?? '' })"
      :confirm-label="t('bots.remove')"
      @cancel="removeTarget = null"
      @confirm="confirmRemove"
    />
  </section>
</template>

<style scoped>
.bots {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  list-style: none;
  padding: 0;
  margin: 0;
}

.bots__row {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--r-2);
  background: var(--ink-900);
}

.bots__row.is-active {
  border-color: var(--line-strong);
}

.bots__meta {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
}

.bots__name {
  font-weight: 500;
}

.bots__url {
  overflow-wrap: anywhere;
}

.bots__prompt,
.bots__editor {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border: 1px dashed var(--line-strong);
  border-radius: var(--r-2);
}

.bots__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--sp-3);
}
</style>

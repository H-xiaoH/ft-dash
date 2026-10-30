<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import ControlsPanel from '@/components/ControlsPanel.vue'
import FilterMenu, { type FilterOption, type StatusLamp } from '@/components/FilterMenu.vue'
import InlineConfirm from '@/components/InlineConfirm.vue'
import { pushToast } from '@/composables/useToast'
import { describeError, FreqtradeApiClient, normalizeBaseUrl } from '@/data/freqtrade'
import { defaultBotName, type Bot } from '@/lib/bots'
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
const nameTouched = ref(false)
const saving = ref(false)
const testing = ref<string | null>(null)
/** Last manual probe result, kept per bot so it survives the toast. */
const testResult = ref<Record<string, 'ok'>>({})
const removeTarget = ref<Bot | null>(null)
/** Set when switching to a bot whose password is not at hand. */
const passwordTarget = ref<Bot | null>(null)
const passwordDraft = ref('')
/** Only the newest switch may report its result; older requests can finish later. */
let switchRequest = 0
/** The last entry of the bot picker: it opens the manager instead of switching bots. */
const MANAGE = '__manage'
const manageOpen = ref(false)

const activeBot = computed(
  () => settings.bots.find((entry) => entry.id === settings.activeBotId) ?? null,
)

/**
 * The lamp follows the poll: green while the bot answers, amber while a request is in
 * flight (or the first connection is still being made), red once it stops answering.
 * Every other bot is unknown here — this app only talks to the one on screen — so it stays
 * a muted dot instead of pretending to be healthy.
 */
const lamp = computed<StatusLamp>(() => {
  if (bot.connection === 'unreachable' || bot.connection === 'unauthorized') return 'bad'
  if (bot.connection === 'online') return bot.refreshing ? 'warn' : 'good'
  if (bot.connection === 'connecting' || bot.refreshing) return 'warn'
  return 'muted'
})
const activeLamp = computed<StatusLamp>(() => lamp.value)

/** The chip beside the title says the same thing as the lamp, in words. */
const connectionChip = computed(() => {
  switch (bot.connection) {
    case 'online':
      return { tone: 'chip--good', label: t('system.wsConnected') }
    case 'connecting':
      return { tone: 'chip--warn', label: t('bots.connecting') }
    case 'idle':
      return { tone: '', label: t('common.unknown') }
    default:
      return { tone: 'chip--bad', label: t('common.offline') }
  }
})

/** Switching is what picking a bot does; the manager is the one entry that does not. */
const botOptions = computed<FilterOption[]>(() => [
  ...settings.bots.map((entry) => ({
    value: entry.id,
    label: entry.name,
    hint: entry.id === settings.activeBotId ? t('bots.current') : undefined,
    dot: entry.id === settings.activeBotId ? activeLamp.value : ('muted' as const),
  })),
  { value: MANAGE, label: t('bots.manage') },
])

const botChoice = computed<string>({
  get: () => settings.activeBotId ?? settings.bots[0]?.id ?? MANAGE,
  set: (value) => {
    if (value === MANAGE) {
      manageOpen.value = true
      return
    }
    const entry = settings.bots.find((item) => item.id === value)
    if (entry) void switchTo(entry)
  },
})

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

function closeManage() {
  manageOpen.value = false
  form.value = null
  removeTarget.value = null
}

function startAdd() {
  nameTouched.value = false
  form.value = { id: null, name: '', baseUrl: '', username: '', password: '', wsToken: '' }
}

function startEdit(entry: Bot) {
  nameTouched.value = true
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

watch(
  () => form.value?.username,
  (username) => {
    if (!form.value || nameTouched.value) return
    form.value.name = username?.trim() ?? ''
  },
)

function cancelEdit() {
  form.value = null
}

async function submit() {
  const entry = form.value
  if (!entry || !canSave.value || saving.value) return
  saving.value = true
  const baseUrl = normalizeBaseUrl(entry.baseUrl) || entry.baseUrl.trim()
  const username = entry.username.trim()
  const name = entry.name.trim() || defaultBotName(username, baseUrl)
  const stored = entry.id ? settings.bots.find((item) => item.id === entry.id) : undefined
  /*
   * Ask before saving: a bot that cannot answer must not appear in the list, and that is what
   * the connect form already does. A bare rename or a new ws_token keeps working offline, so
   * the probe only runs when the endpoint or the credentials are what changed.
   */
  const password = entry.password || stored?.password || ''
  const credentialsChanged =
    !stored ||
    entry.password.length > 0 ||
    baseUrl !== stored.baseUrl ||
    username !== stored.username
  if (password && credentialsChanged) {
    try {
      const probe = new FreqtradeApiClient({ baseUrl, username, password })
      await probe.ping()
      await probe.showConfig()
    } catch (error) {
      const described = describeError(error)
      pushToast(t(described.key, described.params ?? {}), 'bad')
      saving.value = false
      return
    }
  }

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
  const nextResult = { ...testResult.value }
  delete nextResult[entry.id]
  testResult.value = nextResult
  try {
    const api = new FreqtradeApiClient({
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
    pushToast(t(described.key, described.params ?? {}), 'bad')
  } finally {
    testing.value = null
  }
}

async function switchTo(entry: Bot) {
  if (entry.id === settings.activeBotId) return
  if (!entry.password) {
    switchRequest += 1
    passwordTarget.value = entry
    passwordDraft.value = ''
    return
  }
  await runSwitch(entry)
}

async function runSwitch(entry: Bot) {
  const request = ++switchRequest
  // A write in flight belongs to the bot on screen; leaving it behind mid-request is
  // exactly the mix-up the single-active model exists to prevent.
  if (bot.actionPending !== null) {
    pushToast(t('bots.busy'), 'bad')
    return
  }
  const ok = await bot.switchBot(entry.id)
  if (request !== switchRequest) return
  pushToast(
    ok ? t('bots.switched', { name: entry.name }) : t(bot.errorKey?.key ?? 'actions.failed'),
    ok ? 'good' : 'bad',
  )
}

/** The row currently asking for a password. */
const passwordEntry = computed(
  () => passwordTarget.value ?? (settings.needsPassword ? settings.activeBot : null),
)

async function submitPassword() {
  const entry = passwordEntry.value
  if (!entry || !passwordDraft.value) return
  settings.updateBot(entry.id, { password: passwordDraft.value })
  const password = passwordDraft.value
  passwordTarget.value = null
  passwordDraft.value = ''
  if (entry.id !== settings.activeBotId) {
    await runSwitch({ ...entry, password })
    return
  }
  // The bot on screen just needs its password before it can be polled again.
  bot.rebuildClient()
  const ok = await bot.connect()
  pushToast(ok ? t('bots.testOk') : t(bot.errorKey?.key ?? 'actions.failed'), ok ? 'good' : 'bad')
}

async function confirmRemove() {
  const entry = removeTarget.value
  removeTarget.value = null
  if (!entry) return
  if (bot.actionPending !== null) {
    pushToast(t('bots.busy'), 'bad')
    return
  }
  const removed = await bot.removeBot(entry.id)
  if (!removed) {
    pushToast(t(bot.errorKey?.key ?? 'actions.failed'), 'bad')
    return
  }
  pushToast(t('bots.removed', { name: entry.name }), 'good')
}
</script>

<template>
  <section class="panel">
    <div class="panel__head">
      <span class="panel__title">{{ t('bots.title') }}</span>
      <div class="panel__actions row">
        <span class="chip" :class="connectionChip.tone">
          {{ connectionChip.label }}
        </span>
      </div>
    </div>

    <div class="panel__body stack">
      <!-- One picker for every bot; the last entry manages them instead of switching. -->
      <FilterMenu
        v-model="botChoice"
        :options="botOptions"
        :trigger-hint="activeBot?.baseUrl ?? ''"
        :label="t('bots.select')"
      />

      <form v-if="passwordEntry" class="bots__prompt" @submit.prevent="submitPassword">
        <label class="field">
          <span class="field__label">{{
            t('bots.needPassword', { name: passwordEntry.name })
          }}</span>
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

      <!-- 管理后端: add, edit, test and remove the saved backends. -->
      <section v-if="manageOpen" class="inset bots__manage">
        <div class="inset__head">
          <span class="panel__title">{{ t('bots.manage') }}</span>
          <div class="spacer" />
          <button type="button" class="btn btn--sm btn--ghost" @click="closeManage">
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
            <div class="row row--wrap">
              <span class="bots__name">{{ entry.name }}</span>
              <span v-if="entry.id === settings.activeBotId" class="chip chip--good">
                {{ t('bots.current') }}
              </span>
              <span class="num small muted bots__url">{{ entry.baseUrl }}</span>
            </div>
            <div class="row row--wrap">
              <button type="button" class="btn btn--sm" @click="startEdit(entry)">
                {{ t('bots.edit') }}
              </button>
              <button
                type="button"
                class="btn btn--sm"
                :class="{ 'bots__test--ok': testResult[entry.id] === 'ok' }"
                :disabled="testing === entry.id"
                @click="testConnection(entry)"
              >
                <AppIcon name="wifi" />
                {{ testResult[entry.id] === 'ok' ? t('bots.testSucceeded') : t('bots.test') }}
              </button>
              <button type="button" class="btn btn--sm btn--danger" @click="removeTarget = entry">
                <AppIcon name="trash" />
                {{ t('bots.remove') }}
              </button>
            </div>
          </li>
        </ul>

        <InlineConfirm
          :open="removeTarget !== null"
          :message="t('bots.removeBody', { name: removeTarget?.name ?? '' })"
          :confirm-label="t('bots.remove')"
          :cancel-label="t('common.cancel')"
          :pending="bot.actionPending !== null"
          @cancel="removeTarget = null"
          @confirm="confirmRemove"
        />

        <form v-if="form" class="bots__editor" @submit.prevent="submit">
          <div class="bots__grid">
            <label class="field">
              <span class="field__label">{{ t('bots.name') }}</span>
              <input
                v-model="form.name"
                class="input"
                type="text"
                :placeholder="t('bots.nameOptional')"
                @input="nameTouched = true"
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
                :placeholder="form.id ? t('settings.passwordKept') : ''"
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
          <p class="small muted">{{ t('bots.probeHint') }}</p>
          <div class="row row--wrap">
            <button type="submit" class="btn btn--primary" :disabled="!canSave || saving">
              <AppIcon name="check" />
              {{ t('common.save') }}
            </button>
            <button type="button" class="btn" @click="cancelEdit">{{ t('common.cancel') }}</button>
          </div>
        </form>

        <button v-else type="button" class="btn btn--sm bots__add" @click="startAdd">
          <AppIcon name="plus" />
          {{ t('bots.add') }}
        </button>
      </section>
      <ControlsPanel />

      <label class="switch">
        <input v-model="settings.remember" type="checkbox" />
        <span class="switch__track" />
        <span class="switch__text">
          <span class="switch__title">{{ t('connect.remember') }}</span>
          <span class="switch__hint">{{ t('connect.rememberHint') }}</span>
        </span>
      </label>
    </div>
  </section>
</template>

<style scoped>
.bots__manage {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border: 1px dashed var(--line-strong);
  border-radius: var(--r-2);
}

.bots__add {
  align-self: flex-start;
}

.bots__manage-head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

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

.bots__name {
  font-weight: 500;
}

.bots__url {
  overflow-wrap: anywhere;
}

.bots__test--ok {
  color: var(--long);
  border-color: color-mix(in srgb, var(--long) 35%, transparent);
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

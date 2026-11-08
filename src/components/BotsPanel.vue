<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import ControlsPanel from '@/components/ControlsPanel.vue'
import FilterMenu, { type FilterOption, type StatusLamp } from '@/components/FilterMenu.vue'
import BotList from '@/components/BotList.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { pushToast } from '@/composables/useToast'
import { describeError, FreqtradeApiClient, sameConnectionIdentity } from '@/data/freqtrade'
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
const removing = ref(false)
/** Set when switching to a bot whose password is not at hand. */
const passwordTarget = ref<Bot | null>(null)
const passwordDraft = ref('')
/** Only the newest switch may report its result; older requests can finish later. */
let switchRequest = 0
/** The last entry of the bot picker: it opens the manager instead of switching bots. */
const MANAGE = '__manage'
const manageOpen = ref(false)

const probeLamps = ref<Record<string, StatusLamp>>({})
let probeController: AbortController | null = null
let disposed = false

function probeBackends(open: boolean) {
  probeController?.abort()
  if (!open) return
  const controller = new AbortController()
  probeController = controller
  for (const entry of settings.bots) {
    if (entry.id === settings.activeBotId) continue
    probeLamps.value[entry.id] = 'warn'
    const api = new FreqtradeApiClient(entry)
    // Ping is public; show_config also checks the saved credentials.
    void api
      .ping({ signal: controller.signal, timeoutMs: 5000 })
      .then(() => api.showConfig({ signal: controller.signal, timeoutMs: 5000 }))
      .then(() => {
        if (!controller.signal.aborted) probeLamps.value[entry.id] = 'good'
      })
      .catch(() => {
        if (!controller.signal.aborted) probeLamps.value[entry.id] = 'bad'
      })
  }
}
onBeforeUnmount(() => {
  disposed = true
  probeController?.abort()
})

const activeBot = computed(
  () => settings.bots.find((entry) => entry.id === settings.activeBotId) ?? null,
)

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
      return { color: 'success', label: t('system.wsConnected') }
    case 'connecting':
      return { color: 'warning', label: t('bots.connecting') }
    case 'idle':
      return { color: undefined, label: t('common.unknown') }
    default:
      return { color: 'error', label: t('common.offline') }
  }
})

/** Switching is what picking a bot does; the manager is the one entry that does not. */
const botOptions = computed<FilterOption[]>(() => [
  ...settings.bots.map((entry) => ({
    value: entry.id,
    label: entry.name,
    hint: entry.id === settings.activeBotId ? t('bots.current') : undefined,
    dot:
      entry.id === settings.activeBotId
        ? activeLamp.value
        : (probeLamps.value[entry.id] ?? 'muted'),
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
  const stored = settings.bots.find((item) => item.id === entry.id)
  const storedPassword =
    stored &&
    sameConnectionIdentity(stored, { baseUrl: entry.baseUrl, username: entry.username.trim() })
      ? stored.password
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
  const currentForm = form.value
  if (!currentForm || !canSave.value || saving.value) return
  const entry = { ...currentForm }
  saving.value = true
  const localDataRevision = settings.localDataRevision
  try {
    const username = entry.username.trim()
    const stored = entry.id ? settings.bots.find((item) => item.id === entry.id) : undefined
    const sameIdentity =
      stored && sameConnectionIdentity(stored, { baseUrl: entry.baseUrl, username })
    const password = entry.password || (sameIdentity ? stored.password : '')
    const probe = new FreqtradeApiClient({ baseUrl: entry.baseUrl, username, password })
    const baseUrl = probe.baseUrl
    const name = entry.name.trim() || defaultBotName(username, baseUrl)
    const credentialsChanged =
      !stored ||
      entry.password.length > 0 ||
      baseUrl !== stored.baseUrl ||
      username !== stored.username
    // Renaming or updating the stream token stays available while the backend is offline.
    if (password && credentialsChanged) {
      await probe.ping()
      if (!settings.isLocalDataRevisionCurrent(localDataRevision)) return
      await probe.showConfig()
    }
    if (!settings.isLocalDataRevisionCurrent(localDataRevision) || form.value !== currentForm)
      return
    if (entry.id && settings.bots.find((item) => item.id === entry.id) !== stored) return
    if (entry.id === settings.activeBotId && bot.actionPending !== null) {
      pushToast(t('bots.busy'), 'bad')
      return
    }

    if (entry.id) {
      settings.updateBot(entry.id, {
        name,
        baseUrl,
        username,
        password: entry.password || undefined,
        wsToken: !sameIdentity && entry.wsToken === stored?.wsToken ? '' : entry.wsToken,
      })
      if (entry.id === settings.activeBotId) {
        await bot.connect()
      } else {
        pushToast(t('common.saved'), 'good')
      }
    } else {
      settings.addBot({ name, baseUrl, username, password: entry.password, wsToken: entry.wsToken })
      pushToast(t('bots.added', { name }), 'good')
    }
    if (form.value === currentForm) form.value = null
  } catch (error) {
    if (!settings.isLocalDataRevisionCurrent(localDataRevision)) return
    const described = describeError(error)
    pushToast(t(described.key, described.params ?? {}), 'bad')
  } finally {
    saving.value = false
  }
}

/** Probes one bot on its own client so the active connection is left alone. */
async function testConnection(entry: Bot) {
  if (!entry.password) {
    pushToast(t('bots.testNeedsPassword'), 'bad')
    return
  }
  testing.value = entry.id
  const localDataRevision = settings.localDataRevision
  const isCurrent = () => !disposed && settings.isLocalDataRevisionCurrent(localDataRevision)
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
    if (!isCurrent()) return
    await api.showConfig()
    if (!isCurrent()) return
    testResult.value = { ...testResult.value, [entry.id]: 'ok' }
    pushToast(t('bots.testOk'), 'good')
  } catch (error) {
    if (!isCurrent()) return
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
  const ok = await bot.connect()
  pushToast(ok ? t('bots.testOk') : t(bot.errorKey?.key ?? 'actions.failed'), ok ? 'good' : 'bad')
}

async function confirmRemove() {
  const entry = removeTarget.value
  if (!entry || removing.value) return
  if (bot.actionPending !== null) {
    pushToast(t('bots.busy'), 'bad')
    return
  }
  removing.value = true
  try {
    const removed = await bot.removeBot(entry.id)
    if (!removed) {
      pushToast(t(bot.errorKey?.key ?? 'actions.failed'), 'bad')
      return
    }
    removeTarget.value = null
    pushToast(t('bots.removed', { name: entry.name }), 'good')
  } catch (error) {
    const described = describeError(error)
    pushToast(t(described.key, described.params ?? {}), 'bad')
  } finally {
    removing.value = false
  }
}
</script>

<template>
  <VCard tag="section" class="panel">
    <VCardItem class="panel__head">
      <VCardTitle tag="span" class="panel__title">{{ t('bots.title') }}</VCardTitle>
      <div class="panel__actions d-flex align-center ga-2">
        <VChip size="x-small" variant="tonal" :color="connectionChip.color">
          {{ connectionChip.label }}
        </VChip>
      </div>
    </VCardItem>

    <VCardText class="panel__body d-flex flex-column ga-4">
      <!-- One picker for every bot; the last entry manages them instead of switching. -->
      <FilterMenu
        v-model="botChoice"
        :options="botOptions"
        :trigger-hint="activeBot?.baseUrl ?? ''"
        :label="t('bots.select')"
        @open-change="probeBackends"
      />

      <VForm v-if="passwordEntry" class="bots__prompt" @submit.prevent="submitPassword">
        <VTextField
          v-model="passwordDraft"
          :label="t('bots.needPassword', { name: passwordEntry.name })"
          type="password"
          autocomplete="current-password"
        />
        <div class="d-flex align-center ga-2">
          <VBtn color="primary" variant="flat" type="submit" :disabled="!passwordDraft">
            <AppIcon name="wifi" />
            {{ t('bots.connect') }}
          </VBtn>
          <VBtn type="button" @click="passwordTarget = null">
            <AppIcon name="close" />
            {{ t('common.cancel') }}
          </VBtn>
        </div>
      </VForm>

      <!-- 管理后端: add, edit, test and remove the saved backends. -->
      <VExpandTransition>
        <div v-if="manageOpen">
          <VSheet
            tag="section"
            border
            rounded="lg"
            class="d-flex flex-column ga-3 pa-3 bots__manage"
          >
            <div class="d-flex align-center ga-2">
              <VCardTitle tag="span" class="panel__title">{{ t('bots.manage') }}</VCardTitle>
              <VSpacer />
              <VBtn variant="text" type="button" @click="closeManage">
                <AppIcon name="close" />
                {{ t('common.close') }}
              </VBtn>
            </div>

            <VEmptyState v-if="!settings.bots.length" :text="t('bots.empty')" class="pa-6" />

            <BotList
              v-else
              :bots="settings.bots"
              :active-bot-id="settings.activeBotId"
              :testing="testing"
              :test-result="testResult"
              @edit="startEdit"
              @test="testConnection"
              @remove="removeTarget = $event"
              @reorder="settings.reorderBots"
            />
            <ConfirmDialog
              :open="removeTarget !== null"
              :title="t('bots.remove')"
              tone="danger"
              warning=""
              :body="t('bots.removeBody', { name: removeTarget?.name ?? '' })"
              :confirm-label="t('bots.remove')"
              confirm-icon="trash"
              :pending="removing || bot.actionPending !== null"
              @cancel="removeTarget = null"
              @confirm="confirmRemove"
            />

            <VExpandTransition>
              <div v-if="form" key="editor">
                <VForm class="bots__editor" @submit.prevent="submit">
                  <div class="bots__grid">
                    <VTextField
                      v-model="form.name"
                      :label="t('bots.name')"
                      type="text"
                      :placeholder="t('bots.nameOptional')"
                      :messages="duplicateName ? t('bots.duplicateName') : undefined"
                      @input="nameTouched = true"
                    />
                    <VTextField
                      v-model="form.baseUrl"
                      :label="t('connect.baseUrl')"
                      class="num"
                      type="text"
                      inputmode="url"
                      spellcheck="false"
                    />
                    <VTextField
                      v-model="form.username"
                      :label="t('connect.username')"
                      type="text"
                      autocomplete="username"
                    />
                    <VTextField
                      v-model="form.password"
                      :label="t('connect.password')"
                      type="password"
                      autocomplete="current-password"
                      :placeholder="form.id ? t('settings.passwordKept') : ''"
                    />
                    <VTextField
                      v-model="form.wsToken"
                      :label="t('settings.wsToken')"
                      class="num"
                      type="password"
                      autocomplete="off"
                      spellcheck="false"
                      :placeholder="t('settings.wsTokenPlaceholder')"
                    />
                  </div>
                  <p class="small muted">{{ t('bots.probeHint') }}</p>
                  <div class="d-flex align-center ga-2 flex-wrap">
                    <VBtn
                      color="primary"
                      variant="flat"
                      type="submit"
                      :disabled="!canSave || saving"
                    >
                      <AppIcon name="check" />
                      {{ t('common.save') }}
                    </VBtn>
                    <VBtn type="button" @click="cancelEdit">
                      <AppIcon name="close" />
                      {{ t('common.cancel') }}
                    </VBtn>
                  </div>
                </VForm>
              </div>
              <div v-else key="add">
                <VBtn type="button" class="bots__add" @click="startAdd">
                  <AppIcon name="plus" />
                  {{ t('bots.add') }}
                </VBtn>
              </div>
            </VExpandTransition>
          </VSheet>
        </div>
      </VExpandTransition>
      <ControlsPanel />

      <VSwitch v-model="settings.remember">
        <template #label
          ><span class="d-flex flex-column"
            ><span>{{ t('connect.remember') }}</span
            ><span class="text-caption text-medium-emphasis">{{
              t('connect.rememberHint')
            }}</span></span
          ></template
        >
      </VSwitch>
    </VCardText>
  </VCard>
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

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import FilterMenu from '@/components/FilterMenu.vue'
import { LOCALE_LABELS, SUPPORTED_LOCALES, type LocalePreference } from '@/i18n'
import { describeError, FreqtradeApiClient } from '@/data/freqtrade'
import { defaultBotName } from '@/lib/bots'
import { pushToast } from '@/composables/useToast'
import { useBotStore } from '@/stores/bot'
import { useSettingsStore } from '@/stores/settings'

const { t } = useI18n()
const settings = useSettingsStore()
const bot = useBotStore()

const baseUrl = ref(settings.baseUrl)
const username = ref(settings.username)
const password = ref(settings.password)
/** Suggested label; the operator only has to touch it when the suggestion is wrong. */
const name = ref(settings.activeBotName)
const nameTouched = ref(false)
const submitting = ref(false)

const origin = computed(() => (typeof window === 'undefined' ? '' : window.location.origin))
const languageOptions = computed(() => [
  { value: 'system' as LocalePreference, label: t('settings.languageSystem') },
  ...SUPPORTED_LOCALES.map((code) => ({ value: code, label: LOCALE_LABELS[code] })),
])
/** This form's own failure, from the probe below — the store only knows about saved bots. */
const failure = ref<ReturnType<typeof describeError> | null>(null)
const errorMessage = computed(() => {
  const described = failure.value ?? bot.errorKey
  return described ? t(described.key, described.params ?? {}) : ''
})
const canSubmit = computed(
  () => baseUrl.value.trim().length > 0 && username.value.trim() && password.value.length > 0,
)

// Suggest the name the bot would get anyway (the username); edit it only if it is wrong.
watch(username, (value) => {
  if (!nameTouched.value) name.value = value.trim()
})

watch(
  () => settings.localDataRevision,
  () => {
    nameTouched.value = false
    name.value = ''
    baseUrl.value = ''
    username.value = ''
    password.value = ''
    failure.value = null
  },
)

async function submit() {
  if (!canSubmit.value || submitting.value) return
  submitting.value = true
  failure.value = null
  const localDataRevision = settings.localDataRevision
  try {
    const credentials = {
      baseUrl: baseUrl.value,
      username: username.value.trim(),
      password: password.value,
    }
    const probe = new FreqtradeApiClient(credentials)
    const normalized = probe.baseUrl
    const label = name.value.trim() || defaultBotName(credentials.username, normalized)
    await probe.ping()
    if (!settings.isLocalDataRevisionCurrent(localDataRevision)) return
    await probe.showConfig()
    if (!settings.isLocalDataRevisionCurrent(localDataRevision)) return

    const existing = settings.bots.find(
      (entry) => entry.baseUrl === normalized && entry.username === credentials.username,
    )
    const input = { ...credentials, baseUrl: normalized, name: label }
    if (existing) {
      settings.updateBot(existing.id, input)
      settings.setActiveBot(existing.id)
    } else {
      const added = settings.addBot(input)
      settings.setActiveBot(added.id)
    }
    const ok = await bot.connect()
    if (ok) pushToast(t('bots.added', { name: label }), 'good')
  } catch (error) {
    if (settings.isLocalDataRevisionCurrent(localDataRevision)) failure.value = describeError(error)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <VContainer fluid class="connect fill-height">
    <div class="connect__lang">
      <FilterMenu
        v-model="settings.localePreference"
        :options="languageOptions"
        :label="t('settings.language')"
        trigger-label="🌐"
      />
    </div>
    <VRow justify="center" class="ma-0">
      <VCol cols="12" sm="10" md="8" lg="6" xl="4">
        <VCard>
          <VCardItem>
            <template #prepend
              ><VAvatar color="primary" variant="tonal" :size="48"
                ><AppIcon name="overview" :size="26" /></VAvatar
            ></template>
            <template #title
              ><h1 class="text-h5">{{ t('connect.title') }}</h1></template
            >
            <template #subtitle>{{ t('app.tagline') }}</template>
          </VCardItem>
          <VCardText>{{ t('connect.subtitle') }}</VCardText>
          <VForm class="pa-6 pt-0 d-flex flex-column ga-4" @submit.prevent="submit">
            <VTextField
              v-model="name"
              :label="t('bots.name')"
              autocomplete="off"
              :placeholder="t('bots.nameOptional')"
              @input="nameTouched = true"
            />
            <VTextField
              v-model="baseUrl"
              :label="t('connect.baseUrl')"
              class="num"
              inputmode="url"
              autocomplete="url"
              spellcheck="false"
            />
            <VRow dense>
              <VCol cols="12" sm="6"
                ><VTextField
                  v-model="username"
                  :label="t('connect.username')"
                  autocomplete="username"
              /></VCol>
              <VCol cols="12" sm="6"
                ><VTextField
                  v-model="password"
                  :label="t('connect.password')"
                  type="password"
                  autocomplete="current-password"
              /></VCol>
            </VRow>
            <VSwitch v-model="settings.remember"
              ><template #label
                ><span class="d-flex flex-column"
                  ><span>{{ t('connect.remember') }}</span
                  ><span class="text-caption text-medium-emphasis">{{
                    t('connect.rememberHint')
                  }}</span></span
                ></template
              ></VSwitch
            >
            <VAlert
              v-if="errorMessage"
              type="error"
              variant="tonal"
              :title="t('connect.failed')"
              :text="errorMessage"
              role="alert"
            />
            <VBtn
              color="primary"
              variant="flat"
              type="submit"
              class="connect__submit align-self-start"
              :disabled="!canSubmit || submitting"
              :loading="submitting"
              ><AppIcon name="wifi" />{{
                submitting ? t('connect.connecting') : t('connect.connect')
              }}</VBtn
            >
          </VForm>
          <VCardText class="pt-0">
            <VExpansionPanels variant="accordion">
              <VExpansionPanel :title="t('connect.corsTitle')"
                ><VExpansionPanelText>{{
                  t('connect.corsBody', { origin })
                }}</VExpansionPanelText></VExpansionPanel
              >
              <VExpansionPanel :title="t('connect.securityTitle')"
                ><VExpansionPanelText>{{
                  t('connect.securityBody')
                }}</VExpansionPanelText></VExpansionPanel
              >
            </VExpansionPanels>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>
  </VContainer>
</template>

<style scoped>
.connect {
  min-height: 100dvh;
  position: relative;
  padding-block: calc(64px + env(safe-area-inset-top, 0px))
    calc(32px + env(safe-area-inset-bottom, 0px));
}
.connect__lang {
  position: absolute;
  top: calc(16px + env(safe-area-inset-top, 0px));
  right: 16px;
}
</style>

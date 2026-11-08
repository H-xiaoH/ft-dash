<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import BotsPanel from '@/components/BotsPanel.vue'
import InlineConfirm from '@/components/InlineConfirm.vue'
import { pushToast } from '@/composables/useToast'
import { LOCALE_LABELS, SUPPORTED_LOCALES, type LocalePreference } from '@/i18n'
import { canInstall, isStandalone, offlineReady, promptInstall } from '@/pwa'
import { useBotStore } from '@/stores/bot'
import { browserZone, listZones, zoneOffsetLabel, type TimezonePreference } from '@/lib/timezone'
import { COUNT_SETTINGS, useSettingsStore } from '@/stores/settings'

const { t } = useI18n()
const route = useRoute()
const settings = useSettingsStore()
const bot = useBotStore()

const clearConfirm = ref(false)
const appVersion = __APP_VERSION__

/** An empty box says what an untouched field would use, and what the field accepts. */
const countPlaceholder = (key: keyof typeof COUNT_SETTINGS) => {
  if (key === 'tradesPerPage') return t('settings.tradesPagePlaceholder')
  const { fallback, min, max } = COUNT_SETTINGS[key]
  return t('settings.countDefault', { n: fallback, min, max })
}

const languageOptions = computed(() => [
  { value: 'system' as LocalePreference, label: t('settings.languageSystem') },
  ...SUPPORTED_LOCALES.map((code) => ({ value: code, label: LOCALE_LABELS[code] })),
])

/**
 * The browser's own zone heads the list as an explicit choice, because pinning a zone and
 * following the machine are different intents: the first survives a move, the second follows
 * one. Every IANA zone follows, and the offset rides along as right-aligned text — except on
 * UTC, whose very name already is its offset.
 *
 * The offset is a getter because the menu only reads it for the rows it renders: building all
 * ~420 up front costs about 30ms of `Intl` work before the page can paint.
 */
const timezoneOptions = computed(() => [
  { value: 'browser' as TimezonePreference, label: t('settings.timezoneBrowser'), hint: '' },
  ...listZones().map((zone) => ({
    value: zone as TimezonePreference,
    label: zone,
    get hint() {
      return zone === 'UTC' ? '' : zoneOffsetLabel(zone, settings.locale)
    },
  })),
])

async function install() {
  const accepted = await promptInstall()
  if (accepted) pushToast(t('settings.installed'), 'good')
}

async function clearData() {
  settings.clearStoredData()
  clearConfirm.value = false
  pushToast(t('actions.done'), 'good')
}
</script>

<template>
  <div class="d-flex flex-column ga-4 settings">
    <BotsPanel v-if="route.name === 'settings'" />

    <VRow dense class="settings__columns">
      <VCol cols="12" lg="6" class="d-flex flex-column ga-4">
        <VCard tag="section" class="panel">
          <VCardItem class="panel__head">
            <VCardTitle tag="span" class="panel__title">{{ t('settings.region') }}</VCardTitle>
          </VCardItem>
          <VCardText class="panel__body d-flex flex-column ga-4">
            <VSelect
              v-model="settings.localePreference"
              :items="languageOptions"
              item-title="label"
              item-value="value"
              :label="t('settings.language')"
            />
            <VAutocomplete
              v-model="settings.timezone"
              :items="timezoneOptions"
              item-title="label"
              item-value="value"
              :label="t('settings.timezone')"
              :custom-filter="
                (value, query, item) =>
                  `${value} ${item?.raw.value === 'browser' ? browserZone() : ''}`
                    .toLowerCase()
                    .includes(query.toLowerCase())
              "
            >
              <template #item="{ props: itemProps, item }">
                <VListItem v-bind="itemProps"
                  ><template #append
                    ><span class="small muted num">{{ item.hint }}</span></template
                  ></VListItem
                >
              </template>
            </VAutocomplete>
          </VCardText>
        </VCard>

        <VCard tag="section" class="panel">
          <VCardItem class="panel__head">
            <VCardTitle tag="span" class="panel__title">{{ t('settings.display') }}</VCardTitle>
          </VCardItem>
          <VCardText class="panel__body d-flex flex-column ga-4">
            <VTextField
              v-model.number="settings.dashboardOpenLimit"
              :label="t('settings.openLimit')"
              class="num"
              type="number"
              :min="COUNT_SETTINGS.dashboardOpenLimit.min"
              :max="COUNT_SETTINGS.dashboardOpenLimit.max"
              :placeholder="countPlaceholder('dashboardOpenLimit')"
              inputmode="numeric"
              @change="settings.commitCount('dashboardOpenLimit')"
            />
            <VTextField
              v-model.number="settings.dashboardClosedLimit"
              :label="t('settings.closedLimit')"
              class="num"
              type="number"
              :min="COUNT_SETTINGS.dashboardClosedLimit.min"
              :max="COUNT_SETTINGS.dashboardClosedLimit.max"
              :placeholder="countPlaceholder('dashboardClosedLimit')"
              inputmode="numeric"
              @change="settings.commitCount('dashboardClosedLimit')"
            />
            <VTextField
              v-model.number="settings.tradesPerPage"
              :label="t('settings.tradesPerPage')"
              class="num"
              type="number"
              :min="0"
              :max="COUNT_SETTINGS.tradesPerPage.max"
              :placeholder="countPlaceholder('tradesPerPage')"
              inputmode="numeric"
              @change="settings.commitCount('tradesPerPage')"
            />
            <VTextField
              v-model.number="settings.pairTablePerPage"
              :label="t('settings.pairTablePerPage')"
              class="num"
              type="number"
              :min="COUNT_SETTINGS.pairTablePerPage.min"
              :max="COUNT_SETTINGS.pairTablePerPage.max"
              :placeholder="countPlaceholder('pairTablePerPage')"
              inputmode="numeric"
              @change="settings.commitCount('pairTablePerPage')"
            />
            <VTextField
              v-model.number="settings.pollInterval"
              :label="t('settings.pollInterval')"
              class="num"
              type="number"
              :min="COUNT_SETTINGS.pollInterval.min"
              :max="COUNT_SETTINGS.pollInterval.max"
              :placeholder="countPlaceholder('pollInterval')"
              inputmode="numeric"
              @change="settings.commitCount('pollInterval')"
            />
          </VCardText>
        </VCard>
      </VCol>

      <VCol cols="12" lg="6" class="d-flex flex-column ga-4">
        <VCard tag="section" class="panel">
          <VCardItem class="panel__head">
            <VCardTitle tag="span" class="panel__title">{{ t('settings.pwaTitle') }}</VCardTitle>
            <div class="panel__actions">
              <VChip v-if="offlineReady" size="x-small" variant="tonal" color="success">{{
                t('settings.offlineReady')
              }}</VChip>
            </div>
          </VCardItem>
          <VCardText class="panel__body d-flex align-center ga-2 flex-wrap">
            <VBtn v-if="canInstall" color="primary" variant="flat" type="button" @click="install">
              <AppIcon name="install" />
              {{ t('settings.install') }}
            </VBtn>
            <VChip v-else-if="isStandalone" size="x-small" variant="tonal" color="success">{{
              t('settings.installed')
            }}</VChip>
            <p v-else class="small muted">{{ t('settings.installManual') }}</p>
            <p class="small muted settings__hint">{{ t('settings.installHint') }}</p>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>

    <VCard tag="section" class="panel">
      <VCardItem class="panel__head">
        <VCardTitle tag="span" class="panel__title">{{ t('settings.dataTitle') }}</VCardTitle>
      </VCardItem>
      <VCardText class="panel__body d-flex flex-column ga-4">
        <p class="small muted">{{ t('settings.dataHint') }}</p>
        <div class="d-flex align-center ga-2 flex-wrap">
          <VBtn color="error" type="button" @click="clearConfirm = true">
            <AppIcon name="trash" />
            {{ t('settings.clearData') }}
          </VBtn>
          <span class="small muted">
            {{ t('app.name') }} - {{ appVersion }} · {{ t('app.freqtrade') }} -
            {{ bot.showConfig?.version ?? '—' }}
          </span>
        </div>
        <InlineConfirm
          class="settings__clear-confirm"
          :open="clearConfirm"
          :message="t('settings.clearDataConfirm')"
          :confirm-label="t('common.confirm')"
          :cancel-label="t('common.cancel')"
          @confirm="clearData"
          @cancel="clearConfirm = false"
        />
      </VCardText>
    </VCard>
  </div>
</template>

<style scoped>
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
</style>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import BotsPanel from '@/components/BotsPanel.vue'
import FilterMenu from '@/components/FilterMenu.vue'
import InlineConfirm from '@/components/InlineConfirm.vue'
import { pushToast } from '@/composables/useToast'
import { LOCALE_LABELS, SUPPORTED_LOCALES, type LocalePreference } from '@/i18n'
import { canInstall, isStandalone, offlineReady, promptInstall } from '@/pwa'
import { useBotStore } from '@/stores/bot'
import { useEventsStore } from '@/stores/events'
import { browserZone, listZones, zoneOffsetLabel, type TimezonePreference } from '@/lib/timezone'
import { COUNT_SETTINGS, useSettingsStore } from '@/stores/settings'

const { t } = useI18n()
const settings = useSettingsStore()
const bot = useBotStore()
const events = useEventsStore()

const clearConfirm = ref(false)
const appVersion = __APP_VERSION__

/** An empty box says what an untouched field would use, and what the field accepts. */
const countPlaceholder = (key: keyof typeof COUNT_SETTINGS) => {
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
  { value: 'browser' as TimezonePreference, label: t('settings.timezoneBrowser') },
  ...listZones().map((zone) => ({
    value: zone as TimezonePreference,
    label: zone,
    get hint() {
      return zone === 'UTC' ? '' : zoneOffsetLabel(zone, settings.locale)
    },
  })),
])

/**
 * "Follow the browser" can also be found by the zone it resolves to — an operator who types
 * "Shanghai" deserves to see both answers. The offsets are deliberately *not* matched on:
 * every one of them contains "UTC", so searching UTC would return the entire list.
 */
const timezoneSearchText = computed<Record<string, string>>(() => ({ browser: browserZone() }))

async function install() {
  const accepted = await promptInstall()
  if (accepted) pushToast(t('settings.installed'), 'good')
}

async function clearData() {
  settings.clearStoredData()
  clearConfirm.value = false
  bot.cleanup()
  events.endScope()
  pushToast(t('actions.done'), 'good')
}
</script>

<template>
  <div class="stack settings">
    <BotsPanel />

    <div class="settings__columns">
      <div class="settings__col">
        <section class="panel">
          <div class="panel__head">
            <span class="panel__title">{{ t('settings.region') }}</span>
          </div>
          <div class="panel__body stack">
            <div class="field">
              <span class="field__label">{{ t('settings.language') }}</span>
              <FilterMenu
                v-model="settings.localePreference"
                class="settings__filter"
                :options="languageOptions"
                :label="t('settings.language')"
                align="start"
              />
            </div>
            <div class="field">
              <span class="field__label">{{ t('settings.timezone') }}</span>
              <FilterMenu
                v-model="settings.timezone"
                class="settings__filter"
                :options="timezoneOptions"
                :label="t('settings.timezone')"
                :search-text="timezoneSearchText"
                searchable
                align="start"
              />
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel__head">
            <span class="panel__title">{{ t('settings.display') }}</span>
          </div>
          <div class="panel__body stack">
            <label class="field">
              <span class="field__label">{{ t('settings.openLimit') }}</span>
              <input
                v-model.number="settings.dashboardOpenLimit"
                class="input num"
                type="number"
                :min="COUNT_SETTINGS.dashboardOpenLimit.min"
                :max="COUNT_SETTINGS.dashboardOpenLimit.max"
                :placeholder="countPlaceholder('dashboardOpenLimit')"
                inputmode="numeric"
                @change="settings.commitCount('dashboardOpenLimit')"
              />
              <span class="field__hint">{{ t('settings.openLimitHint') }}</span>
            </label>
            <label class="field">
              <span class="field__label">{{ t('settings.closedLimit') }}</span>
              <input
                v-model.number="settings.dashboardClosedLimit"
                class="input num"
                type="number"
                :min="COUNT_SETTINGS.dashboardClosedLimit.min"
                :max="COUNT_SETTINGS.dashboardClosedLimit.max"
                :placeholder="countPlaceholder('dashboardClosedLimit')"
                inputmode="numeric"
                @change="settings.commitCount('dashboardClosedLimit')"
              />
              <span class="field__hint">{{ t('settings.closedLimitHint') }}</span>
            </label>
            <label class="field">
              <span class="field__label">{{ t('settings.tradesPerPage') }}</span>
              <input
                v-model.number="settings.tradesPerPage"
                class="input num"
                type="number"
                :min="COUNT_SETTINGS.tradesPerPage.min"
                :max="COUNT_SETTINGS.tradesPerPage.max"
                :placeholder="countPlaceholder('tradesPerPage')"
                inputmode="numeric"
                @change="settings.commitCount('tradesPerPage')"
              />
              <span class="field__hint">{{ t('settings.tradesPerPageHint') }}</span>
            </label>
            <label class="field">
              <span class="field__label">{{ t('settings.pairTablePerPage') }}</span>
              <input
                v-model.number="settings.pairTablePerPage"
                class="input num"
                type="number"
                :min="COUNT_SETTINGS.pairTablePerPage.min"
                :max="COUNT_SETTINGS.pairTablePerPage.max"
                :placeholder="countPlaceholder('pairTablePerPage')"
                inputmode="numeric"
                @change="settings.commitCount('pairTablePerPage')"
              />
              <span class="field__hint">{{ t('settings.pairTablePerPageHint') }}</span>
            </label>
          </div>
        </section>
      </div>

      <div class="settings__col">
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
        <InlineConfirm
          class="settings__clear-confirm"
          :open="clearConfirm"
          :message="t('settings.clearDataConfirm')"
          :confirm-label="t('common.confirm')"
          :cancel-label="t('common.cancel')"
          @confirm="clearData"
          @cancel="clearConfirm = false"
        />
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

.settings__filter {
  width: 100%;
}

.settings__filter :deep(.filter-menu__button) {
  width: 100%;
  justify-content: space-between;
}

.settings__clear-confirm {
  justify-items: center;
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

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { ICON_PATHS } from '@/components/icons'
import { useLocale } from 'vuetify'
import AppNavigation from '@/components/AppNavigation.vue'
import GlobalNotices from '@/components/GlobalNotices.vue'
import StatusStrip from '@/components/StatusStrip.vue'
import ConnectView from '@/views/ConnectView.vue'
import PageSwiper from '@/components/PageSwiper.vue'
import { useToasts } from '@/composables/useToast'
import { applyPwaUpdate, updateAvailable } from '@/pwa'
import { NAV_ROUTES, MORE_ROUTE } from '@/router'
import { useBotStore } from '@/stores/bot'
import { useSettingsStore } from '@/stores/settings'

const { t, locale } = useI18n()
const { current: materialLocale } = useLocale()
const settings = useSettingsStore()
const bot = useBotStore()
const route = useRoute()
const router = useRouter()
const { toasts, dismissToast } = useToasts()

/**
 * Credentials were restored from storage, so the connect form is not what this visit is
 * about: hold a placeholder until the sign-in attempt has either landed or been refused.
 * It keys off the config fetch, not the whole first refresh, which can take seconds on a
 * slow link — waiting for that would trade a 160ms flash for a long blank screen.
 */
const restoredSession = ref(settings.hasCredentials)
const restoring = computed(
  () =>
    restoredSession.value &&
    !bot.showConfig &&
    bot.connection !== 'unauthorized' &&
    bot.connection !== 'unreachable',
)
/**
 * The connect screen is for "there is nobody to talk to yet", not for "a request is in
 * flight". Leaving the shell mounted while a connection attempt runs is what keeps a bot
 * switch from flashing the connect form — and from stranding the operator on an error
 * banner when that attempt happens to fail.
 */
const showConnect = computed(
  () =>
    !restoring.value &&
    bot.connection !== 'online' &&
    bot.connection !== 'connecting' &&
    /*
     * A rejected session is a sign-in problem, not a shell problem: the form comes back (with
     * the bot list and the fields still filled in) instead of a dashboard that can no longer
     * fetch anything.
     */
    (bot.connection === 'unauthorized' || !bot.showConfig),
)

/** How long the pages have to stop changing before the landing one is refreshed. */
const SETTLE_REFRESH_MS = 300

const pages = ref<InstanceType<typeof PageSwiper> | null>(null)
const pageTitle = computed(() => {
  const match = [...NAV_ROUTES, MORE_ROUTE].find((entry) => entry.name === route.name)
  return match ? t(match.titleKey) : t('app.name')
})

async function refresh() {
  await bot.refreshAll()
}

onMounted(async () => {
  locale.value = settings.locale
  materialLocale.value = settings.locale === 'zh-CN' ? 'zhHans' : 'en'
  document.documentElement.lang = settings.locale
  try {
    await bot.autoConnect()
  } finally {
    // A rejected sign-in falls back to the connect screen, which then shows why.
    restoredSession.value = false
  }
})

onBeforeUnmount(() => {
  window.clearTimeout(settleRefresh)
  bot.cleanup()
})

watch(
  () => settings.locale,
  (value) => {
    locale.value = value
    materialLocale.value = value === 'zh-CN' ? 'zhHans' : 'en'
    document.documentElement.lang = value
  },
)

watch(
  () => [settings.activeBotId, bot.connectionRevision] as const,
  ([next, revision], [previous, previousRevision]) => {
    if (!previous || !next || (next === previous && revision === previousRevision)) return
    const query = { ...route.query }
    const hadPageState = 'filter' in query || 'trade' in query
    if (!hadPageState) return
    delete query.filter
    delete query.trade
    void router.replace({ query })
  },
)

/**
 * Landing on a page refreshes what it is about to show, once the moving has stopped: a
 * wheel walk or a drag across the tabs changes pages faster than the data behind them is
 * worth fetching, so the wait collapses all of it into the one page left on screen.
 */
let settleRefresh = 0
watch(
  () => route.name,
  () => {
    window.clearTimeout(settleRefresh)
    settleRefresh = window.setTimeout(() => {
      if (bot.connection === 'online') void bot.refreshAll()
    }, SETTLE_REFRESH_MS)
  },
)
</script>

<template>
  <VApp>
    <VLayout :class="{ shell: !showConnect && !restoring }">
      <ConnectView v-if="showConnect" />

      <div v-else-if="restoring" class="booting flex-grow-1" role="status" aria-live="polite">
        <VProgressCircular indeterminate color="primary" :size="24" :width="2" />
        <span class="sr-only">{{ t('connect.connecting') }}</span>
      </div>

      <template v-else>
        <AppNavigation variant="rail" @rail-wheel="pages?.railWheel($event)" />

        <VMain tag="div" class="main">
          <StatusStrip @refresh="refresh" />
          <GlobalNotices />

          <main class="shell__body">
            <h1 class="sr-only">{{ pageTitle }}</h1>
            <PageSwiper :key="`${settings.activeBotId}|${bot.connectionRevision}`" ref="pages" />
          </main>
        </VMain>
        <AppNavigation variant="tabbar" />
      </template>
      <VSnackbar
        v-for="(toast, index) in toasts"
        :key="toast.id"
        class="ma-4"
        :model-value="true"
        :timeout="toast.ttlMs"
        :queue-index="index"
        :queue-gap="8"
        timer
        :color="toast.tone === 'good' ? 'success' : toast.tone === 'bad' ? 'error' : 'info'"
        :prepend-icon="
          ICON_PATHS[toast.tone === 'good' ? 'check' : toast.tone === 'bad' ? 'alert' : 'info']
        "
        :text="toast.message"
        variant="tonal"
        location="bottom end"
        min-width="0"
        max-width="min(440px, calc(100vw - 32px))"
        @update:model-value="!$event && dismissToast(toast.id)"
        @click="dismissToast(toast.id)"
      />

      <VBanner
        v-if="updateAvailable"
        class="update-prompt"
        :icon="ICON_PATHS.refresh"
        :text="t('notices.updateAvailable')"
        color="primary"
        bg-color="surface"
        role="status"
      >
        <template #actions>
          <VBtn variant="flat" color="primary" @click="applyPwaUpdate">{{
            t('notices.applyUpdate')
          }}</VBtn>
        </template>
      </VBanner>
    </VLayout>
  </VApp>
</template>

<style scoped>
.update-prompt {
  position: fixed;
  top: calc(env(safe-area-inset-top, 0px) + var(--sp-3));
  inset-inline: var(--sp-4);
  z-index: 61;
  box-shadow: 0 12px 30px rgb(0 0 0 / 45%);
}

/* Held for the few hundred milliseconds a stored sign-in takes. */
.booting {
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  place-items: center;
}

.shell {
  --shell-pad: 16px;
  height: 100dvh;
  overflow: hidden;
}
.main {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding-bottom: calc(var(--v-layout-bottom) + env(safe-area-inset-bottom, 0px));
}
.main > :not(.shell__body) {
  flex-shrink: 0;
}
.shell__body {
  min-width: 0;
  min-height: 0;
  flex: 1;
}
@media (width < 720px) {
  .shell {
    --shell-pad: 12px;
  }
}
</style>

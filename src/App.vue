<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import StatusStrip from '@/components/StatusStrip.vue'
import ConnectView from '@/views/ConnectView.vue'
import { useToasts } from '@/composables/useToast'
import { NAV_ROUTES } from '@/router'
import { useBotStore } from '@/stores/bot'
import { useEventsStore } from '@/stores/events'
import { useSettingsStore } from '@/stores/settings'
import { applyUpdate, needRefresh } from '@/pwa'

const { t, locale } = useI18n()
const settings = useSettingsStore()
const bot = useBotStore()
const events = useEventsStore()
const route = useRoute()
const router = useRouter()
const { toasts, dismissToast } = useToasts()

const showConnect = computed(() => bot.connection !== 'online' && !bot.showConfig)
const connectionBanner = computed(() => {
  if (bot.connection === 'online') return null
  if (bot.connection === 'connecting') return t('common.loading')
  if (bot.connection === 'unauthorized') return t('errors.auth')
  if (bot.connection === 'unreachable') return t('errors.cors')
  return null
})

const pageTitle = computed(() => {
  const match = NAV_ROUTES.find((entry) => entry.name === route.name)
  return match ? t(match.titleKey) : t('app.name')
})

async function refresh() {
  await bot.refreshAll()
}

/** The live tape lives on the System page. */
function openTape() {
  if (route.name !== 'system') void router.push('/system')
}

onMounted(async () => {
  locale.value = settings.locale
  document.documentElement.lang = settings.locale
  await bot.autoConnect()
})

onBeforeUnmount(() => {
  bot.cleanup()
})

watch(
  () => settings.locale,
  (value) => {
    locale.value = value
    document.documentElement.lang = value
  },
)

watch(
  () => route.name,
  () => {
    events.markRead()
  },
)
</script>

<template>
  <ConnectView v-if="showConnect" />

  <div v-else class="shell">
    <nav class="rail" :aria-label="t('app.name')">
      <div class="rail__brand" :title="t('app.tagline')">
        <span class="rail__dot" />
      </div>
      <RouterLink
        v-for="item in NAV_ROUTES"
        :key="item.name"
        :to="item.path"
        class="rail__item"
        :class="{ 'is-active': route.name === item.name }"
        :aria-current="route.name === item.name ? 'page' : undefined"
        :title="t(item.titleKey)"
      >
        <AppIcon :name="item.icon" :size="18" />
        <span class="rail__label">{{ t(item.titleKey) }}</span>
      </RouterLink>
    </nav>

    <div class="main">
      <StatusStrip @refresh="refresh" @open-tape="openTape" />

      <div v-if="connectionBanner" class="banner banner--bad shell__banner" role="status">
        <AppIcon name="alert" :size="18" />
        <div>
          <div class="banner__title">{{ t('connect.failed') }}</div>
          <div>{{ connectionBanner }}</div>
        </div>
        <div class="spacer" />
        <button type="button" class="btn btn--sm" @click="refresh">{{ t('common.retry') }}</button>
      </div>

      <div v-if="needRefresh" class="banner banner--warn shell__banner" role="status">
        <AppIcon name="download" :size="18" />
        <div>{{ t('settings.updateAvailable') }}</div>
        <div class="spacer" />
        <button type="button" class="btn btn--sm btn--primary" @click="applyUpdate">
          {{ t('settings.update') }}
        </button>
      </div>

      <div class="shell__body">
        <main class="content">
          <h1 class="sr-only">{{ pageTitle }}</h1>
          <RouterView v-slot="{ Component }">
            <component :is="Component" />
          </RouterView>
        </main>
      </div>
    </div>

    <nav class="tabbar" :aria-label="t('app.name')">
      <RouterLink
        v-for="item in NAV_ROUTES"
        :key="item.name"
        :to="item.path"
        class="tabbar__item"
        :class="{ 'is-active': route.name === item.name }"
        :aria-current="route.name === item.name ? 'page' : undefined"
      >
        <AppIcon :name="item.icon" :size="19" />
        <span>{{ t(item.titleKey) }}</span>
      </RouterLink>
    </nav>
  </div>

  <div class="toast-stack" aria-live="polite">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="toast"
      :class="`toast--${toast.tone}`"
      @click="dismissToast(toast.id)"
    >
      {{ toast.message }}
    </div>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  grid-template-columns: var(--rail-w) minmax(0, 1fr);
}

.rail {
  position: sticky;
  top: 0;
  height: 100vh;
  height: 100dvh;
  border-right: 1px solid var(--line);
  background: var(--ink-850);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--sp-3) 0;
  gap: 2px;
  z-index: 30;
}

.rail__brand {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  border: 1px solid var(--line-strong);
  display: grid;
  place-items: center;
  margin-bottom: var(--sp-3);
}

.rail__dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--accent);
}

.rail__item {
  width: 46px;
  padding: 7px 0;
  border-radius: var(--r-1);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  color: var(--text-3);
  text-decoration: none;
  font-size: 10px;
  text-align: center;
}

.rail__item:hover {
  background: var(--ink-800);
  color: var(--text);
}

.rail__item.is-active {
  background: color-mix(in srgb, var(--accent) 14%, var(--ink-800));
  color: var(--accent);
}

.rail__label {
  line-height: 1.2;
}

.main {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.shell__body {
  padding: var(--sp-4);
  min-width: 0;
}

.content {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}

.shell__banner {
  margin: var(--sp-4) var(--sp-4) 0;
}

.tabbar {
  display: none;
}

@media (max-width: 900px) {
  .shell {
    grid-template-columns: minmax(0, 1fr);
  }

  .rail {
    display: none;
  }

  .shell__body {
    padding: var(--sp-3);
    padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px));
  }

  .tabbar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-between;
    background: color-mix(in srgb, var(--ink-850) 94%, transparent);
    backdrop-filter: blur(8px);
    border-top: 1px solid var(--line);
    padding: 6px 4px calc(6px + env(safe-area-inset-bottom, 0px));
    z-index: 30;
  }

  .tabbar__item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 4px 0;
    color: var(--text-3);
    text-decoration: none;
    font-size: 10px;
  }

  .tabbar__item.is-active {
    color: var(--accent);
  }
}
</style>

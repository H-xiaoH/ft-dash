<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import StatusStrip from '@/components/StatusStrip.vue'
import ConnectView from '@/views/ConnectView.vue'
import { usePageDrag } from '@/composables/usePageDrag'
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
const showConnect = computed(
  () => !restoring.value && bot.connection !== 'online' && !bot.showConfig,
)

/** Page-to-page swiping; it also owns the tab block's travel. */
const {
  dragOffset,
  dragTransition,
  indicatorFraction,
  indicatorTransition,
  handoff,
  neighbor,
  finishHandoff,
  warmPageChunks,
} = usePageDrag(() => showConnect.value)
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

/**
 * Position of the current page in the nav order: drives the sliding indicator and the
 * direction a mobile page transition travels.
 */
const navIndex = computed(() =>
  Math.max(
    0,
    NAV_ROUTES.findIndex((item) => item.name === route.name),
  ),
)
const pageDirection = ref(1)
let previousIndex = navIndex.value

watch(navIndex, (next) => {
  pageDirection.value = next >= previousIndex ? 1 : -1
  previousIndex = next
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
  try {
    await bot.autoConnect()
  } finally {
    // A rejected sign-in falls back to the connect screen, which then shows why.
    restoredSession.value = false
  }
  // Off the critical path: the first paint and the first API burst go first.
  window.setTimeout(warmPageChunks, 1200)
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

  <div v-else-if="restoring" class="booting" role="status" aria-live="polite">
    <span class="booting__dot" />
    <span class="sr-only">{{ t('connect.connecting') }}</span>
  </div>

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
      <span
        class="rail__indicator"
        aria-hidden="true"
        :style="{ transform: `translateY(calc(${navIndex} * var(--rail-item)))` }"
      />
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
          <!--
            The travel direction lives on this stable host, not on the page itself:
            an inline custom property is baked in when a page renders, so a leaving
            page would animate with the direction of the *previous* navigation.
          -->
          <div
            class="page-host"
            :style="{
              '--page-enter': `${handoff ? 0 : pageDirection * 100}%`,
              '--page-leave': `${handoff ? 0 : pageDirection * -100}%`,
            }"
          >
            <div
              class="page-track"
              :style="{ transform: `translateX(${dragOffset}px)`, transition: dragTransition }"
            >
              <RouterView v-slot="{ Component }">
                <!--
                  A finger-committed swipe has already moved the pages into place, so that
                  navigation gets a zero-length transition with no displacement. It stays a
                  real transition: `css: false` would resolve the leave synchronously inside
                  the render and re-enter the renderer.
                -->
                <Transition
                  name="page"
                  :duration="handoff ? 0 : undefined"
                  @after-enter="finishHandoff"
                >
                  <component :is="Component" />
                </Transition>
              </RouterView>
              <div
                v-if="neighbor"
                class="page-neighbor"
                :style="{ transform: `translateX(${neighbor.side * 100}%)` }"
              >
                <component :is="neighbor.component" />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>

    <nav class="tabbar" :style="{ '--nav-count': NAV_ROUTES.length }" :aria-label="t('app.name')">
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
      <span
        class="tabbar__indicator"
        aria-hidden="true"
        :style="{
          transform: `translateX(calc(${navIndex + indicatorFraction} * 100%))`,
          transition: indicatorTransition,
        }"
      />
    </nav>
  </div>

  <TransitionGroup name="toast" tag="div" class="toast-stack" aria-live="polite">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="toast"
      :class="`toast--${toast.tone}`"
      @click="dismissToast(toast.id)"
    >
      {{ toast.message }}
      <!-- The countdown itself: same length as the dismissal that is already scheduled. -->
      <span
        class="toast__timer"
        aria-hidden="true"
        :style="{ animationDuration: `${toast.ttlMs}ms` }"
      />
    </div>
  </TransitionGroup>
</template>

<style scoped>
/* Held for the few hundred milliseconds a stored sign-in takes. */
.booting {
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  place-items: center;
}

.booting__dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent);
  animation: boot-pulse 1.4s ease-in-out infinite;
}

@keyframes boot-pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.85);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}

.shell {
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  grid-template-columns: var(--rail-w) minmax(0, 1fr);
}

.rail {
  --rail-item: 48px;
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
  height: 46px;
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
  position: relative;
  z-index: 1;
}

/* The active background is a single block that slides between items. */
.rail__indicator {
  position: absolute;
  /* Where the first item starts: rail padding + brand (32px) + the brand gap (2px). */
  top: calc(2 * var(--sp-3) + 34px);
  width: 46px;
  height: 46px;
  border-radius: var(--r-1);
  background: color-mix(in srgb, var(--accent) 14%, var(--ink-800));
  transition: transform var(--dur-slide) var(--ease-out-strong);
  pointer-events: none;
  /* Its own layer, so following the finger stays on whole device pixels. */
  will-change: transform;
}

/* No hover plate: it painted over the sliding indicator. The label just brightens. */
.rail__item:hover {
  color: var(--text);
}

.rail__item.is-active {
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

/*
 * The page transition slides its child, which would widen the scrollable area
 * mid-animation and make phones jitter sideways. `clip` trims it without
 * creating a scroll container, so sticky/fixed children are unaffected.
 */
.page-host {
  min-width: 0;
  overflow-x: clip;
}

/* The page and its neighbour ride this track, moved only by the finger. */
.page-track {
  position: relative;
  min-width: 0;
  will-change: transform;
}

/*
 * The neighbour is absolutely placed so it never adds to the document height — the real
 * page keeps defining the layout while the pair slides.
 */
.page-neighbor {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
}

.shell__banner {
  margin: var(--sp-4) var(--sp-4) 0;
}

.tabbar {
  display: none;
}

/*
 * Page transition: phones slide sideways in the direction you navigated. Only the slide
 * is animated — the cross-fade that used to ride along read as a flash.
 */
.page-enter-active,
.page-leave-active {
  transition: transform var(--dur-slide) var(--ease-out-strong);
}

/*
 * The two pages trade places at the same time — the same full-width slide the finger
 * produces — so the outgoing one leaves the flow instead of stacking under the new page
 * and doubling the scroll height for a frame.
 */
.page-leave-active {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
}

.page-enter-from {
  transform: translateX(var(--page-enter, 0));
}

.page-leave-to {
  transform: translateX(var(--page-leave, 0));
}

@media (min-width: 901px) {
  /* Wide screens have no slide, so the page swaps straight away. */
  .page-enter-active,
  .page-leave-active {
    transition: none;
  }

  .page-enter-from,
  .page-leave-to {
    transform: none;
  }
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
    /*
     * Icon and label fade between muted and accent instead of snapping, in step with the
     * block sliding underneath them (the icon inherits this colour change).
     */
    transition: color var(--dur-slide) ease;
    text-decoration: none;
    font-size: 10px;
    position: relative;
    z-index: 1;
  }

  /* One sliding block behind the active tab. */
  .tabbar__indicator {
    position: absolute;
    /* Matches the tab box rather than the full bar, so the rounded corners stay visible. */
    top: 6px;
    bottom: calc(6px + env(safe-area-inset-bottom, 0px));
    left: 4px;
    /* One slot per tab, derived from the route table rather than hard-coded. */
    width: calc((100% - 8px) / var(--nav-count, 7));
    border-radius: var(--r-1);
    background: color-mix(in srgb, var(--accent) 14%, var(--ink-800));
    transition: transform var(--dur-slide) var(--ease-out-strong);
    pointer-events: none;
    /* Its own layer, so following the finger stays on whole device pixels. */
    will-change: transform;
  }

  .tabbar__item.is-active {
    color: var(--accent);
  }
}
</style>

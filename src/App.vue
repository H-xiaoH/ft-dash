<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView, useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import AppNavigation from '@/components/AppNavigation.vue'
import StatusStrip from '@/components/StatusStrip.vue'
import ConnectView from '@/views/ConnectView.vue'
import { usePageDrag } from '@/composables/usePageDrag'
import { useToasts } from '@/composables/useToast'
import { NAV_ROUTES } from '@/router'
import { useBotStore } from '@/stores/bot'
import { useEventsStore } from '@/stores/events'
import { useSettingsStore } from '@/stores/settings'

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
    !bot.showConfig,
)

/** How long the pages have to stop changing before the landing one is refreshed. */
const SETTLE_REFRESH_MS = 300

/** Page-to-page swiping; it also owns the tab block's travel. */
const {
  dragOffset,
  dragTransition,
  dragging,
  indicatorFraction,
  indicatorTransition,
  handoff,
  neighbors,
  finishHandoff,
  loadAllPages,
  onRailWheel,
} = usePageDrag(() => showConnect.value)
const connectionBanner = computed(() => {
  /*
   * Failures only. A connect in flight is not news — the status strip already shows it —
   * and this banner is titled "connection failed", so rendering it mid-switch told the
   * operator that the bot they had just picked was broken.
   */
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
  window.setTimeout(loadAllPages, 1200)
})

onBeforeUnmount(() => {
  window.clearTimeout(settleRefresh)
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
  () => settings.activeBotId,
  (next, previous) => {
    if (!previous || !next || next === previous) return
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
    events.markRead()
    window.clearTimeout(settleRefresh)
    settleRefresh = window.setTimeout(() => {
      if (bot.connection === 'online') void bot.refreshAll()
    }, SETTLE_REFRESH_MS)
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
    <AppNavigation
      variant="rail"
      :active-route-name="route.name"
      :nav-index="navIndex"
      :indicator-fraction="indicatorFraction"
      :indicator-transition="indicatorTransition"
      :dragging="dragging"
      @rail-wheel="onRailWheel"
    />

    <div class="main">
      <StatusStrip @refresh="refresh" @open-tape="openTape" />

      <div v-if="connectionBanner" class="banner banner--bad shell__banner" role="status">
        <AppIcon name="alert" :size="18" />
        <div>
          <div class="banner__title">{{ t('connect.failed') }}</div>
          <div>{{ connectionBanner }}</div>
        </div>
        <div class="spacer" />
        <button type="button" class="btn btn--sm" @click="router.push('/settings')">
          {{ t('bots.openSettings') }}
        </button>
        <button type="button" class="btn btn--sm" @click="refresh">{{ t('common.retry') }}</button>
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
              '--page-enter': `${handoff ? 0 : pageDirection}`,
              '--page-leave': `${handoff ? 0 : -pageDirection}`,
            }"
          >
            <!-- A bot switch is a new data source, so page-local filters and drawers start fresh. -->
            <div
              :key="settings.activeBotId"
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
              <!--
                Every other page, held on the track in its own slot: the finger drags
                across them and a wheel walks them, so none of them is ever still loading
                when the strip reaches it. The key is the rail index, which keeps every
                page a switch does not touch on its own instance — the one you leave and
                the one you enter are rebuilt, and that costs nothing because their code
                is already resolved. Inert, so a page that is off screen stays out of the
                tab order and the accessibility tree.
              -->
              <div
                v-for="page in neighbors"
                :key="page.index"
                class="page-neighbor"
                :data-slot="page.slot"
                inert
                :style="{ transform: `translateX(${page.slot * 100}%)` }"
              >
                <component :is="page.component" />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>

    <AppNavigation
      variant="tabbar"
      :active-route-name="route.name"
      :nav-index="navIndex"
      :indicator-fraction="indicatorFraction"
      :indicator-transition="indicatorTransition"
      :dragging="dragging"
    />
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
  /* The frame's padding, and with it the gutter each page carries on both sides. */
  --shell-pad: var(--sp-4);
  --shell-pad-bottom: var(--sp-4);
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  grid-template-columns: var(--rail-w) minmax(0, 1fr);
}

.main {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.shell__body {
  padding: var(--shell-pad);
  padding-bottom: var(--shell-pad-bottom);
  min-width: 0;
}

.content {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}

/*
 * Clips both axes, for two reasons. A transition slides its child, which would widen the
 * scrollable area mid-animation and make phones jitter sideways. And a parked page is
 * absolutely placed, which does not take it out of the document's scrollable overflow: clip
 * it, or every page can be scrolled past its own content, down the tallest parked page.
 *
 * `clip` rather than `hidden`: it trims without creating a scroll container, so sticky and
 * fixed children are unaffected.
 */
.page-host {
  min-width: 0;
  overflow: clip;
}

/* The current page and the parked ones ride this track, moved only by the finger. */
.page-track {
  position: relative;
  min-width: 0;
  will-change: transform;
}

/*
 * The sideways gutter belongs to each page rather than to the frame around the track, so two
 * pages meeting mid-swipe keep twice this between them and read as two sheets.
 */
.page-track > * {
  padding-inline: var(--shell-pad);
}

/*
 * Parked pages are absolutely placed so the real page keeps defining the layout while the
 * strip slides across them, and their paint is contained: dragging the strip repaints the
 * pages coming into view, not all six.
 */
.page-neighbor {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  contain: paint;
}

.shell__banner {
  margin: var(--sp-4) var(--sp-4) 0;
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
  transform: translateX(calc(var(--page-enter, 0) * 100%));
}

.page-leave-to {
  transform: translateX(calc(var(--page-leave, 0) * 100%));
}

@media (min-width: 901px) {
  /*
   * Wide screens slide the way the rail reads — a whole page up or down, the same full-page
   * move a phone gets from its bottom bar.
   *
   * The two directions travel different distances, because "a page" means a different thing
   * to each. The incoming page only has to start below the fold, so a viewport is enough,
   * while the outgoing one has to clear the top of the window: a viewport would leave the rest
   * of a tall page (统计 is nearly two screens) hanging in the frame, which reads as the
   * previous page never having left.
   */
  .page-enter-from {
    transform: translateY(calc(var(--page-enter, 0) * 100dvh));
  }

  .page-leave-to {
    transform: translateY(calc(var(--page-leave, 0) * 100%));
  }
}

@media (max-width: 900px) {
  .shell {
    --shell-pad: var(--sp-3);
    --shell-pad-bottom: calc(72px + env(safe-area-inset-bottom, 0px));
    grid-template-columns: minmax(0, 1fr);
  }

  .shell__body {
    padding: var(--shell-pad);
    padding-bottom: var(--shell-pad-bottom);
  }
}
</style>

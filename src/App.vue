<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
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

/** A gesture that belongs to a dialog, or to a component that owns horizontal drags. */
function gestureIsTaken(target: EventTarget | null) {
  if (showConnect.value || document.querySelector('[role="dialog"]')) return true
  return target instanceof Element && target.closest('[data-scrub]') !== null
}

/*
 * Page drag. The neighbouring page is mounted beside the current one and the pair slides
 * with the finger; releasing decides whether the swipe completes or springs back. That
 * costs a live component per drag, so the neighbour is mounted only once the gesture is
 * clearly sideways — and only then does the page take the gesture from the scroller.
 */

/** Sideways travel before the page claims the gesture. */
const DRAG_CLAIM_PX = 10
/** Share of the viewport that completes the swipe on release. */
const DRAG_COMMIT_RATIO = 0.35
/** A quick flick completes it without travelling that far. */
const DRAG_FLICK_PX_PER_MS = 0.5
const DRAG_SETTLE = 'transform 180ms cubic-bezier(0.22, 0.61, 0.36, 1)'

const dragOffset = ref(0)
const dragWidth = ref(0)
const dragTransition = ref('none')
/** True while a finger owns the pages: the tab block must track it exactly, not ease. */
const dragging = ref(false)
/** True while a finger-committed swipe swaps pages, so nothing animates twice. */
const handoff = ref(false)
const neighbor = shallowRef<{ side: 1 | -1; component: unknown } | null>(null)

/** Drag travel in fractions of a page; also moves the tab indicator. */
const dragFraction = computed(() => {
  const width = dragWidth.value
  if (!width) return 0
  return Math.max(-1, Math.min(1, -dragOffset.value / width))
})

/** The page a committed swipe is heading for, until the router gets there. */
const dragTarget = ref<string | null>(null)

/**
 * How far the block itself has travelled, in tab slots. The travel has to be dropped the
 * moment the swipe's target becomes the current page: the index moves at the same time,
 * and counting both would send the block one slot past the tab it is heading for.
 */
const indicatorFraction = computed(() =>
  dragTarget.value !== null && route.name === dragTarget.value ? 0 : dragFraction.value,
)

/**
 * The indicator follows the finger one for one (its stylesheet easing would otherwise
 * leave it chasing the touch and reading as a jitter), eases with the pages while they
 * settle, and keeps its own slide between taps.
 */
const indicatorTransition = computed(() => {
  if (dragging.value) return 'none'
  return dragTransition.value === 'none' ? undefined : dragTransition.value
})

let gesture: {
  target: EventTarget | null
  startX: number
  startY: number
  claimed: boolean
  lastX: number
  lastAt: number
  velocity: number
} | null = null
/** The neighbour's code, in flight from the moment the gesture is claimed. */
let neighborLoad: Promise<{ side: 1 | -1; component: unknown } | null> | null = null
/** A committed swipe is still sliding into place; a new gesture would fight over the track. */
let settling = false

/** A sideways scroller under the finger keeps the gesture for itself. */
function hasHorizontalScroll(target: EventTarget | null) {
  for (let node = target instanceof Element ? target : null; node; node = node.parentElement) {
    if (node.scrollWidth - node.clientWidth < 4) continue
    const overflow = getComputedStyle(node).overflowX
    if (overflow === 'auto' || overflow === 'scroll') return true
  }
  return false
}

/**
 * The page one step along the rail. Resolved from the router's own table, so the drag
 * never keeps a second copy of the lazy import list.
 */
async function loadNeighbor(delta: number) {
  const target = NAV_ROUTES[navIndex.value + delta]
  if (!target) return null
  const entry = router.resolve(target.path).matched.at(-1)?.components?.default as unknown
  if (!entry) return null
  const resolved = typeof entry === 'function' ? await (entry as () => Promise<unknown>)() : entry
  const component = (resolved as { default?: unknown })?.default ?? resolved
  return { side: (delta > 0 ? 1 : -1) as 1 | -1, component }
}

/** Waits out the settle animation, so the page swap happens after the slide. */
const settle = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Pulls in the other pages' code once the first data load is done. A swipe can only show
 * a neighbour whose chunk is already here, and the very first swipe to an unvisited page
 * would otherwise slide into empty space.
 */
function warmPageChunks() {
  for (const item of NAV_ROUTES) {
    const entry = router.resolve(item.path).matched.at(-1)?.components?.default as unknown
    // A prefetch that fails is not worth reporting — the page will ask again when opened.
    if (typeof entry === 'function') void (entry as () => Promise<unknown>)().catch(() => {})
  }
}

function onTouchStart(event: TouchEvent) {
  gesture = null
  if (settling || event.touches.length !== 1 || gestureIsTaken(event.target)) return
  const touch = event.touches[0]
  gesture = {
    target: event.target,
    startX: touch.clientX,
    startY: touch.clientY,
    claimed: false,
    lastX: touch.clientX,
    lastAt: performance.now(),
    velocity: 0,
  }
}

function onTouchMove(event: TouchEvent) {
  const current = gesture
  const touch = event.touches[0]
  if (!current || !touch) return

  const dx = touch.clientX - current.startX
  const dy = touch.clientY - current.startY

  if (!current.claimed) {
    // Until the gesture is clearly sideways, the scroller owns it.
    if (Math.abs(dx) < DRAG_CLAIM_PX || Math.abs(dx) < Math.abs(dy) * 1.2) return
    if (hasHorizontalScroll(current.target)) {
      gesture = null
      return
    }
    current.claimed = true
    dragging.value = true
    dragWidth.value = document.querySelector('.page-host')?.clientWidth ?? window.innerWidth
    dragTransition.value = 'none'
    neighborLoad = loadNeighbor(dx < 0 ? 1 : -1)
    void neighborLoad
      .then((loaded) => {
        // A chunk that lands after the finger left must not resurrect the drag.
        if (loaded && gesture === current) neighbor.value = loaded
      })
      // A neighbour that cannot be fetched just leaves the drag with nothing to show.
      .catch(() => {})
  }

  // The page owns the gesture now, so nothing behind it may scroll.
  event.preventDefault()

  const now = performance.now()
  current.velocity = (touch.clientX - current.lastX) / Math.max(1, now - current.lastAt)
  current.lastX = touch.clientX
  current.lastAt = now

  const side = dx < 0 ? 1 : -1
  // One page per drag: follow the finger, and resist only where the rail ends.
  dragOffset.value = NAV_ROUTES[navIndex.value + side] ? dx : dx * 0.25
}

function onTouchEnd(event: TouchEvent) {
  const current = gesture
  gesture = null
  if (!current?.claimed) return

  const touch = event.changedTouches[0]
  const dx = touch ? touch.clientX - current.startX : dragOffset.value
  const side = dx < 0 ? 1 : -1
  const width = dragWidth.value || window.innerWidth
  const route = NAV_ROUTES[navIndex.value + side]
  const flicked =
    Math.sign(current.velocity) === Math.sign(dx) &&
    Math.abs(current.velocity) > DRAG_FLICK_PX_PER_MS
  const committed = !!route && (Math.abs(dx) > width * DRAG_COMMIT_RATIO || flicked)

  if (committed && route) void commitDrag(side, route.path)
  else cancelDrag()
}

async function commitDrag(side: 1 | -1, path: string) {
  settling = true
  dragging.value = false
  dragTarget.value = NAV_ROUTES[navIndex.value + side]?.name ?? null
  dragTransition.value = DRAG_SETTLE
  dragOffset.value = -side * (dragWidth.value || window.innerWidth)
  await settle()
  try {
    // The neighbour must be on screen before the router takes over, otherwise the swap
    // would land on an empty track.
    await neighborLoad
    handoff.value = true
    await router.push(path)
    // The reset waits for the enter to finish — clearing the handoff earlier re-arms the
    // slide, and the page you just swiped to slides in a second time. This is the safety
    // net for an enter that never reports back.
    handoffTimer = window.setTimeout(finishHandoff, 600)
  } catch {
    finishHandoff()
  }
}

let handoffTimer = 0

/**
 * Ends a finger-committed swap. Runs on the transition's `after-enter`, once the enter
 * classes are gone: the neighbour was showing this page here, so the real one lands on
 * the same spot and only then do the direction variables come back.
 */
function finishHandoff() {
  if (!settling) return
  window.clearTimeout(handoffTimer)
  handoffTimer = 0
  dragTransition.value = 'none'
  dragOffset.value = 0
  dragTarget.value = null
  neighbor.value = null
  handoff.value = false
  settling = false
}

function cancelDrag() {
  dragging.value = false
  dragTransition.value = DRAG_SETTLE
  dragOffset.value = 0
  setTimeout(() => {
    if (gesture) return
    dragTransition.value = 'none'
    neighbor.value = null
  }, 200)
}

onMounted(async () => {
  locale.value = settings.locale
  document.documentElement.lang = settings.locale
  window.addEventListener('touchstart', onTouchStart, { passive: true })
  window.addEventListener('touchmove', onTouchMove, { passive: false })
  window.addEventListener('touchend', onTouchEnd, { passive: true })
  await bot.autoConnect()
  // Off the critical path: the first paint and the first API burst go first.
  window.setTimeout(warmPageChunks, 1200)
})

onBeforeUnmount(() => {
  window.removeEventListener('touchstart', onTouchStart)
  window.removeEventListener('touchmove', onTouchMove)
  window.removeEventListener('touchend', onTouchEnd)
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
  transition: transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1);
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
  transition: transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1);
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
    transition: transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1);
    pointer-events: none;
    /* Its own layer, so following the finger stays on whole device pixels. */
    will-change: transform;
  }

  .tabbar__item.is-active {
    color: var(--accent);
  }
}
</style>

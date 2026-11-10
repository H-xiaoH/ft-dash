<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  ref,
  shallowRef,
  shallowReactive,
  watch,
} from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { useRoute, useRouter, type RouteComponent } from 'vue-router'
import { Swiper, SwiperSlide } from 'swiper/vue'
import type { Swiper as SwiperInstance } from 'swiper'
import 'swiper/css'
import { NAV_ROUTES, MORE_ROUTE, MOBILE_NAV_ROUTES, SECONDARY_ROUTES } from '@/router'
import { WIDE_LAYOUT_QUERY } from '@/lib/layout'
import AppIcon from './AppIcon.vue'
import { useI18n } from 'vue-i18n'
import { navigatePage } from '@/lib/navigation'

const route = useRoute()
const router = useRouter()
const wide = useMediaQuery(WIDE_LAYOUT_QUERY)
const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
const swiper = shallowRef<SwiperInstance>()
const { t } = useI18n()
const secondary = computed(() => SECONDARY_ROUTES.some((page) => page.name === route.name))
const navigation = computed(() =>
  wide.value
    ? route.name === 'more'
      ? [...NAV_ROUTES, MORE_ROUTE]
      : NAV_ROUTES
    : MOBILE_NAV_ROUTES,
)
const morePage = ref(secondary.value ? String(route.name) : 'more')
const moreMotion = ref(false)
const currentIndex = computed(() =>
  Math.max(
    0,
    navigation.value.findIndex(
      (page) => page.name === (!wide.value && secondary.value ? 'more' : route.name),
    ),
  ),
)
const visited = ref(new Set([String(route.name)]))
const loadedPages = new Set<string>()
const loadPages = Object.fromEntries(
  [...NAV_ROUTES, MORE_ROUTE].map((page) => {
    const component = router.resolve(page.path).matched.at(-1)!.components!.default!
    const load =
      typeof component === 'function'
        ? (component as () => Promise<RouteComponent>)
        : () => Promise.resolve(component)
    return [
      page.name,
      async () => {
        const view = await load()
        loadedPages.add(page.name)
        return view
      },
    ]
  }),
)
const pages = Object.fromEntries(
  Object.entries(loadPages).map(([name, load]) => [name, defineAsyncComponent(load)]),
)
const targets = shallowReactive(new Map<string, HTMLElement>())
function setTarget(name: string, element: unknown) {
  if (element instanceof HTMLElement) targets.set(name, element)
  else targets.delete(name)
}
const moreNames = computed(() =>
  wide.value ? ['more'] : ['more', ...SECONDARY_ROUTES.map((page) => page.name)],
)
const mountedPages = new Set<string>()
function isMorePage(name: unknown) {
  return name === 'more' || SECONDARY_ROUTES.some((page) => page.name === name)
}
const scrollPositions = new Map<string, number>()
function saveScroll(event: Event) {
  const element = event.target as HTMLElement
  // Hiding a More frame can emit a scroll event with a reset offset.
  if (element.inert && element.classList.contains('more-stack__page')) return
  scrollPositions.set(element.dataset.page!, element.scrollTop)
}
async function restoreScroll() {
  await nextTick()
  const element = swiper.value?.el.querySelector<HTMLElement>(
    `[data-page="${route.name as string}"]`,
  )
  if (element) element.scrollTop = scrollPositions.get(String(route.name)) ?? 0
}
function backToMore() {
  if (router.options.history.state.back === '/more') router.back()
  else void router.replace('/more')
}

async function showMorePage(name: string) {
  const outgoing = targets.get(morePage.value)?.parentElement
  if (name !== morePage.value && outgoing && !outgoing.inert) {
    scrollPositions.set(morePage.value, outgoing.scrollTop)
  }
  const moveFocus =
    moreMotion.value &&
    (document.activeElement === document.body || outgoing?.contains(document.activeElement))
  morePage.value = name
  await restoreScroll()
  if (
    moveFocus &&
    route.name === name &&
    (document.activeElement === document.body || outgoing?.contains(document.activeElement))
  ) {
    targets.get(name)?.parentElement?.focus({ preventScroll: true })
  }
}

function pageMounted(name: string) {
  mountedPages.add(name)
  if (!wide.value && route.name === name && isMorePage(name) && morePage.value !== name) {
    void showMorePage(name)
  } else {
    void restoreScroll()
  }
}

watch(
  () => route.name,
  (name, previous) => {
    moreMotion.value = !wide.value && isMorePage(previous) && isMorePage(name)
    visited.value = new Set([...visited.value, String(name)])
    if (isMorePage(name) && (!moreMotion.value || mountedPages.has(String(name)))) {
      void showMorePage(String(name))
    } else {
      void restoreScroll()
    }
  },
)
let wheelTimer = 0
let navigating = false
let disposed = false

function ready(instance: SwiperInstance) {
  swiper.value = instance
  instance.slideTo(currentIndex.value, 0, false)
  revealNeighbors(instance)
}

function revealNeighbors(instance: SwiperInstance) {
  if (!secondary.value && route.name !== 'more') {
    moreMotion.value = false
    morePage.value = 'more'
  }
  const next = new Set(visited.value)
  for (const index of [instance.activeIndex - 1, instance.activeIndex, instance.activeIndex + 1]) {
    if (index >= 0 && index < navigation.value.length) next.add(navigation.value[index]!.name)
  }
  visited.value = next
}

async function changed(instance: SwiperInstance) {
  if (instance.destroyed) return
  revealNeighbors(instance)
  if (instance.activeIndex === currentIndex.value || navigating) return
  navigating = true
  try {
    await navigatePage(router, navigation.value[instance.activeIndex]!.path)
  } catch {
    // The router reports a failed page load through its shared error handler.
  } finally {
    navigating = false
    if (!instance.destroyed && instance.activeIndex !== currentIndex.value) {
      instance.slideTo(currentIndex.value, reducedMotion.value ? 0 : 220)
    }
  }
}

watch(
  currentIndex,
  async (index, previous) => {
    const crossed = Array.from(
      { length: Math.abs(index - previous) + 1 },
      (_, offset) => Math.min(index, previous) + offset,
    )
    // Intermediate pages must not hold the destination behind a slow chunk.
    const names = crossed
      .filter((at) => at < navigation.value.length)
      .map((at) => navigation.value[at]!.name)
    const destination = navigation.value[index]!.name
    void Promise.allSettled(
      names.filter((name) => name !== destination).map((name) => loadPages[name]!()),
    )
    await loadPages[destination]!()
    if (disposed || index !== currentIndex.value) return
    visited.value = new Set([...visited.value, ...names.filter((name) => loadedPages.has(name))])
    await nextTick()
    if (disposed || swiper.value?.destroyed) return
    swiper.value?.slideTo(
      index,
      reducedMotion.value || names.some((name) => !loadedPages.has(name)) ? 0 : 220,
    )
    void restoreScroll()
  },
  { flush: 'post' },
)

watch(
  wide,
  (value) => {
    const instance = swiper.value
    if (!instance) return
    // Cancel the gesture before changing axes without remounting page state or scroll positions.
    Object.assign(instance.touchEventsData, {
      isTouched: false,
      isMoved: false,
      startMoving: false,
      pointerId: null,
      touchId: null,
    })
    instance.allowClick = true
    instance.allowTouchMove = !value
    instance.params.allowTouchMove = !value
    instance.setTransition(0)
    instance.changeDirection(value ? 'vertical' : 'horizontal', false)
    instance.updateSize()
    instance.updateSlides()
    instance.slideTo(currentIndex.value, 0, false)
    revealNeighbors(instance)
    void restoreScroll()
  },
  { flush: 'sync' },
)

function railWheel(event: WheelEvent) {
  event.preventDefault()
  if (wheelTimer || Math.abs(event.deltaY) < 8) return
  const index = Math.max(
    0,
    Math.min(navigation.value.length - 1, currentIndex.value + Math.sign(event.deltaY)),
  )
  void navigatePage(router, navigation.value[index]!.path)
  wheelTimer = window.setTimeout(() => {
    wheelTimer = 0
  }, 350)
}
onBeforeUnmount(() => {
  disposed = true
  window.clearTimeout(wheelTimer)
})
defineExpose({ railWheel })
</script>

<template>
  <div class="page-viewport">
    <Swiper
      class="page-swiper"
      :direction="wide ? 'vertical' : 'horizontal'"
      :initial-slide="currentIndex"
      :speed="reducedMotion ? 0 : 220"
      :allow-touch-move="!wide"
      :space-between="0"
      :resistance-ratio="0.35"
      :no-swiping-selector="'[data-scrub], input, textarea, select, button, .v-input, .v-overlay'"
      @swiper="ready"
      @touch-start="revealNeighbors"
      @slide-change="changed"
    >
      <SwiperSlide v-for="(page, index) in navigation" :key="page.name">
        <div v-if="page.name === 'more'" class="more-stack">
          <Transition
            v-for="name in moreNames"
            :key="name"
            :name="morePage === 'more' ? 'more-back' : 'more-forward'"
            :css="moreMotion && !wide && !reducedMotion"
          >
            <div
              v-show="morePage === name"
              class="page-scroll more-stack__page"
              :tabindex="index === currentIndex && morePage === name ? 0 : -1"
              :inert="index !== currentIndex || morePage !== name || undefined"
              :aria-hidden="index !== currentIndex || morePage !== name ? true : undefined"
              :data-page="name"
              @scroll.passive="saveScroll"
            >
              <VBtn v-if="name !== 'more'" variant="text" class="mb-3" @click="backToMore">
                <AppIcon name="back" />{{ t('nav.backToMore') }}
              </VBtn>
              <div :ref="(element) => setTarget(name, element)" class="page-content" />
            </div>
          </Transition>
        </div>
        <div
          v-else
          class="page-scroll"
          :tabindex="index === currentIndex ? 0 : -1"
          :inert="index !== currentIndex || undefined"
          :aria-hidden="index !== currentIndex ? true : undefined"
          :data-page="page.name"
          @scroll.passive="saveScroll"
        >
          <div :ref="(element) => setTarget(page.name, element)" class="page-content" />
        </div>
      </SwiperSlide>
    </Swiper>
    <div class="page-cache" inert aria-hidden="true">
      <Teleport
        v-for="(component, name) in pages"
        :key="name"
        :to="targets.get(name)"
        :disabled="!targets.has(name)"
      >
        <component :is="component" v-if="visited.has(name)" @vue:mounted="pageMounted(name)" />
      </Teleport>
    </div>
  </div>
</template>

<style scoped>
.page-content {
  height: 100%;
}
.page-cache {
  display: none;
}
.page-viewport,
.page-swiper {
  width: 100%;
  height: 100%;
  min-height: 0;
}
.page-swiper.swiper-vertical {
  touch-action: pan-y;
}
.page-scroll {
  height: 100%;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  padding: var(--shell-pad);
  background: var(--ink-900);
  scrollbar-gutter: stable;
}
.more-stack {
  position: relative;
  height: 100%;
  overflow: clip;
}
.more-stack__page {
  position: absolute;
  inset: 0;
}
.more-forward-enter-active,
.more-forward-leave-active,
.more-back-enter-active,
.more-back-leave-active {
  transition:
    transform 220ms cubic-bezier(0.2, 0, 0, 1),
    opacity 220ms ease;
}
.more-forward-enter-active,
.more-back-leave-active {
  z-index: 1;
}
.more-forward-enter-from,
.more-back-leave-to {
  transform: translateX(100%);
}
.more-forward-leave-to,
.more-back-enter-from {
  transform: translateX(-25%);
  opacity: 0;
}
</style>

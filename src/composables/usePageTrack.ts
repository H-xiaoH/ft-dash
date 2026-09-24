import { computed, ref, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NAV_ROUTES } from '@/router'

/** Which side of the current page the neighbour is parked on. */
export type DragSide = 1 | -1

const SETTLE = 'transform 180ms var(--ease-out-strong)'

/**
 * The sliding track under the pages: how far it has travelled, what sits beside it, and
 * how it hands over to the router once a swipe has landed. Gesture recognition lives in
 * `usePageDrag`; this half knows nothing about fingers.
 */
export function usePageTrack() {
  const route = useRoute()
  const router = useRouter()

  const offset = ref(0)
  const width = ref(0)
  const transition = ref('none')
  /** True while a finger owns the pages: the tab block must track it exactly, not ease. */
  const dragging = ref(false)
  /** True while a finger-committed swipe swaps pages, so nothing animates twice. */
  const handoff = ref(false)
  const neighbor = shallowRef<{ side: DragSide; component: unknown } | null>(null)
  /** The page a committed swipe is heading for, until the router gets there. */
  const target = ref<string | null>(null)

  let handoffTimer = 0
  /** A committed swipe is still sliding into place; a new gesture would fight over it. */
  let settling = false

  const fraction = computed(() => {
    if (!width.value) return 0
    return Math.max(-1, Math.min(1, -offset.value / width.value))
  })

  /**
   * How far the block itself has travelled, in tab slots. The travel has to be dropped the
   * moment the swipe's target becomes the current page: the index moves at the same time,
   * and counting both would send the block one slot past the tab it is heading for.
   */
  const indicatorFraction = computed(() =>
    target.value !== null && route.name === target.value ? 0 : fraction.value,
  )

  /**
   * The indicator follows the finger one for one (its stylesheet easing would otherwise
   * leave it chasing the touch and reading as a jitter), eases with the pages while they
   * settle, and keeps its own slide between taps.
   */
  const indicatorTransition = computed(() => {
    if (dragging.value) return 'none'
    return transition.value === 'none' ? undefined : transition.value
  })

  const busy = () => settling

  /** The page one step along the rail; resolved from the router's table, never a copy. */
  async function loadPage(delta: number) {
    const entry = NAV_ROUTES[routeIndex() + delta]
    if (!entry) return null
    return resolveView(entry.path, delta > 0 ? 1 : -1)
  }

  /**
   * Resolves a lazily loaded view without keeping a second import list around.
   * `router.resolve()` gives back the loader the route already owns.
   */
  async function resolveView(path: string, side: DragSide) {
    const entry = router.resolve(path).matched.at(-1)?.components?.default as unknown
    if (!entry) return null
    const resolved = typeof entry === 'function' ? await (entry as () => Promise<unknown>)() : entry
    return { side, component: (resolved as { default?: unknown })?.default ?? resolved }
  }

  function routeIndex() {
    return Math.max(
      0,
      NAV_ROUTES.findIndex((item) => item.name === route.name),
    )
  }

  /** Takes the gesture over: the track starts following, with no transition in the way. */
  function begin() {
    width.value = document.querySelector('.page-host')?.clientWidth ?? window.innerWidth
    transition.value = 'none'
    dragging.value = true
  }

  const moveTo = (px: number) => {
    offset.value = px
  }

  const mount = (page: { side: DragSide; component: unknown } | null) => {
    neighbor.value = page
  }

  /** Waits out the settle animation, so the page swap happens after the slide. */
  const settle = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms))

  /** Slides the rest of the way, then hands the track to the router. */
  async function commit(side: DragSide, path: string, loaded: Promise<unknown>) {
    settling = true
    dragging.value = false
    target.value = NAV_ROUTES[routeIndex() + side]?.name ?? null
    transition.value = SETTLE
    offset.value = -side * (width.value || window.innerWidth)
    await settle()
    try {
      // The neighbour must be on screen before the router takes over, otherwise the swap
      // would land on an empty track.
      await loaded
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

  /** Springs back after a swipe that did not qualify. */
  function cancel() {
    dragging.value = false
    transition.value = SETTLE
    offset.value = 0
    setTimeout(() => {
      transition.value = 'none'
      neighbor.value = null
    }, 200)
  }

  /**
   * Ends a finger-committed swap. Runs on the transition's `after-enter`, once the enter
   * classes are gone: the neighbour was showing this page here, so the real one lands on
   * the same spot and only then do the direction variables come back.
   */
  function finishHandoff() {
    if (!settling) return
    window.clearTimeout(handoffTimer)
    handoffTimer = 0
    transition.value = 'none'
    offset.value = 0
    target.value = null
    neighbor.value = null
    handoff.value = false
    settling = false
  }

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

  return {
    offset,
    width,
    transition,
    dragging,
    handoff,
    neighbor,
    indicatorFraction,
    indicatorTransition,
    busy,
    loadPage,
    resolveView,
    routeIndex,
    begin,
    moveTo,
    mount,
    commit,
    cancel,
    finishHandoff,
    warmPageChunks,
  }
}

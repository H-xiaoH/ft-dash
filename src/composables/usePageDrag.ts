import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NAV_ROUTES } from '@/router'

/**
 * Page drag for phones. The neighbouring page is mounted beside the current one and the
 * pair slides with the finger; releasing decides whether the swipe completes or springs
 * back. That costs a live component per drag, so the neighbour is mounted only once the
 * gesture is clearly sideways — and only then does the page take the gesture from the
 * scroller.
 *
 * `isBlocked` lets the caller veto the whole thing (a dialog is open, or we are still on
 * the connect screen).
 */
export function usePageDrag(isBlocked: () => boolean) {
  const route = useRoute()
  const router = useRouter()
  const navIndex = computed(() =>
    Math.max(
      0,
      NAV_ROUTES.findIndex((item) => item.name === route.name),
    ),
  )

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
  const DRAG_SETTLE = 'transform 180ms var(--ease-out-strong)'

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

  /** A gesture that belongs to a dialog, or to a component that owns horizontal drags. */
  function gestureIsTaken(target: EventTarget | null) {
    if (isBlocked() || document.querySelector('[role="dialog"]')) return true
    return target instanceof Element && target.closest('[data-scrub]') !== null
  }

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

  onMounted(() => {
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
  })

  onBeforeUnmount(() => {
    window.removeEventListener('touchstart', onTouchStart)
    window.removeEventListener('touchmove', onTouchMove)
    window.removeEventListener('touchend', onTouchEnd)
  })

  return {
    dragOffset,
    dragTransition,
    indicatorFraction,
    indicatorTransition,
    handoff,
    neighbor,
    finishHandoff,
    warmPageChunks,
  }
}

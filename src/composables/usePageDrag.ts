import { onBeforeUnmount, onMounted } from 'vue'
import { NAV_ROUTES } from '@/router'
import { usePageTrack, type DragSide } from './usePageTrack'

/**
 * Gesture half of page swiping: when a touch counts as a sideways drag, where it goes, and
 * whether letting go commits. The track it drives — offset, neighbour page, handover to the
 * router — lives in `usePageTrack`.
 *
 * `isBlocked` lets the caller veto the whole thing (a dialog is open, or we are still on
 * the connect screen).
 */
export function usePageDrag(isBlocked: () => boolean) {
  const track = usePageTrack()

  /** Sideways travel before the page claims the gesture. */
  const DRAG_CLAIM_PX = 10
  /** Share of the viewport that completes the swipe on release. */
  const DRAG_COMMIT_RATIO = 0.35
  /** A quick flick completes it without travelling that far. */
  const DRAG_FLICK_PX_PER_MS = 0.5

  let gesture: {
    target: EventTarget | null
    startX: number
    startY: number
    /** Started on the tab bar: that drags the block, it does not push the pages. */
    bar: boolean
    claimed: boolean
    lastX: number
    lastAt: number
    velocity: number
  } | null = null
  /** The neighbour's code, in flight from the moment the gesture is claimed. */
  let neighborLoad: Promise<{ side: DragSide; component: unknown } | null> | null = null

  /**
   * Which page a horizontal drag brings in. Pushing a page right reveals the one before it;
   * dragging the block right walks forward to the next tab, so the sides are mirrored.
   */
  function sideOf(bar: boolean, dx: number): DragSide {
    return (bar ? dx > 0 : dx < 0) ? 1 : -1
  }

  /** Width of one tab slot: how far the block travels per tab, and the bar's drag scale. */
  function tabSlotWidth(): number {
    const bar = document.querySelector('.tabbar')
    return (bar?.clientWidth ?? window.innerWidth) / (NAV_ROUTES.length || 1)
  }

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

  function onTouchStart(event: TouchEvent) {
    gesture = null
    if (track.busy() || event.touches.length !== 1 || gestureIsTaken(event.target)) return
    const touch = event.touches[0]
    gesture = {
      target: event.target,
      startX: touch.clientX,
      startY: touch.clientY,
      bar: event.target instanceof Element && event.target.closest('.tabbar') !== null,
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
      track.begin()
      neighborLoad = track.loadPage(sideOf(current.bar, dx))
      void neighborLoad
        .then((loaded) => {
          // A chunk that lands after the finger left must not resurrect the drag.
          if (loaded && gesture === current) track.mount(loaded)
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

    const side = sideOf(current.bar, dx)
    if (current.bar) {
      /*
       * Dragging the block moves it the way the finger goes, with the pages previewing
       * underneath — the opposite mapping from pushing a page aside. One tab per gesture,
       * like one page per swipe: past the neighbour the block stops instead of sliding past
       * the tab it would land on. The rails clamp it too, or the block would walk off the
       * bar at either end.
       */
      const index = track.routeIndex()
      const slots = Math.max(-index, Math.min(NAV_ROUTES.length - 1 - index, dx / tabSlotWidth()))
      track.moveTo(-slots * (track.width.value || window.innerWidth))
      return
    }
    // One page per drag: follow the finger, and resist only where the rail ends.
    track.moveTo(NAV_ROUTES[track.routeIndex() + side] ? dx : dx * 0.25)
  }

  function onTouchEnd(event: TouchEvent) {
    const current = gesture
    gesture = null
    if (!current?.claimed) return

    const touch = event.changedTouches[0]
    const dx = touch ? touch.clientX - current.startX : track.offset.value
    const side = sideOf(current.bar, dx)
    const width = track.width.value || window.innerWidth
    const route = NAV_ROUTES[track.routeIndex() + side]
    const flicked =
      Math.sign(current.velocity) === Math.sign(dx) &&
      Math.abs(current.velocity) > DRAG_FLICK_PX_PER_MS
    // A tab slot is far narrower than a page, so the bar's threshold is measured in tabs.
    const travelled = current.bar ? Math.abs(dx) / tabSlotWidth() : Math.abs(dx) / width
    const committed = !!route && (travelled > DRAG_COMMIT_RATIO || flicked)

    if (committed && route) void track.commit(side, route.path, neighborLoad ?? Promise.resolve())
    else track.cancel()
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
    dragOffset: track.offset,
    dragTransition: track.transition,
    indicatorFraction: track.indicatorFraction,
    indicatorTransition: track.indicatorTransition,
    handoff: track.handoff,
    neighbor: track.neighbor,
    finishHandoff: track.finishHandoff,
    warmPageChunks: track.warmPageChunks,
  }
}

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
    claimed: boolean
    lastX: number
    lastAt: number
    velocity: number
  } | null = null
  /** The neighbour's code, in flight from the moment the gesture is claimed. */
  let neighborLoad: Promise<{ side: DragSide; component: unknown } | null> | null = null

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
      neighborLoad = track.loadPage(dx < 0 ? 1 : -1)
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

    const side = dx < 0 ? 1 : -1
    // One page per drag: follow the finger, and resist only where the rail ends.
    track.moveTo(NAV_ROUTES[track.routeIndex() + side] ? dx : dx * 0.25)
  }

  function onTouchEnd(event: TouchEvent) {
    const current = gesture
    gesture = null
    if (!current?.claimed) return

    const touch = event.changedTouches[0]
    const dx = touch ? touch.clientX - current.startX : track.offset.value
    const side: DragSide = dx < 0 ? 1 : -1
    const width = track.width.value || window.innerWidth
    const route = NAV_ROUTES[track.routeIndex() + side]
    const flicked =
      Math.sign(current.velocity) === Math.sign(dx) &&
      Math.abs(current.velocity) > DRAG_FLICK_PX_PER_MS
    const committed = !!route && (Math.abs(dx) > width * DRAG_COMMIT_RATIO || flicked)

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

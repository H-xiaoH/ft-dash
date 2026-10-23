import { onBeforeUnmount, onMounted } from 'vue'
import { NAV_ROUTES } from '@/router'
import { usePageTrack } from './usePageTrack'

/** Which way a gesture walks the rail: forward is the next tab, back the one before. */
type DragSide = 1 | -1

/**
 * The input side of moving between pages: when a touch counts as a sideways drag, where it
 * goes, whether letting go commits, and what the wheel does over the rail. The track it
 * drives — offset, the pages held on it, handover to the router — lives in `usePageTrack`.
 *
 * A swipe pushes the page aside, one screen per finger, one page per gesture. The bottom bar
 * is not a drag surface: a touch that lands on it belongs to the tab under the finger, so a
 * tap cannot lose the gesture to a finger that wobbled sideways. On wide screens the rail is
 * the page selector: the wheel walks pages there instead of scrolling the page behind it, a
 * notch at a time, a trackpad's stream continuously.
 *
 * `isBlocked` lets the caller veto the whole thing (a dialog is open, or we are still on
 * the connect screen).
 */
export function usePageDrag(isBlocked: () => boolean) {
  const track = usePageTrack()

  /** Sideways travel before the page claims the gesture. */
  const DRAG_CLAIM_PX = 10
  /** Share of the screen that completes a page swipe on release. */
  const DRAG_COMMIT_RATIO = 0.35
  /** A quick flick completes it without travelling that far. */
  const DRAG_FLICK_PX_PER_MS = 0.5
  /** Wheel travel that makes one page, for the stream a trackpad sends. */
  const WHEEL_PAGE_PX = 90
  /** Quiet time after the last wheel event before the walk counts as finished. */
  const WHEEL_SETTLE_MS = 180

  let gesture: {
    target: EventTarget | null
    startX: number
    startY: number
    claimed: boolean
    lastX: number
    lastAt: number
    velocity: number
  } | null = null

  /** The wheel's own walk: where it started, how far it has gone, where it has landed. */
  let wheel: { origin: number; travel: number; landed: number; timer: number } | null = null

  /**
   * Which way a horizontal drag walks the rail: pushing a page right reveals the one before
   * it, so the sides are mirrored.
   */
  function sideOf(dx: number): DragSide {
    return dx < 0 ? 1 : -1
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
    // The bar belongs to its tabs: a touch there never becomes a page drag.
    if (event.target instanceof Element && event.target.closest('.tabbar')) return
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
    }

    // The page owns the gesture now, so nothing behind it may scroll.
    event.preventDefault()

    const now = performance.now()
    current.velocity = (touch.clientX - current.lastX) / Math.max(1, now - current.lastAt)
    current.lastX = touch.clientX
    current.lastAt = now

    // One page per drag: follow the finger, and resist only where the rail ends.
    track.dragTo(NAV_ROUTES[track.routeIndex() + sideOf(dx)] ? dx : dx * 0.25)
  }

  function onTouchEnd(event: TouchEvent) {
    const current = gesture
    gesture = null
    if (!current?.claimed) return

    const touch = event.changedTouches[0]
    const dx = touch ? touch.clientX - current.startX : track.offset.value
    const side = sideOf(dx)
    const index = track.routeIndex()
    const flicked =
      Math.sign(current.velocity) === Math.sign(dx) &&
      Math.abs(current.velocity) > DRAG_FLICK_PX_PER_MS

    const route = NAV_ROUTES[index + side]
    const committed =
      !!route &&
      (Math.abs(dx) / (track.width.value || window.innerWidth) > DRAG_COMMIT_RATIO || flicked)
    if (committed && route) void track.commit(index + side)
    else track.cancel()
  }

  /**
   * How much page travel one wheel event asks for. A wheel notch is a single big delta; a
   * trackpad sends a stream of small ones, which add up between events — so a notch is one
   * page, and a trackpad walk is as continuous as the fingers are.
   */
  function wheelTravel(event: WheelEvent): number {
    if (event.deltaMode !== 0) return Math.sign(event.deltaY)
    if (Math.abs(event.deltaY) >= WHEEL_PAGE_PX)
      return (
        Math.sign(event.deltaY) * Math.max(1, Math.round(Math.abs(event.deltaY) / WHEEL_PAGE_PX))
      )
    return event.deltaY / WHEEL_PAGE_PX
  }

  /**
   * Bound to the rail itself, not to the window: the wheel only belongs to the app there,
   * and a non-passive listener on the window would take the browser's fast path away from
   * every scroll in the app.
   */
  function onRailWheel(event: WheelEvent) {
    // The rail is the page selector on wide screens: over it the wheel walks pages, and
    // the page behind it stays where it is.
    event.preventDefault()
    if (isBlocked() || document.querySelector('[role="dialog"]') || track.busy()) return

    if (!wheel)
      wheel = { origin: track.routeIndex(), travel: 0, landed: track.routeIndex(), timer: 0 }
    wheel.travel += wheelTravel(event)
    const last = NAV_ROUTES.length - 1
    const target = Math.max(0, Math.min(last, wheel.origin + Math.round(wheel.travel)))
    if (target !== wheel.landed) {
      wheel.landed = target
      void track.goTo(target)
    }
    window.clearTimeout(wheel.timer)
    // The walk is over once the wheel goes quiet — momentum included — so the next scroll
    // starts counting again from wherever it left the rail.
    wheel.timer = window.setTimeout(() => {
      wheel = null
    }, WHEEL_SETTLE_MS)
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
    window.clearTimeout(wheel?.timer)
  })

  return {
    dragOffset: track.offset,
    dragTransition: track.transition,
    dragging: track.dragging,
    indicatorFraction: track.indicatorFraction,
    indicatorTransition: track.indicatorTransition,
    handoff: track.handoff,
    neighbors: track.pages,
    finishHandoff: track.finishHandoff,
    loadAllPages: track.loadAllPages,
    onRailWheel,
  }
}

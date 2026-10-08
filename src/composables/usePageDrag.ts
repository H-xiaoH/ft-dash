import { onBeforeUnmount, onMounted } from 'vue'
import { NAV_ROUTES } from '@/router'
import { usePageTrack } from './usePageTrack'

/** Which way a gesture walks the rail: forward is the next tab, back the one before. */
export type DragSide = 1 | -1

/**
 * Gesture half of moving between pages: when a touch counts as a sideways drag, where it
 * goes, and whether letting go commits. The track it drives — offset, parked pages,
 * handover to the router — lives in `usePageTrack`.
 *
 * Two gestures share the track. A swipe on the page moves it one screen per finger, one
 * page per gesture. A drag on the tab bar carries the block along the bar, one tab per
 * tab's worth of travel, and the pages ride with it — several tabs in one drag if you
 * want them, since the block is where you leave it.
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

  let gesture: {
    target: EventTarget | null
    startX: number
    startY: number
    /** Started on the tab bar: that carries the block, it does not push the pages. */
    bar: boolean
    claimed: boolean
    lastX: number
    lastAt: number
    velocity: number
  } | null = null

  /**
   * Which way a horizontal drag walks the rail. Pushing a page right reveals the one
   * before it; dragging the block right walks forward to the next tab, so the sides are
   * mirrored.
   */
  function sideOf(bar: boolean, dx: number): DragSide {
    return (bar ? dx > 0 : dx < 0) ? 1 : -1
  }

  /**
   * How far the block travels per tab. Measured off a tab itself rather than off the bar:
   * the bar carries padding, and dividing its width would walk the block a little faster
   * than the tabs it is supposed to land on.
   */
  function tabSlotWidth(): number {
    const item = document.querySelector('.tabbar__item')
    return item?.getBoundingClientRect().width || window.innerWidth / (NAV_ROUTES.length || 1)
  }

  /** How many tabs the block has been carried, held inside the bar at either end. */
  function blockSlots(dx: number): number {
    const index = track.routeIndex()
    const travel = dx / tabSlotWidth()
    return Math.max(-index, Math.min(NAV_ROUTES.length - 1 - index, travel))
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
    }

    // The page owns the gesture now, so nothing behind it may scroll.
    event.preventDefault()

    const now = performance.now()
    current.velocity = (touch.clientX - current.lastX) / Math.max(1, now - current.lastAt)
    current.lastX = touch.clientX
    current.lastAt = now

    const side = sideOf(current.bar, dx)
    const span = track.width.value || window.innerWidth
    if (current.bar) {
      /*
       * Dragging the block carries it along the bar one tab per tab's worth of travel,
       * with the pages riding underneath — the opposite mapping from pushing a page
       * aside, and several tabs per gesture if the finger goes that far. It stops at the
       * ends of the bar, or the block would walk off it. The extra page asked for ahead
       * is the one it is about to reach.
       */
      track.dragTo(-blockSlots(dx) * span, 1)
      return
    }
    // One page per drag: follow the finger, and resist only where the rail ends.
    track.dragTo(NAV_ROUTES[track.routeIndex() + side] ? dx : dx * 0.25)
  }

  function onTouchEnd(event: TouchEvent) {
    const current = gesture
    gesture = null
    if (!current?.claimed) return

    const touch = event.changedTouches[0]
    const dx = touch ? touch.clientX - current.startX : track.offset.value
    const side = sideOf(current.bar, dx)
    const index = track.routeIndex()
    const flicked =
      Math.sign(current.velocity) === Math.sign(dx) &&
      Math.abs(current.velocity) > DRAG_FLICK_PX_PER_MS

    if (current.bar) {
      // The block lands on the tab it was left over. A flick out of a tab the finger
      // never carried the block away from still counts as one step, like a quick page
      // swipe; either way it lands on a tab that exists.
      const carried = index + Math.round(blockSlots(dx))
      const stepped = carried === index && flicked ? index + side : carried
      const target = Math.max(0, Math.min(NAV_ROUTES.length - 1, stepped))
      if (target !== index) void track.commit(target)
      else track.cancel()
      return
    }

    const route = NAV_ROUTES[index + side]
    const committed =
      !!route &&
      (Math.abs(dx) / (track.width.value || window.innerWidth) > DRAG_COMMIT_RATIO || flicked)
    if (committed && route) void track.commit(index + side)
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
    neighbors: track.pages,
    finishHandoff: track.finishHandoff,
    warmPageChunks: track.warmPageChunks,
  }
}

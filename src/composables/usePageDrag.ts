import { onBeforeUnmount, onMounted } from 'vue'
import { NAV_ROUTES } from '@/router'
import { usePageTrack } from './usePageTrack'

/** Which way a gesture walks the rail: forward is the next tab, back the one before. */
export type DragSide = 1 | -1

/**
 * The input side of moving between pages: when a touch counts as a sideways drag, where it
 * goes, whether letting go commits, and what the wheel does over the rail. The track it
 * drives — offset, the pages held on it, handover to the router — lives in `usePageTrack`.
 *
 * A swipe on the page pushes it aside, one screen per finger, one page per gesture. A drag
 * on the tab bar carries the block, and the block sits where the finger is — it follows the
 * finger, rather than moving by however far the finger has travelled — so anywhere on the
 * bar is a handle. On wide screens the rail is the page selector: the wheel walks pages
 * there instead of scrolling the page behind it, a notch at a time, a trackpad's stream
 * continuously.
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
    /** Started on the tab bar: that carries the block, it does not push the pages. */
    bar: boolean
    /** Where inside the block the finger landed: the block keeps that point under it. */
    grab: number
    claimed: boolean
    lastX: number
    lastAt: number
    velocity: number
  } | null = null

  /** The wheel's own walk: where it started, how far it has gone, where it has landed. */
  let wheel: { origin: number; travel: number; landed: number; timer: number } | null = null

  /**
   * Which way a horizontal drag walks the rail. Pushing a page right reveals the one
   * before it; dragging the block right walks forward to the next tab, so the sides are
   * mirrored.
   */
  function sideOf(bar: boolean, dx: number): DragSide {
    return (bar ? dx > 0 : dx < 0) ? 1 : -1
  }

  /**
   * How far apart the tabs are. Measured off a tab itself rather than off the bar: the bar
   * carries padding, and dividing its width would walk the block a little faster than the
   * tabs it is supposed to land on.
   */
  function tabSlotWidth(): number {
    const item = document.querySelector('.tabbar__item')
    return item?.getBoundingClientRect().width || window.innerWidth / (NAV_ROUTES.length || 1)
  }

  /** The left edge of the first tab: where the block's travel starts from. */
  function barOrigin(): number {
    return document.querySelector('.tabbar__item')?.getBoundingClientRect().left ?? 0
  }

  /**
   * Where inside the block the finger landed, so it keeps that point and does not jump when
   * grabbed by an edge. A press anywhere else on the bar centres the block on the finger,
   * which is what makes the whole bar a handle for it.
   */
  function grabOffset(clientX: number): number {
    const block = document.querySelector('.tabbar__indicator')?.getBoundingClientRect()
    const width = tabSlotWidth()
    if (!block || clientX < block.left || clientX > block.right) return width / 2
    return clientX - block.left
  }

  /** Which tab the block is on for a finger at this point — the finger's own position. */
  function blockSlots(clientX: number, grab: number): number {
    const travel = (clientX - grab - barOrigin()) / tabSlotWidth()
    return Math.max(0, Math.min(NAV_ROUTES.length - 1, travel))
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
    const bar = event.target instanceof Element && event.target.closest('.tabbar') !== null
    gesture = {
      target: event.target,
      startX: touch.clientX,
      startY: touch.clientY,
      bar,
      grab: bar ? grabOffset(touch.clientX) : 0,
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

    const span = track.width.value || window.innerWidth
    if (current.bar) {
      /*
       * The block goes where the finger is, on the bar's own scale — the opposite mapping
       * from pushing a page aside, and as many tabs from here as the finger is. Holding it
       * inside the bar is what the clamp does, so a finger off the end parks the block there
       * with the pages behind it caught up.
       */
      const slots = blockSlots(touch.clientX, current.grab) - track.routeIndex()
      track.dragTo(-slots * span)
      return
    }
    // One page per drag: follow the finger, and resist only where the rail ends.
    track.dragTo(NAV_ROUTES[track.routeIndex() + sideOf(false, dx)] ? dx : dx * 0.25)
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
      // The block lands on the tab it was left over. A flick on a block the finger never
      // carried away from its tab still counts as one step, like a quick page swipe does.
      const last = NAV_ROUTES.length - 1
      const under = touch ? blockSlots(touch.clientX, current.grab) : index
      const landed = Math.max(0, Math.min(last, Math.round(under)))
      const target = Math.max(
        0,
        Math.min(last, landed === index && flicked ? index + side : landed),
      )
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
    indicatorFraction: track.indicatorFraction,
    indicatorTransition: track.indicatorTransition,
    handoff: track.handoff,
    neighbors: track.pages,
    finishHandoff: track.finishHandoff,
    loadAllPages: track.loadAllPages,
    onRailWheel,
  }
}

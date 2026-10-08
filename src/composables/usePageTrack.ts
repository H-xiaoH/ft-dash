import { computed, ref, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NAV_ROUTES } from '@/router'

/** A page parked on the track while a gesture is in flight. */
export interface TrackPage {
  /** Its place on the track, in pages from the current one: 2 is two pages to the right. */
  slot: number
  component: unknown
}

const SETTLE = 'transform 180ms var(--ease-out-strong)'

/**
 * The sliding track under the pages: how far it has travelled, which pages are parked on
 * it, and how it hands over to the router once a gesture has landed. Gesture recognition
 * lives in `usePageDrag`; this half knows nothing about fingers.
 *
 * The track is driven by a page position rather than by a step. A page swipe moves it by
 * the finger's travel, one screen per page, and a drag of the tab block moves it by the
 * block's travel, one tab per page — the same strip either way, with the pages the finger
 * uncovers parked on it so it never slides onto empty space.
 */
export function usePageTrack() {
  const route = useRoute()
  const router = useRouter()

  const offset = ref(0)
  const width = ref(0)
  const transition = ref('none')
  /** True while a finger owns the pages: the tab block must track it exactly, not ease. */
  const dragging = ref(false)
  /** True while a finger-committed gesture swaps pages, so nothing animates twice. */
  const handoff = ref(false)
  /** The pages parked beside the current one, nearest slot first. */
  const pages = shallowRef<TrackPage[]>([])
  /** The page a committed gesture is heading for, until the router gets there. */
  const target = ref<string | null>(null)

  let handoffTimer = 0
  /** A committed gesture is still sliding into place; a new one would fight over it. */
  let settling = false
  /** The rail indices the finger is looking through right now. */
  let wanted: { lo: number; hi: number } | null = null
  /** Views the router's own loaders have handed over, so a second visit is free. */
  const resolved = new Map<number, unknown>()
  const loading = new Map<number, Promise<unknown>>()

  function routeIndex() {
    return Math.max(
      0,
      NAV_ROUTES.findIndex((item) => item.name === route.name),
    )
  }

  /**
   * How far the block itself has travelled, in tab slots. The travel is clamped to the
   * rail — the first tab has nothing before it and the last nothing after it — and it has
   * to be dropped the moment a committed gesture's target becomes the current page: the
   * index moves at the same time, and counting both would send the block one slot past
   * the tab it is heading for.
   */
  const fraction = computed(() => {
    if (!width.value) return 0
    const index = routeIndex()
    const slots = -offset.value / width.value
    return Math.max(-index, Math.min(NAV_ROUTES.length - 1 - index, slots))
  })

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

  /**
   * Resolves one page by its rail index, through the loader the route already owns.
   * `router.resolve()` gives back that loader, so no second import list is kept around.
   * A page that cannot be fetched is not worth reporting — the drag just shows nothing
   * there, and the router says its piece if the gesture lands on it.
   */
  function resolvePage(index: number): Promise<unknown> {
    if (resolved.has(index)) return Promise.resolve(resolved.get(index))
    const pending = loading.get(index)
    if (pending) return pending
    const entry = NAV_ROUTES[index]
    const loader = entry
      ? (router.resolve(entry.path).matched.at(-1)?.components?.default as unknown)
      : null
    const promise = Promise.resolve(
      typeof loader === 'function' ? (loader as () => Promise<unknown>)() : loader,
    )
      .then((module) => (module as { default?: unknown })?.default ?? module ?? null)
      .then((component) => {
        loading.delete(index)
        if (component) resolved.set(index, component)
        return component
      })
      .catch(() => {
        loading.delete(index)
        return null
      })
    loading.set(index, promise)
    return promise
  }

  /**
   * Parks exactly the pages the finger is looking through and lets go of the ones it has
   * moved past, so the strip under the finger is real content instead of a blank slot.
   * Pages the loaders have not delivered yet are parked the moment they arrive — unless
   * the finger has moved on by then, in which case they are only cached for later.
   */
  function parkPages(lo: number, hi: number) {
    const index = routeIndex()
    const range = { lo: Math.max(0, lo), hi: Math.min(NAV_ROUTES.length - 1, hi) }
    wanted = range
    const next: TrackPage[] = []
    for (let at = range.lo; at <= range.hi; at++) {
      if (at === index) continue
      const component = resolved.get(at)
      if (component) next.push({ slot: at - index, component })
      else
        void resolvePage(at).then((loaded) => {
          if (loaded && wanted && at >= wanted.lo && at <= wanted.hi)
            parkPages(wanted.lo, wanted.hi)
        })
    }
    if (!samePages(next, pages.value)) pages.value = next
  }

  /** Nothing parked, nobody waiting: the track is back to one page. */
  function releasePages() {
    wanted = null
    if (pages.value.length) pages.value = []
  }

  /** Takes the gesture over: the track starts following, with no transition in the way. */
  function begin() {
    width.value = document.querySelector('.page-host')?.clientWidth ?? window.innerWidth
    transition.value = 'none'
    dragging.value = true
  }

  /**
   * Follows the finger to a track offset in pixels, parking whatever that uncovers: the
   * two pages a screen can show at once are the ones the finger is between. A page is
   * fetched the moment it becomes visible, so `lead` asks for one past the edge the strip
   * is heading for as well — a fast drag crosses a tab in less time than a view takes to
   * render, and the strip must not arrive before the page does.
   */
  function dragTo(px: number, lead = 0) {
    offset.value = px
    const span = width.value || window.innerWidth
    const position = routeIndex() - px / span
    const base = Math.floor(position)
    // The same rule mirrored: the leading edge of the strip is the far one either way.
    const forward = px <= 0
    parkPages(base - (forward ? 0 : lead), base + 1 + (forward ? lead : 0))
  }

  /** Waits out the settle animation, so the page swap happens after the slide. */
  const settle = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms))

  /** Slides the rest of the way, then hands the track to the router. */
  async function commit(index: number) {
    const from = routeIndex()
    const entry = NAV_ROUTES[index]
    if (!entry || index === from) return cancel()
    const span = width.value || window.innerWidth
    const step = index - from
    const position = from - offset.value / span
    settling = true
    dragging.value = false
    target.value = entry.name
    transition.value = SETTLE
    offset.value = -step * span
    // Every page the slide crosses has to stay parked, the one it lands on included: the
    // router only takes over once that page is on screen.
    parkPages(Math.min(Math.floor(position), index), Math.max(Math.floor(position) + 1, index))
    await settle()
    try {
      // The neighbour must be on screen before the router takes over, otherwise the swap
      // would land on an empty track.
      await resolvePage(index)
      handoff.value = true
      await router.push(entry.path)
      // The reset waits for the enter to finish — clearing the handoff earlier re-arms the
      // slide, and the page you just swiped to slides in a second time. This is the safety
      // net for an enter that never reports back.
      handoffTimer = window.setTimeout(finishHandoff, 600)
    } catch {
      finishHandoff()
    }
  }

  /** Springs back after a gesture that did not qualify. */
  function cancel() {
    dragging.value = false
    transition.value = SETTLE
    offset.value = 0
    setTimeout(() => {
      // A new gesture may already own the track by now; only the one that cancelled is
      // allowed to put it back to rest.
      if (dragging.value || settling) return
      transition.value = 'none'
      releasePages()
    }, 200)
  }

  /**
   * Ends a finger-committed swap. Runs on the transition's `after-enter`, once the enter
   * classes are gone: the parked page was showing this page here, so the real one lands
   * on the same spot and only then do the direction variables come back.
   */
  function finishHandoff() {
    if (!settling) return
    window.clearTimeout(handoffTimer)
    handoffTimer = 0
    transition.value = 'none'
    offset.value = 0
    target.value = null
    releasePages()
    handoff.value = false
    settling = false
  }

  /**
   * Pulls in the other pages' views once the first data load is done. A gesture can only
   * show a page whose view is already here, and the very first gesture towards an
   * unvisited page would otherwise slide into empty space.
   */
  function warmPageChunks() {
    const index = routeIndex()
    for (let at = 0; at < NAV_ROUTES.length; at++) if (at !== index) void resolvePage(at)
  }

  return {
    offset,
    width,
    transition,
    dragging,
    handoff,
    pages,
    indicatorFraction,
    indicatorTransition,
    busy,
    routeIndex,
    begin,
    dragTo,
    commit,
    cancel,
    finishHandoff,
    warmPageChunks,
  }
}

/** Whether two parked sets are the same pages in the same slots. */
function samePages(a: TrackPage[], b: TrackPage[]) {
  return (
    a.length === b.length &&
    a.every((page, index) => page.slot === b[index].slot && page.component === b[index].component)
  )
}

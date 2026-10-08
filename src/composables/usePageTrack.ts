import { computed, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NAV_ROUTES } from '@/router'

/** A page held on the track, ready to be slid into view. */
export interface TrackPage {
  /** Its rail index. The track holds the page by this, so a switch never remounts it. */
  index: number
  /** Its place on the track, in pages from the current one: 2 is two pages to the right. */
  slot: number
  component: unknown
}

const SETTLE = 'transform 180ms var(--ease-out-strong)'

/**
 * The sliding track under the pages: how far it has travelled, which pages are held on it,
 * and how it hands over to the router once a swipe has landed. Gesture recognition lives in
 * `usePageDrag`; this half knows nothing about fingers.
 *
 * Every page but the current one is held on the track from the start, so the strip a finger
 * drags never runs out of page to show and a wheel step never waits for a view to load. The
 * track is driven by a page position rather than by a step: a page swipe moves it by the
 * finger's travel, one screen per page, and carrying the tab block moves it by the block's.
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
  /** The pages held on the track, nearest slot first. */
  const pages = shallowRef<TrackPage[]>([])
  /** The page a committed gesture is heading for, until the router gets there. */
  const target = ref<string | null>(null)

  let handoffTimer = 0
  /** A committed gesture is still sliding into place; a new one would fight over it. */
  let settling = false
  /** Views the router's own loaders have handed over, so a switch costs nothing. */
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
   * A page that cannot be fetched is not worth reporting — it is left off the track, and
   * the router says its piece if the operator walks to it.
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
   * Holds every page but the current one on the track, each in the slot its rail index
   * puts it in, and lets go of none: this is what keeps a gesture from ever uncovering
   * empty space. Pages still in flight join the track the moment they arrive.
   */
  function parkRail() {
    const index = routeIndex()
    const next: TrackPage[] = []
    for (let at = 0; at < NAV_ROUTES.length; at++) {
      if (at === index) continue
      const component = resolved.get(at)
      if (component) next.push({ index: at, slot: at - index, component })
      else void resolvePage(at).then((loaded) => loaded && parkRail())
    }
    if (!samePages(next, pages.value)) pages.value = next
  }

  /** Takes the gesture over: the track starts following, with no transition in the way. */
  function begin() {
    width.value = document.querySelector('.page-host')?.clientWidth ?? window.innerWidth
    transition.value = 'none'
    dragging.value = true
  }

  /** Follows the finger to a track offset in pixels. The pages are already all here. */
  function dragTo(px: number) {
    offset.value = px
  }

  /**
   * Walks to another page without sliding the track: the wheel moves between pages the way
   * a tap does, and the page's own transition is what animates — nothing on wide screens.
   */
  async function goTo(index: number) {
    const entry = NAV_ROUTES[index]
    if (entry && index !== routeIndex()) await router.push(entry.path)
  }

  /** Waits out the settle animation, so the page swap happens after the slide. */
  const settle = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms))

  /** Slides the rest of the way, then hands the track to the router. */
  async function commit(index: number) {
    const from = routeIndex()
    const entry = NAV_ROUTES[index]
    if (!entry || index === from) return cancel()
    const step = index - from
    settling = true
    dragging.value = false
    target.value = entry.name
    transition.value = SETTLE
    offset.value = -step * (width.value || window.innerWidth)
    await settle()
    try {
      // The page it lands on must be on screen before the router takes over, otherwise
      // the swap would land on an empty track.
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
    }, 200)
  }

  /**
   * Ends a finger-committed swap. Runs on the transition's `after-enter`, once the enter
   * classes are gone: the page held on the track was showing this page here, so the real
   * one lands on the same spot and only then do the direction variables come back. The
   * track is re-seated for the new index in the same tick, so the held pages do not move.
   */
  function finishHandoff() {
    if (!settling) return
    window.clearTimeout(handoffTimer)
    handoffTimer = 0
    transition.value = 'none'
    offset.value = 0
    target.value = null
    parkRail()
    handoff.value = false
    settling = false
  }

  /**
   * A page that changes without a handoff — a tap, the wheel, a deep link — still has to
   * hand the track over to the new index, or the page that just left would be held twice.
   * A handoff does it in `finishHandoff` instead, once the track has stopped moving.
   */
  watch(
    () => route.name,
    () => {
      if (!settling) parkRail()
    },
  )

  /** Holds every page on the track. Off the critical path: the first paint goes first. */
  function loadAllPages() {
    parkRail()
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
    goTo,
    commit,
    cancel,
    finishHandoff,
    loadAllPages,
  }
}

/** Whether two held sets are the same pages in the same slots. */
function samePages(a: TrackPage[], b: TrackPage[]) {
  return (
    a.length === b.length &&
    a.every(
      (page, index) =>
        page.index === b[index].index &&
        page.slot === b[index].slot &&
        page.component === b[index].component,
    )
  )
}

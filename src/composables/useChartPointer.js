import { ref } from 'vue'

/**
 * Touch pointers have no hover state: a tap fires pointerenter and then
 * pointerleave as the finger lifts. Anything that only listens for
 * enter/leave therefore flickers and is unusable on a phone.
 */
export function isMousePointer(event) {
  return event.pointerType === 'mouse'
}

/**
 * Pointer interaction for the positional charts (area/bar/candle): mouse hover and
 * touch scrubbing.
 *
 * Touch pointers never "hover". A tap fires pointerdown/up with no intervening
 * pointermove, and lifting the finger destroys the pointer, which fires
 * pointerleave. Binding plain pointermove/pointerleave therefore makes the
 * tooltip either never appear or vanish the instant it does.
 *
 * So: show on pointerdown, follow the finger while it is down, and keep the value
 * on screen after it lifts (otherwise there is nothing to read). Mouse behaviour is
 * unchanged - it still follows without pressing and clears on leave.
 *
 * Bind these explicitly (`@pointerdown="onPointerDown"`). Do NOT pass them to
 * `v-on="handlers"`: that form expects bare lowercase event names as keys
 * ("pointerdown"), and an `onXxx` key silently becomes a custom event that never
 * fires.
 *
 * The caller supplies `resolveIndex(event)`, which maps a pointer position onto a
 * data index (or null when the position is not over the plot).
 */
export function useChartPointer(resolveIndex) {
  const hoverIndex = ref(-1)

  function update(event) {
    const index = resolveIndex(event)
    if (index !== null && index !== undefined) hoverIndex.value = index
  }

  function onPointerDown(event) {
    // Keep receiving moves even if the finger slides off the plot area.
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* not supported everywhere; dragging still works inside the element */
    }
    update(event)
  }

  function onPointerMove(event) {
    // A mouse always tracks; a touch only tracks while it is actually pressed.
    if (isMousePointer(event) || event.buttons !== 0) update(event)
  }

  function onPointerLeave(event) {
    // Touch pointers "leave" when the finger lifts - that must not clear the value.
    if (isMousePointer(event)) hoverIndex.value = -1
  }

  function onPointerCancel() {
    // The browser took the gesture for scrolling; stop showing a value.
    hoverIndex.value = -1
  }

  function clear() {
    hoverIndex.value = -1
  }

  return { hoverIndex, clear, onPointerDown, onPointerMove, onPointerLeave, onPointerCancel }
}

/**
 * Selection for discrete targets (donut slices and their legend rows).
 *
 * Mouse keeps the old behaviour: preview on hover, clear on leave. Touch has no
 * hover, so selection is toggled by `click` - which the browser only fires for a
 * real tap, never for a scroll - and it stays put until tapped again. That is why
 * the toggle is a separate entry point from `preview`.
 */
export function useSliceSelection() {
  const activeIndex = ref(-1)

  function toggle(index) {
    activeIndex.value = activeIndex.value === index ? -1 : index
  }

  function preview(index, event) {
    if (isMousePointer(event)) activeIndex.value = index
  }

  function clearOnLeave(event) {
    if (isMousePointer(event)) activeIndex.value = -1
  }

  function clear() {
    activeIndex.value = -1
  }

  return { activeIndex, toggle, preview, clearOnLeave, clear }
}

import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Tracks the rendered width of an element so SVG charts can draw in real pixels
 * instead of being stretched by `preserveAspectRatio="none"` (which would distort
 * stroke widths and text).
 */
export function useElementSize(elementRef) {
  // Start from a sensible width so the first paint draws a real chart instead of
  // an empty state; the observer corrects it as soon as the element is measured.
  const width = ref(640)
  let observer = null

  onMounted(() => {
    const el = elementRef.value
    if (!el) return
    width.value = el.clientWidth
    if (typeof ResizeObserver === 'undefined') return
    observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) width.value = entry.contentRect.width
    })
    observer.observe(el)
  })

  onBeforeUnmount(() => observer?.disconnect())

  return width
}

let uidCounter = 0
export function nextUid(prefix = 'chart') {
  uidCounter += 1
  return `${prefix}-${uidCounter}`
}

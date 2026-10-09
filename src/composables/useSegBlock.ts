import { nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

/**
 * Keeps the sliding block under the active item of a segmented control.
 *
 * The item is found by the `aria-pressed` the control already carries, and it is measured
 * rather than computed from a count: these labels differ in width — `auto` sits next to
 * `ws_token` — so only a measurement lands on the item the block is supposed to cover.
 * Whatever makes the labels change width again (another language, a resized window) is
 * caught by watching the container's own size.
 */
export function useSegBlock(container: Ref<HTMLElement | null>, active: () => unknown) {
  const blockStyle = ref({ width: '0px', transform: 'translateX(0px)' })
  /** False until the first measurement, so the block does not animate in from the corner. */
  const blockReady = ref(false)
  let observer: ResizeObserver | null = null

  function sync() {
    const item = container.value?.querySelector<HTMLElement>('.seg__item[aria-pressed="true"]')
    if (!item) return
    blockStyle.value = {
      width: `${item.offsetWidth}px`,
      transform: `translateX(${item.offsetLeft}px)`,
    }
    blockReady.value = true
  }

  const schedule = () => void nextTick(sync)

  onMounted(() => {
    sync()
    if (typeof ResizeObserver === 'function' && container.value) {
      observer = new ResizeObserver(sync)
      observer.observe(container.value)
    }
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
  })

  watch(active, schedule)

  return { blockStyle, blockReady }
}

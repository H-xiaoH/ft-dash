import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Charts need a pixel height for their SVG maths, but a fixed one wastes space on
 * short windows and looks cramped on tall ones. This keeps them proportional to the
 * viewport within sensible bounds.
 */
export function useChartHeight(min: number, viewportRatio: number, max: number) {
  // Native resize listener instead of a dependency for a single hook.
  const height = ref(typeof window === 'undefined' ? 900 : window.innerHeight)
  const sync = () => {
    height.value = window.innerHeight
  }
  onMounted(() => window.addEventListener('resize', sync, { passive: true }))
  onBeforeUnmount(() => window.removeEventListener('resize', sync))

  return computed(() => Math.round(Math.min(max, Math.max(min, height.value * viewportRatio))))
}

import { computed } from 'vue'
import { useWindowSize } from '@vueuse/core'

/**
 * Charts need a pixel height for their SVG maths, but a fixed one wastes space on
 * short windows and looks cramped on tall ones. This keeps them proportional to the
 * viewport within sensible bounds.
 */
export function useChartHeight(min: number, viewportRatio: number, max: number) {
  const { height } = useWindowSize()
  return computed(() =>
    Math.round(Math.min(max, Math.max(min, (height.value || 900) * viewportRatio))),
  )
}

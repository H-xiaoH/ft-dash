import { computed } from 'vue'
import { useWindowSize } from '@vueuse/core'

export function useChartHeight(min: number, viewportRatio: number, max: number) {
  const { height } = useWindowSize({ initialHeight: 900 })
  return computed(() => Math.round(Math.min(max, Math.max(min, height.value * viewportRatio))))
}

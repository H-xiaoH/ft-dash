<script setup>
import { computed } from 'vue'

/**
 * Single-file icon set (no icon dependency, no network fetch).
 * Inner SVG markup is injected so each glyph can mix shapes and fills.
 */
const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 20 },
  stroke: { type: [Number, String], default: 1.8 },
})

const ICONS = {
  dashboard:
    '<rect x="3" y="3" width="7.5" height="8.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="5.5" rx="1.6"/><rect x="13.5" y="11" width="7.5" height="10" rx="1.6"/><rect x="3" y="14" width="7.5" height="7" rx="1.6"/>',
  trades:
    '<path d="M3 8h13"/><path d="M13 4.5 16.5 8 13 11.5"/><path d="M21 16H8"/><path d="M11 12.5 7.5 16 11 19.5"/>',
  candles:
    '<path d="M7 3v3M7 18v3M17 3v5M17 16v5"/><rect x="4.5" y="6" width="5" height="12" rx="1.2"/><rect x="14.5" y="8" width="5" height="8" rx="1.2"/>',
  stats:
    '<path d="M3 20.5h18"/><path d="M7.5 20.5v-6"/><path d="M12 20.5V4.5"/><path d="M16.5 20.5v-9"/>',
  market: '<path d="M3 17.5 9 11l4 4 8-8.5"/><path d="M15 6.5h6v6"/>',
  logs: '<path d="M5 3h9l5 5v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5"/><path d="M8.5 13h7M8.5 16.5h4.5"/>',
  system:
    '<rect x="6" y="6" width="12" height="12" rx="2.2"/><rect x="10" y="10" width="4" height="4" rx="1"/><path d="M9 2.5v3M15 2.5v3M9 18.5v3M15 18.5v3M2.5 9h3M2.5 15h3M18.5 9h3M18.5 15h3"/>',
  settings:
    '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3.2M12 18.3v3.2M4.3 7l2.8 1.6M16.9 15.4l2.8 1.6M4.3 17l2.8-1.6M16.9 8.6l2.8-1.6"/>',
  refresh:
    '<path d="M20 11.5A8 8 0 0 0 6.3 6.3L4 8.5"/><path d="M4 4.5v4h4"/><path d="M4 12.5A8 8 0 0 0 17.7 17.7L20 15.5"/><path d="M20 19.5v-4h-4"/>',
  play: '<path d="M7 4.8v14.4a1 1 0 0 0 1.5.87l11.2-7.2a1 1 0 0 0 0-1.74L8.5 3.93A1 1 0 0 0 7 4.8Z"/>',
  pause:
    '<rect x="6.5" y="4.5" width="3.6" height="15" rx="1.3"/><rect x="13.9" y="4.5" width="3.6" height="15" rx="1.3"/>',
  stop: '<rect x="5.5" y="5.5" width="13" height="13" rx="2.6"/>',
  power: '<path d="M12 3v9"/><path d="M6.8 6.8a7.5 7.5 0 1 0 10.4 0"/>',
  logout:
    '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 8 6 12l4 4"/><path d="M6 12h9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="M4.5 12.5 9.5 17.5 19.5 6.5"/>',
  chevronLeft: '<path d="M14.5 6 8.5 12l6 6"/>',
  chevronRight: '<path d="M9.5 6l6 6-6 6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
  wifi: '<path d="M4.5 9.5a11 11 0 0 1 15 0"/><path d="M7.5 12.8a7 7 0 0 1 9 0"/><path d="M10.4 16a3.2 3.2 0 0 1 3.2 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>',
  wifiOff:
    '<path d="M4.5 9.5a11 11 0 0 1 5-2.7"/><path d="M15.6 7.4a11 11 0 0 1 3.9 2.1"/><path d="M7.5 12.8a7 7 0 0 1 3.2-1.5"/><path d="M14 11.5a7 7 0 0 1 2.5 1.3"/><path d="M10.4 16a3.2 3.2 0 0 1 3.2 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/><path d="M3 3l18 18"/>',
  alert:
    '<path d="M12 3.5 21 19.5H3Z"/><path d="M12 9.5v4.5"/><circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r="1" fill="currentColor" stroke="none"/>',
  bolt: '<path d="M13.5 2.5 5 13.5h5l-1.5 8L18 10.5h-5.2Z"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2.4"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  trash:
    '<path d="M4.5 7h15"/><path d="M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7"/><path d="M6.5 7l.9 12.1A1.9 1.9 0 0 0 9.3 21h5.4a1.9 1.9 0 0 0 1.9-1.9L17.5 7"/>',
  install:
    '<path d="M12 3.5v11"/><path d="M7.5 10 12 14.5 16.5 10"/><path d="M4.5 17.5v1.6A1.4 1.4 0 0 0 5.9 20.5h12.2a1.4 1.4 0 0 0 1.4-1.4v-1.6"/>',
  arrowDown: '<path d="M12 4.5v15"/><path d="M6 13.5 12 19.5 18 13.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  wallet:
    '<rect x="3" y="6" width="18" height="13" rx="2.6"/><path d="M3 10.5h18"/><circle cx="16.5" cy="14.8" r="1.2" fill="currentColor" stroke="none"/>',
  percent:
    '<path d="M18.5 5.5 5.5 18.5"/><circle cx="7.5" cy="7.5" r="2.6"/><circle cx="16.5" cy="16.5" r="2.6"/>',
  target:
    '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
  user: '<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  key: '<circle cx="8" cy="15.5" r="4"/><path d="M10.9 12.6 20 3.5"/><path d="M17 6.5 19.5 9"/><path d="M14.5 9 17 11.5"/>',
  globe:
    '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.5 2.4 3.8 5.3 3.8 8.5S14.5 18.1 12 20.5c-2.5-2.4-3.8-5.3-3.8-8.5S9.5 5.9 12 3.5Z"/>',
  list: '<path d="M8 6.5h12M8 12h12M8 17.5h12"/><circle cx="4" cy="6.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="4" cy="17.5" r="1.2" fill="currentColor" stroke="none"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  activity: '<path d="M3 12h4l2.5-7 4.5 14 2.5-7h4.5"/>',
  pie: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5V12l6.2 5.8"/>',
  shield: '<path d="M12 3 20 6v5.5c0 4.6-3.2 8.3-8 9.5-4.8-1.2-8-4.9-8-9.5V6Z"/>',
  layers: '<path d="M12 3 3 8l9 5 9-5Z"/><path d="M3 13l9 5 9-5"/>',
  database:
    '<ellipse cx="12" cy="6" rx="8" ry="3.2"/><path d="M4 6v12c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2V6"/><path d="M4 12c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2"/>',
  sparkles:
    '<path d="M12 3.5l1.7 4.6 4.6 1.7-4.6 1.7L12 16.1l-1.7-4.6L5.7 9.8l4.6-1.7Z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  chartLine: '<path d="M3 16.5 8 11l4 3.5L21 5"/><path d="M3 20.5h18"/>',
  gauge: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-5"/>',
  dot: '<circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"/>',
}

const markup = computed(() => ICONS[props.name] || ICONS.dot)
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    v-html="markup"
  />
</template>

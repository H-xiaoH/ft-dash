<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import type { RouteRecordName } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { NAV_ROUTES } from '@/router'

interface Props {
  variant: 'rail' | 'tabbar'
  activeRouteName: RouteRecordName | null | undefined
  navIndex: number
  indicatorFraction: number
  indicatorTransition?: string
  dragging: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  railWheel: [event: WheelEvent]
}>()

const { t } = useI18n()

/**
 * How lit a bottom-bar tab is, as a percentage: full where the block is, and fading over
 * the tab either side of it. The block is the pointer here, so a tab lights up while a drag
 * carries the block across it — not when the route finally changes.
 */
function tabLit(index: number): string {
  const blocksAway = Math.abs(props.navIndex + props.indicatorFraction - index)
  return `${Math.round(Math.max(0, 1 - blocksAway) * 100)}%`
}

function forwardRailWheel(event: WheelEvent) {
  emit('railWheel', event)
}
</script>

<template>
  <!-- The wheel belongs to the rail: the parent keeps ownership of page-drag behavior. -->
  <nav v-if="variant === 'rail'" class="rail" :aria-label="t('app.name')" @wheel="forwardRailWheel">
    <div class="rail__brand" :title="t('app.tagline')">
      <span class="rail__dot" />
    </div>
    <RouterLink
      v-for="item in NAV_ROUTES"
      :key="item.name"
      :to="item.path"
      class="rail__item"
      :class="{ 'is-active': activeRouteName === item.name }"
      :aria-current="activeRouteName === item.name ? 'page' : undefined"
      :title="t(item.titleKey)"
    >
      <AppIcon :name="item.icon" :size="18" />
      <span class="rail__label">{{ t(item.titleKey) }}</span>
    </RouterLink>
    <span
      class="rail__indicator"
      aria-hidden="true"
      :style="{
        transform: `translateY(calc(${navIndex + indicatorFraction} * var(--rail-item)))`,
        transition: indicatorTransition,
      }"
    />
  </nav>

  <nav
    v-else
    class="tabbar"
    :style="{ '--nav-count': NAV_ROUTES.length }"
    :aria-label="t('app.name')"
  >
    <RouterLink
      v-for="(item, index) in NAV_ROUTES"
      :key="item.name"
      :to="item.path"
      class="tabbar__item"
      :class="{ 'is-active': activeRouteName === item.name }"
      :aria-current="activeRouteName === item.name ? 'page' : undefined"
      :style="{ '--lit': tabLit(index), transition: dragging ? 'none' : undefined }"
    >
      <AppIcon :name="item.icon" :size="19" />
      <span>{{ t(item.titleKey) }}</span>
    </RouterLink>
    <span
      class="tabbar__indicator"
      aria-hidden="true"
      :style="{
        transform: `translateX(calc(${navIndex + indicatorFraction} * 100%))`,
        transition: indicatorTransition,
      }"
    />
  </nav>
</template>

<style scoped>
.rail {
  --rail-item: 48px;
  position: sticky;
  top: 0;
  height: 100vh;
  height: 100dvh;
  border-right: 1px solid var(--line);
  background: var(--ink-850);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--sp-3) 0;
  gap: 2px;
  z-index: 30;
}

.rail__brand {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  border: 1px solid var(--line-strong);
  display: grid;
  place-items: center;
  margin-bottom: var(--sp-3);
}

.rail__dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--accent);
}

.rail__item {
  width: 46px;
  height: 46px;
  padding: 7px 0;
  border-radius: var(--r-1);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  color: var(--text-3);
  text-decoration: none;
  font-size: 10px;
  text-align: center;
  position: relative;
  z-index: 1;
}

/* The active background is a single block that slides between items. */
.rail__indicator {
  position: absolute;
  /* Where the first item starts: rail padding + brand (32px) + the brand gap (2px). */
  top: calc(2 * var(--sp-3) + 34px);
  width: 46px;
  height: 46px;
  border-radius: var(--r-1);
  /*
   * A token, not a mix: at 14% accent the block was #333, and a rail label sliding over it
   * dropped to 3.88:1 — under the 4.5:1 AA floor for those 10px labels. ink-700 keeps the
   * block visible while the label stays above 4.6:1 even mid-slide.
   */
  background: var(--ink-700);
  transition: transform var(--dur-slide) var(--ease-out-strong);
  pointer-events: none;
  /* Its own layer, so following the finger stays on whole device pixels. */
  will-change: transform;
}

/* No hover plate: it painted over the sliding indicator. The label just brightens. */
.rail__item:hover {
  color: var(--text);
}

.rail__item.is-active {
  color: var(--accent);
}

.rail__label {
  line-height: 1.2;
}

.tabbar {
  display: none;
}

@media (max-width: 900px) {
  .rail {
    display: none;
  }

  .tabbar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-between;
    background: color-mix(in srgb, var(--ink-850) 94%, transparent);
    backdrop-filter: blur(8px);
    border-top: 1px solid var(--line);
    padding: 6px 4px calc(6px + env(safe-area-inset-bottom, 0px));
    z-index: 30;
  }

  .tabbar__item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 4px 0;
    /*
     * Lit by the block travelling over it — the weight is how near the block is, handed in
     * per tab — and fading between muted and accent instead of snapping. The drag itself
     * overrides the transition, so the light is under the block rather than trailing it.
     */
    color: color-mix(in srgb, var(--accent) var(--lit, 0%), var(--text-3));
    transition: color var(--dur-slide) var(--ease-out-strong);
    text-decoration: none;
    font-size: 10px;
    position: relative;
    z-index: 1;
  }

  /* One sliding block behind the active tab. */
  .tabbar__indicator {
    position: absolute;
    /* Matches the tab box rather than the full bar, so the rounded corners stay visible. */
    top: 6px;
    bottom: calc(6px + env(safe-area-inset-bottom, 0px));
    left: 4px;
    /* One slot per tab, derived from the route table rather than hard-coded. */
    width: calc((100% - 8px) / var(--nav-count, 7));
    border-radius: var(--r-1);
    background: color-mix(in srgb, var(--accent) 14%, var(--ink-800));
    transition: transform var(--dur-slide) var(--ease-out-strong);
    pointer-events: none;
    /* Its own layer, so following the finger stays on whole device pixels. */
    will-change: transform;
  }
}
</style>

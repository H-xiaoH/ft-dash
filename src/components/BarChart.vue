<script setup lang="ts">
import { computed } from 'vue'
import type { BarItem } from './charts'

const props = withDefaults(
  defineProps<{
    items: BarItem[]
    height?: number
    maxLabels?: number
  }>(),
  { height: 150, maxLabels: 6 },
)

const maxAbs = computed(() => {
  const values = props.items.map((item) => Math.abs(item.value))
  return Math.max(1e-9, ...values)
})

const bars = computed(() =>
  props.items.map((item, index) => {
    const ratio = Math.abs(item.value) / maxAbs.value
    return {
      ...item,
      index,
      height: Math.max(item.value === 0 ? 1 : 3, ratio * 100),
      positive: item.value >= 0,
    }
  }),
)

const labelStep = computed(() =>
  Math.max(1, Math.ceil(props.items.length / Math.max(2, props.maxLabels))),
)

/** Only every Nth label is drawn; the row distributes them evenly so none overflow. */
const visibleLabels = computed(() =>
  bars.value.filter((bar) => bar.index % labelStep.value === 0),
)
</script>

<template>
  <div class="bars" :style="{ height: `${height}px` }">
    <div class="bars__plot">
      <div class="bars__zero" />
      <div
        v-for="bar in bars"
        :key="`${bar.label}-${bar.index}`"
        class="bars__slot"
        :title="`${bar.label} · ${bar.display}${bar.sub ? ` · ${bar.sub}` : ''}`"
      >
        <div class="bars__col bars__col--up">
          <div
            v-if="bar.positive"
            class="bars__bar bars__bar--up"
            :style="{ height: `${Math.min(50, (bar.height / 100) * 50)}%` }"
          />
        </div>
        <div class="bars__col bars__col--down">
          <div
            v-if="!bar.positive"
            class="bars__bar bars__bar--down"
            :style="{ height: `${Math.min(50, (bar.height / 100) * 50)}%` }"
          />
        </div>
      </div>
    </div>
    <div class="bars__labels" aria-hidden="true">
      <span v-for="bar in visibleLabels" :key="`label-${bar.index}`" class="bars__label">
        {{ bar.label }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.bars {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}

.bars__plot {
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 2px;
  flex: 1;
  min-height: 0;
  border-bottom: 1px solid var(--line);
}

.bars__zero {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  border-top: 1px dashed var(--line-strong);
}

.bars__slot {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  min-width: 2px;
}

.bars__col {
  height: 50%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.bars__col--down {
  align-items: flex-start;
}

.bars__bar {
  width: 100%;
  border-radius: 2px;
}

.bars__bar--up {
  background: var(--long);
  opacity: 0.85;
}

.bars__bar--down {
  background: var(--short);
  opacity: 0.85;
}

.bars__slot:hover .bars__bar {
  opacity: 1;
}

.bars__labels {
  display: flex;
  justify-content: space-between;
  gap: var(--sp-2);
  /* Keep the axis row at its natural height instead of shrinking it. */
  flex: none;
}

.bars__label {
  font-size: var(--fs-xs);
  line-height: 1.4;
  color: var(--text-3);
  font-family: var(--font-data);
  white-space: nowrap;
}
</style>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/useFormat'
import { useEventsStore } from '@/stores/events'
import AppIcon from './AppIcon.vue'

const props = withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })

const { t } = useI18n()
const format = useFormat()
const events = useEventsStore()
const scroller = ref<HTMLElement | null>(null)
const follow = ref(true)

const visible = computed(() => (props.compact ? events.events.slice(0, 6) : events.events))

const toneClass = (severity: string) =>
  severity === 'good'
    ? 'u-pos'
    : severity === 'bad'
      ? 'u-neg'
      : severity === 'warn'
        ? 'tape__warn'
        : ''

function label(type: string): string {
  const map: Record<string, string> = {
    entry: 'events.entry',
    entry_fill: 'events.entryFill',
    entry_cancel: 'events.entryCancel',
    exit: 'events.exit',
    exit_fill: 'events.exitFill',
    exit_cancel: 'events.exitCancel',
    protection_trigger: 'events.protection',
    protection_trigger_global: 'events.protection',
    warning: 'events.warning',
    exception: 'events.exception',
    startup: 'events.startup',
    shutdown: 'events.shutdown',
    strategy_msg: 'events.strategyMsg',
    status: 'events.status',
    whitelist: 'events.whitelist',
    'stream.connected': 'events.connected',
    'stream.disconnected': 'events.disconnected',
    'stream.auth': 'events.auth',
    action: 'actions.done',
  }
  const key = map[type]
  return key ? t(key) : type
}

watch(
  () => events.events[0]?.id,
  async () => {
    if (!follow.value || props.compact) return
    await nextTick()
    scroller.value?.scrollTo({ top: 0, behavior: 'smooth' })
  },
)
</script>

<template>
  <section class="panel tape" :class="{ 'tape--compact': compact }">
    <div class="panel__head">
      <span class="panel__title">{{ t('events.title') }}</span>
      <span class="chip" :class="events.isLive ? 'chip--good' : 'chip--warn'">
        {{ events.isLive ? t('common.live') : t('common.offline') }}
      </span>
      <div class="panel__actions">
        <span class="panel__meta num">{{ t('events.count', { n: events.events.length }) }}</span>
        <button
          type="button"
          class="btn btn--icon btn--ghost"
          :title="t('events.clear')"
          @click="events.clear()"
        >
          <AppIcon name="trash" />
        </button>
      </div>
    </div>

    <ol ref="scroller" class="tape__list" :class="{ 'tape__list--compact': compact }">
      <li v-if="visible.length === 0" class="empty">{{ t('events.empty') }}</li>
      <li v-for="event in visible" :key="event.id" class="tape__item">
        <span class="tape__time num">{{ format.dateTime(event.ts) }}</span>
        <span class="tape__kind" :class="toneClass(event.severity)">{{ label(event.type) }}</span>
        <span v-if="event.subject" class="tape__subject num">{{ event.subject }}</span>
        <span v-if="event.detail" class="tape__detail num muted">{{ event.detail }}</span>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.tape {
  min-height: 0;
  height: 100%;
}

.tape__list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.tape__list--compact {
  max-height: 210px;
}

.tape__item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px var(--sp-2);
  padding: var(--sp-2) var(--sp-4);
  border-bottom: 1px solid var(--line);
  font-size: var(--fs-sm);
  animation: tape-in 240ms ease-out;
}

@keyframes tape-in {
  from {
    opacity: 0;
    transform: translateY(-3px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.tape__time {
  color: var(--text-3);
  font-size: var(--fs-xs);
  white-space: nowrap;
}

.tape__kind {
  color: var(--text-2);
}

.tape__warn {
  color: var(--warn);
}

.tape__subject {
  grid-column: 2;
  color: var(--text);
  overflow-wrap: anywhere;
}

.tape__detail {
  grid-column: 2;
  overflow-wrap: anywhere;
}
</style>

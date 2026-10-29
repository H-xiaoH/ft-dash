<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import { HEARTBEAT_STALE_MS, useBotStore } from '@/stores/bot'
import { useEventsStore } from '@/stores/events'
import { useSettingsStore } from '@/stores/settings'

type NoticeAction = 'settings' | 'retry' | 'stream'

interface Notice {
  id: string
  priority: number
  tone: 'bad' | 'warn'
  title: string
  message: string
  action?: NoticeAction
}

const { t } = useI18n()
const bot = useBotStore()
const events = useEventsStore()
const settings = useSettingsStore()

const emit = defineEmits<{
  openSettings: []
  retry: []
  retryStream: []
}>()

const connectionMessage = computed(() => {
  if (bot.connection === 'unauthorized') return t('errors.auth')
  if (bot.connection !== 'unreachable') return null
  return bot.errorKey ? t(bot.errorKey.key, bot.errorKey.params ?? {}) : t('errors.cors')
})

const heartbeatLate = computed(
  () =>
    bot.connection === 'online' &&
    bot.heartbeatAgeMs !== null &&
    bot.heartbeatAgeMs > HEARTBEAT_STALE_MS,
)

const streamMessage = computed(() => {
  if (!settings.websocket) return null
  if (bot.streamReasonKey) return t(bot.streamReasonKey)
  if (events.status === 'error' || events.status === 'closed') {
    return t('notices.websocketDisconnected')
  }
  return null
})

const notices = computed<Notice[]>(() => {
  const next: Notice[] = []

  if (connectionMessage.value) {
    next.push({
      id: 'connection',
      priority: 10,
      tone: 'bad',
      title: t('connect.failed'),
      message: connectionMessage.value,
      action: bot.connection === 'unauthorized' ? 'settings' : 'retry',
    })
  }

  if (heartbeatLate.value) {
    next.push({
      id: 'heartbeat',
      priority: 20,
      tone: 'warn',
      title: t('notices.heartbeatTitle'),
      message: t('system.lagging'),
    })
  }

  if (streamMessage.value) {
    next.push({
      id: 'websocket',
      priority: 30,
      tone: 'warn',
      title: t('notices.websocketTitle'),
      message: streamMessage.value,
      action: 'stream',
    })
  }

  if (bot.compatibility?.warningKey) {
    next.push({
      id: 'compatibility',
      priority: 40,
      tone: 'warn',
      title: t('compatibility.title'),
      message: t(bot.compatibility.warningKey, bot.compatibility.warningParams ?? {}),
    })
  }

  return next.sort((a, b) => a.priority - b.priority)
})

function runAction(action: NoticeAction): void {
  if (action === 'settings') emit('openSettings')
  if (action === 'retry') emit('retry')
  if (action === 'stream') emit('retryStream')
}

/** The one button each notice can offer, and what it says. */
const ACTION_LABELS: Record<NoticeAction, string> = {
  settings: 'bots.openSettings',
  retry: 'common.retry',
  stream: 'settings.retryStream',
}
</script>

<template>
  <section
    v-if="notices.length"
    class="global-notices"
    :aria-label="t('notices.title')"
    aria-live="polite"
  >
    <div
      v-for="notice in notices"
      :key="notice.id"
      class="banner global-notices__item"
      :class="`banner--${notice.tone}`"
      role="status"
    >
      <AppIcon name="alert" :size="18" />
      <div class="banner__body">
        <div class="banner__title">{{ notice.title }}</div>
        <div class="banner__message">{{ notice.message }}</div>
      </div>
      <div v-if="notice.action" class="banner__actions">
        <button type="button" class="btn btn--sm" @click="runAction(notice.action)">
          {{ t(ACTION_LABELS[notice.action]) }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.global-notices {
  /* The bar itself carries the notch inset, so the notices have to start below it. */
  position: sticky;
  top: calc(var(--topbar-h) + env(safe-area-inset-top, 0px));
  z-index: 19;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--shell-pad) 0;
  background: var(--ink-900);
}

.global-notices__item {
  margin: 0;
}
</style>

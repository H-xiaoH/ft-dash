<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { HEARTBEAT_STALE_MS, useBotStore } from '@/stores/bot'

interface Notice {
  id: string
  priority: number
  tone: 'bad' | 'warn'
  title: string
  message: string
}

const { t } = useI18n()
const bot = useBotStore()

/**
 * Only an unreachable bot is reported here. A rejected session bounces back to the sign-in
 * form instead, because nothing on this shell can fix a password.
 */
const connectionMessage = computed(() => {
  if (bot.connection !== 'unreachable') return null
  return bot.errorKey ? t(bot.errorKey.key, bot.errorKey.params ?? {}) : t('errors.cors')
})

const heartbeatLate = computed(
  () =>
    bot.connection === 'online' &&
    bot.showConfig?.state !== 'stopped' &&
    bot.heartbeatAgeMs !== null &&
    bot.heartbeatAgeMs > HEARTBEAT_STALE_MS,
)

const notices = computed<Notice[]>(() => {
  const next: Notice[] = []

  if (connectionMessage.value) {
    next.push({
      id: 'connection',
      priority: 10,
      tone: 'bad',
      title: t('connect.failed'),
      // The poll keeps asking; that is the fix for an unreachable bot, so say so.
      message: `${connectionMessage.value} ${t('notices.autoRetry')}`,
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

  return next.sort((a, b) => a.priority - b.priority)
})
</script>

<template>
  <section
    v-if="notices.length"
    class="global-notices"
    :aria-label="t('notices.title')"
    aria-live="polite"
  >
    <VAlert
      v-for="notice in notices"
      :key="notice.id"
      :type="notice.tone === 'bad' ? 'error' : 'warning'"
      variant="tonal"
      :title="notice.title"
      :text="notice.message"
      class="global-notices__item"
      role="status"
    />
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

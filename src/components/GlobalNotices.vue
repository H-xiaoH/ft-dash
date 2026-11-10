<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ICON_PATHS } from '@/components/icons'
import { applyPwaUpdate, updateAvailable } from '@/pwa'
import { HEARTBEAT_STALE_MS, useBotStore } from '@/stores/bot'

interface Notice {
  id: string
  type: 'error' | 'warning' | 'info'
  title: string
  message: string
}

const props = defineProps<{ standalone?: boolean }>()
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

  if (!props.standalone && connectionMessage.value) {
    next.push({
      id: 'connection',
      type: 'error',
      title: t('connect.failed'),
      // The poll keeps asking; that is the fix for an unreachable bot, so say so.
      message: `${connectionMessage.value} ${t('notices.autoRetry')}`,
    })
  }

  if (!props.standalone && heartbeatLate.value) {
    next.push({
      id: 'heartbeat',
      type: 'warning',
      title: t('notices.heartbeatTitle'),
      message: t('system.lagging'),
    })
  }

  if (updateAvailable.value) {
    next.push({
      id: 'update',
      type: 'info',
      title: t('notices.updateAvailable'),
      message: t('notices.updateReload'),
    })
  }

  return next
})
</script>

<template>
  <section
    v-if="notices.length"
    class="global-notices"
    :class="{ 'global-notices--standalone': standalone }"
    :aria-label="t('notices.title')"
    aria-live="polite"
  >
    <VAlert
      v-for="notice in notices"
      :key="notice.id"
      :type="notice.type"
      :icon="notice.id === 'update' ? ICON_PATHS.refresh : undefined"
      variant="tonal"
      :title="notice.title"
      class="global-notices__item"
      role="status"
    >
      <template #text>
        <div>{{ notice.message }}</div>
      </template>
      <VBtn v-if="notice.id === 'update'" class="mt-2" color="info" @click="applyPwaUpdate">
        {{ t('notices.applyUpdate') }}
      </VBtn>
    </VAlert>
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
  padding: var(--sp-3) var(--shell-pad, var(--sp-4)) 0;
  background: var(--ink-900);
}

.global-notices--standalone {
  position: static;
  padding-top: calc(var(--sp-3) + env(safe-area-inset-top, 0px));
}

.global-notices__item {
  margin: 0;
}
</style>

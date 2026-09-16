<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { CORE_KEYS, useBotStore } from '@/stores/bot'
import { REFRESH_INTERVAL_MS } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import { applyUpdate, installAvailable, promptInstall, swUpdateReady } from '@/pwa/register'
import Icon from './Icon.vue'
import ToastHost from './ToastHost.vue'
import ConfirmDialog from './ConfirmDialog.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const bot = useBotStore()
const ui = useUiStore()

const { online, openTradesCount } = storeToRefs(bot)

const NAV = [
  { name: 'dashboard', label: '总览', icon: 'dashboard' },
  { name: 'trades', label: '交易', icon: 'trades' },
  { name: 'charts', label: 'K线', icon: 'candles' },
  { name: 'stats', label: '统计', icon: 'stats' },
  { name: 'market', label: '市场', icon: 'market' },
  { name: 'logs', label: '日志', icon: 'logs' },
  { name: 'system', label: '系统', icon: 'system' },
  { name: 'settings', label: '设置', icon: 'settings' },
]

const PRIMARY_NAV = NAV.slice(0, 4)
const SECONDARY_NAV = NAV.slice(4)

const showMore = ref(false)

function go(name) {
  showMore.value = false
  router.push({ name })
}

function logout() {
  auth.logout()
  bot.reset()
  router.push({ name: 'login' })
}

/* ------------------------------------------------- polling / visibility ---- */

/**
 * The always-on trading slices (open trades, profit, balance, ...) are polled
 * everywhere; each route can add its own via `meta.load` / `meta.poll`.
 * `meta.poll` is what makes the System page's sysinfo and the Logs page refresh
 * on their own instead of only when their refresh button is pressed.
 */
const routeLoadKeys = computed(() => [].concat(route.meta?.load || []))
const routePollKeys = computed(() => [].concat(route.meta?.poll || []))

const pollKeys = computed(() => [...new Set([...CORE_KEYS, ...routePollKeys.value])])

function refreshPolledKeys() {
  bot.loadMany(pollKeys.value, { silent: true })
}

let timer = null

function stopPolling() {
  clearInterval(timer)
  timer = null
}

function startPolling() {
  stopPolling()
  if (!auth.authenticated) return
  timer = setInterval(() => {
    if (document.hidden) return
    refreshPolledKeys()
  }, REFRESH_INTERVAL_MS)
}

watch(() => auth.authenticated, () => startPolling(), { immediate: true })

// Fetch what the freshly opened page needs. The first entry shows skeletons;
// later navigations update quietly so the page does not flash.
watch(
  () => route.name,
  () => {
    if (!auth.authenticated || !routeLoadKeys.value.length) return
    bot.loadMany(routeLoadKeys.value, { silent: bot.bootstrapped })
  },
  { immediate: true },
)

function onVisibility() {
  if (document.hidden || !auth.authenticated) return
  refreshPolledKeys()
}

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility)
  if (auth.authenticated) bot.refreshAll()
})

onBeforeUnmount(() => {
  stopPolling()
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <div class="app-shell">
    <aside class="app-sidebar">
      <div class="brand">
        <div class="brand-mark"><Icon name="candles" :size="20" /></div>
        <div class="grow">
          <div class="brand-name">Freqtrade</div>
          <div class="brand-sub truncate">{{ auth.host }}</div>
        </div>
      </div>

      <nav class="nav-list">
        <RouterLink
          v-for="item in NAV"
          :key="item.name"
          :to="{ name: item.name }"
          class="nav-item"
          :class="{ active: route.name === item.name }"
        >
          <span class="nav-icon"><Icon :name="item.icon" :size="18" /></span>
          <span class="nav-label">{{ item.label }}</span>
          <span v-if="item.name === 'trades' && openTradesCount" class="nav-badge">
            {{ openTradesCount }}
          </span>
        </RouterLink>
      </nav>

      <div class="sidebar-footer">
        <div class="row small faint">
          <Icon name="user" :size="14" />
          <span class="truncate">{{ auth.username || '未登录' }}</span>
        </div>
        <button class="btn btn--ghost btn--sm" style="justify-content: flex-start" @click="logout">
          <Icon name="logout" :size="15" />
          退出登录
        </button>
      </div>
    </aside>

    <div class="app-main">
      <main class="app-content">
        <div v-if="!online && auth.authenticated" class="conn-strip">
          <Icon name="wifiOff" :size="16" />
          <span class="grow">
            与机器人 {{ auth.host }} 的连接已中断，数据可能不是最新的。
          </span>
          <button class="btn btn--xs" @click="bot.refreshAll()">重试</button>
        </div>

        <div v-if="swUpdateReady" class="conn-strip" style="background: var(--info-soft); border-color: color-mix(in srgb, var(--info) 30%, transparent); color: var(--info)">
          <Icon name="sparkles" :size="16" />
          <span class="grow">有新版本可用。</span>
          <button class="btn btn--xs" @click="applyUpdate()">立即更新</button>
        </div>

        <slot />
      </main>
    </div>

    <nav class="app-bottomnav">
      <div class="bottomnav-inner">
        <RouterLink
          v-for="item in PRIMARY_NAV"
          :key="item.name"
          :to="{ name: item.name }"
          class="bottomnav-item"
          :class="{ active: route.name === item.name }"
        >
          <Icon :name="item.icon" :size="20" />
          <span>{{ item.label }}</span>
        </RouterLink>
        <button class="bottomnav-item" @click="showMore = true">
          <Icon name="menu" :size="20" />
          <span>更多</span>
        </button>
      </div>
    </nav>

    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showMore" class="modal-backdrop" @click.self="showMore = false">
          <div class="modal" style="max-width: 380px">
            <div class="modal-head">
              <span class="modal-title">更多</span>
              <button class="icon-btn" @click="showMore = false"><Icon name="close" :size="17" /></button>
            </div>
            <div class="modal-body" style="gap: 6px">
              <button
                v-for="item in SECONDARY_NAV"
                :key="item.name"
                class="nav-item"
                :class="{ active: route.name === item.name }"
                style="width: 100%"
                @click="go(item.name)"
              >
                <span class="nav-icon"><Icon :name="item.icon" :size="18" /></span>
                <span class="nav-label">{{ item.label }}</span>
                <Icon name="chevronRight" :size="16" class="faint" />
              </button>

              <div class="divider" style="margin: 8px 0" />

              <button v-if="installAvailable" class="nav-item" style="width: 100%" @click="promptInstall(); showMore = false">
                <span class="nav-icon"><Icon name="install" :size="18" /></span>
                <span class="nav-label">安装到桌面</span>
              </button>

              <button class="nav-item" style="width: 100%" @click="logout(); showMore = false">
                <span class="nav-icon"><Icon name="logout" :size="18" /></span>
                <span class="nav-label">退出登录</span>
              </button>

              <div class="tiny faint center" style="padding-top: 8px">
                {{ auth.username }} · {{ auth.transportLabel }} · v{{ bot.data.version?.version || '—' }}
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <ToastHost />
    <ConfirmDialog />
  </div>
</template>


import { createMemoryHistory, createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

/**
 * `meta.load`  - store slices fetched when the route is entered.
 * `meta.poll`  - extra slices added to the periodic refresh while on this route
 *                (the core trading slices are always polled).
 * Key names match the loader keys in stores/bot.js.
 */
const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/',
    name: 'dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: { title: '总览', icon: 'dashboard' },
  },
  {
    path: '/trades',
    name: 'trades',
    component: () => import('@/views/TradesView.vue'),
    meta: { title: '交易', icon: 'trades', load: ['trades'] },
  },
  {
    path: '/charts',
    name: 'charts',
    component: () => import('@/views/ChartsView.vue'),
    meta: { title: 'K线', icon: 'candles' },
  },
  {
    path: '/stats',
    name: 'stats',
    component: () => import('@/views/StatsView.vue'),
    meta: {
      title: '统计',
      icon: 'stats',
      load: ['performance', 'stats', 'daily', 'weekly', 'monthly'],
    },
  },
  {
    path: '/market',
    name: 'market',
    component: () => import('@/views/MarketView.vue'),
    meta: { title: '市场', icon: 'market', load: ['whitelist', 'blacklist'] },
  },
  {
    path: '/logs',
    name: 'logs',
    component: () => import('@/views/LogsView.vue'),
    meta: { title: '日志', icon: 'logs', load: ['logs'], poll: ['logs'] },
  },
  {
    path: '/system',
    name: 'system',
    component: () => import('@/views/SystemView.vue'),
    meta: {
      title: '系统',
      icon: 'system',
      // `strategies` is slow and 503s while the bot is running, so load it once
      // per entry but keep it out of the polling loop.
      load: ['sysinfo', 'health', 'version', 'config', 'strategies'],
      poll: ['sysinfo', 'health', 'version'],
    },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { title: '设置', icon: 'settings' },
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

// Web history needs a real browser History API; fall back to memory history in
// non-browser environments (SSR, smoke tests, prerendering).
const canUseWebHistory = typeof window !== 'undefined' && typeof window.history !== 'undefined'

const router = createRouter({
  history: canUseWebHistory ? createWebHistory() : createMemoryHistory(),
  routes,
  scrollBehavior(to, from, saved) {
    return saved || { top: 0 }
  },
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!to.meta?.public && !auth.authenticated) {
    return { name: 'login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } }
  }
  if (to.name === 'login' && auth.authenticated) {
    return { name: 'dashboard' }
  }
  return true
})

router.afterEach((to) => {
  const title = to.meta?.title
  document.title = title ? `${title} · FT Dash` : 'Freqtrade Dashboard'
})

export default router
export { routes }

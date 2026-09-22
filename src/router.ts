import { createRouter, createWebHashHistory } from 'vue-router'
import type { IconName } from '@/components/icons'

export interface NavRoute {
  path: string
  name: string
  titleKey: string
  icon: IconName
}

export const NAV_ROUTES: NavRoute[] = [
  { path: '/', name: 'dashboard', titleKey: 'nav.dashboard', icon: 'overview' },
  { path: '/trades', name: 'trades', titleKey: 'nav.trades', icon: 'trades' },
  { path: '/stats', name: 'stats', titleKey: 'nav.stats', icon: 'stats' },
  { path: '/market', name: 'market', titleKey: 'nav.market', icon: 'market' },
  { path: '/logs', name: 'logs', titleKey: 'nav.logs', icon: 'logs' },
  { path: '/system', name: 'system', titleKey: 'nav.system', icon: 'system' },
  { path: '/settings', name: 'settings', titleKey: 'nav.settings', icon: 'settings' },
]

export const router = createRouter({
  // Hash history keeps deep links working on GitHub Pages without a 404 rewrite.
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
    },
    {
      path: '/trades',
      name: 'trades',
      component: () => import('@/views/TradesView.vue'),
    },
    {
      path: '/stats',
      name: 'stats',
      component: () => import('@/views/StatsView.vue'),
    },
    {
      path: '/market',
      name: 'market',
      component: () => import('@/views/MarketView.vue'),
    },
    {
      path: '/logs',
      name: 'logs',
      component: () => import('@/views/LogsView.vue'),
    },
    {
      path: '/system',
      name: 'system',
      component: () => import('@/views/SystemView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  /**
   * Only a change of page resets the scroll position. Query-only navigation (opening a
   * trade detail, switching the trades tab) must not yank a scrolled list back to the top.
   */
  scrollBehavior: (to, from) => (to.path === from.path ? false : { top: 0 }),
})

import { createRouter, createWebHashHistory } from 'vue-router'
import type { IconName } from '@/components/icons'
import { pushToast } from '@/composables/useToast'
import { i18n } from '@/i18n'

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

export const MORE_ROUTE: NavRoute = {
  path: '/more',
  name: 'more',
  titleKey: 'nav.more',
  icon: 'more',
}
export const MOBILE_NAV_ROUTES = [...NAV_ROUTES.slice(0, 4), MORE_ROUTE]
export const SECONDARY_ROUTES = NAV_ROUTES.slice(4)

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
    { path: '/more', name: 'more', component: () => import('@/views/MoreView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  // Each Swiper page owns its scroll position, including query-only detail navigation.
  scrollBehavior: () => false,
})

/**
 * Views load as separate chunks. When one fails — offline, flaky network, a proxy in the
 * way — the navigation dies with nothing but a console error, so say something instead.
 */
router.onError(() => {
  pushToast(i18n.global.t('errors.pageLoad'), 'bad')
})

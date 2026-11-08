import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { h, ref } from 'vue'
import { VLayout } from 'vuetify/components/VLayout'
import AppNavigation from '@/components/AppNavigation.vue'
import { i18n } from '@/i18n'
import { NAV_ROUTES, MORE_ROUTE } from '@/router'
const { wide } = vi.hoisted(() => ({ wide: { value: false } }))
vi.mock('@vueuse/core', async (original) => ({
  ...(await original<typeof import('@vueuse/core')>()),
  useMediaQuery: () => ref(wide.value),
}))
async function render(variant: 'rail' | 'tabbar', path = '/stats') {
  wide.value = variant === 'rail'
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [...NAV_ROUTES, MORE_ROUTE].map((r) => ({
      path: r.path,
      name: r.name,
      component: { template: '<div />' },
    })),
  })
  await router.push(path)
  const wrapper = mount(VLayout, {
    slots: { default: () => h(AppNavigation, { variant }) },
    global: { plugins: [router, i18n] },
  })
  return wrapper
}
describe('AppNavigation', () => {
  it.each(['rail', 'tabbar'] as const)(
    'renders shared routes and one current page in %s',
    async (variant) => {
      const wrapper = await render(variant)
      const links = wrapper.findAll('a')
      expect(links.every((a) => a.attributes('role') !== 'listitem')).toBe(true)
      expect(links.map((a) => a.attributes('href'))).toEqual(
        variant === 'rail'
          ? NAV_ROUTES.map((r) => r.path)
          : ['/', '/trades', '/stats', '/market', '/more'],
      )
      expect(links.filter((a) => a.attributes('aria-current') === 'page')).toHaveLength(1)
      expect(links[2].attributes('aria-current')).toBe('page')
    },
  )
  it('keeps More selected for a direct secondary route', async () => {
    const wrapper = await render('tabbar', '/settings')
    expect(wrapper.get('a[aria-current="page"]').attributes('href')).toBe('/more')
  })
  it('forwards rail wheel input to the page owner', async () => {
    const wrapper = await render('rail')
    const event = new WheelEvent('wheel', { deltaY: 90 })
    wrapper.get('.rail').element.dispatchEvent(event)
    expect(wrapper.findComponent(AppNavigation).emitted('railWheel')?.[0]).toEqual([event])
  })
})

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import AppNavigation from '@/components/AppNavigation.vue'
import { i18n } from '@/i18n'
import { NAV_ROUTES } from '@/router'

const RouterLinkStub = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
}

const global = {
  plugins: [i18n],
  stubs: { RouterLink: RouterLinkStub },
}
const mountedWrappers: Array<{ unmount: () => void }> = []

function mountNavigation(variant: 'rail' | 'tabbar') {
  const wrapper = mount(AppNavigation, {
    global,
    props: {
      variant,
      activeRouteName: 'stats',
      navIndex: 2,
      indicatorFraction: 0.5,
      indicatorTransition: 'transform 180ms ease-out',
      dragging: true,
    },
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  document.body.innerHTML = ''
})

describe('AppNavigation', () => {
  it('renders each navigation mode from the shared route table', () => {
    const rail = mountNavigation('rail')
    const tabbar = mountNavigation('tabbar')

    expect(rail.findAll('.rail__item').map((item) => item.attributes('href'))).toEqual(
      NAV_ROUTES.map((item) => item.path),
    )
    expect(tabbar.findAll('.tabbar__item').map((item) => item.attributes('href'))).toEqual(
      NAV_ROUTES.map((item) => item.path),
    )
    expect(rail.find('.tabbar').exists()).toBe(false)
    expect(tabbar.find('.rail').exists()).toBe(false)
  })

  it('marks the active route in both navigation modes', () => {
    const rail = mountNavigation('rail')
    const tabbar = mountNavigation('tabbar')
    const activeRailItem = rail.findAll('.rail__item')[2]
    const activeTabItem = tabbar.findAll('.tabbar__item')[2]

    expect(activeRailItem.classes()).toContain('is-active')
    expect(activeTabItem.classes()).toContain('is-active')
    expect(activeRailItem.attributes('aria-current')).toBe('page')
    expect(activeTabItem.attributes('aria-current')).toBe('page')
    expect(rail.findAll('.rail__item').filter((item) => item.classes('is-active'))).toHaveLength(1)
    expect(
      tabbar.findAll('.tabbar__item').filter((item) => item.classes('is-active')),
    ).toHaveLength(1)
    expect(rail.findAll('.rail__item')[0].attributes('aria-current')).toBeUndefined()
    expect(tabbar.findAll('.tabbar__item')[0].attributes('aria-current')).toBeUndefined()
  })

  it('keeps the indicators and tab lighting aligned with the dragged route', () => {
    const rail = mountNavigation('rail')
    const tabbar = mountNavigation('tabbar')
    const railIndicator = rail.find('.rail__indicator').attributes('style')
    const tabIndicator = tabbar.find('.tabbar__indicator').attributes('style')
    const tabItems = tabbar.findAll('.tabbar__item')

    expect(railIndicator).toContain('translateY(calc(2.5 * var(--rail-item)))')
    expect(railIndicator).toContain('transition: transform 180ms ease-out')
    expect(tabIndicator).toContain('translateX(calc(2.5 * 100%))')
    expect(tabIndicator).toContain('transition: transform 180ms ease-out')
    expect(tabItems[2].attributes('style')).toContain('--lit: 50%')
    expect(tabItems[3].attributes('style')).toContain('--lit: 50%')
    expect(tabItems[1].attributes('style')).toContain('--lit: 0%')
    expect(tabItems[2].attributes('style')).toContain('transition: none')
  })

  it('forwards rail wheel input to the page-drag owner', async () => {
    const wrapper = mountNavigation('rail')
    const event = new WheelEvent('wheel', { deltaY: 90 })

    wrapper.find('.rail').element.dispatchEvent(event)

    const wheelEvent = wrapper.emitted('railWheel')?.[0]?.[0]
    expect(wheelEvent).toBe(event)
    expect((wheelEvent as WheelEvent).deltaY).toBe(90)
  })
})

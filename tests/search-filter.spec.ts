import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import FilterMenu from '@/components/FilterMenu.vue'
import SearchToggle from '@/components/SearchToggle.vue'
import { i18n } from '@/i18n'

const global = { plugins: [i18n] }

describe('SearchToggle', () => {
  it('stays collapsed until the icon is clicked', async () => {
    const wrapper = mount(SearchToggle, { props: { placeholder: 'Find' }, global })
    expect(wrapper.find('input').exists()).toBe(false)

    await wrapper.find('button').trigger('click')
    const input = wrapper.find('input')
    expect(input.exists()).toBe(true)
    expect(input.attributes('placeholder')).toBe('Find')
  })

  it('emits the typed term and clears it when collapsed', async () => {
    const wrapper = mount(SearchToggle, { global })
    await wrapper.find('button').trigger('click')
    await wrapper.find('input').setValue('btc')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['btc'])

    await wrapper.find('.search-toggle__close').trigger('click')
    expect(wrapper.find('input').exists()).toBe(false)
    // Closing must not leave an invisible filter behind.
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([''])
  })

  it('closes on Escape', async () => {
    const wrapper = mount(SearchToggle, { global })
    await wrapper.find('button').trigger('click')
    await wrapper.find('input').setValue('eth')
    await wrapper.find('input').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([''])
  })
})

describe('FilterMenu', () => {
  const options = [
    { value: 'all', label: 'All' },
    { value: 'win', label: 'Wins' },
    { value: 'loss', label: 'Losses' },
  ]

  it('shows the active option on the button and only lists values when opened', async () => {
    const wrapper = mount(FilterMenu, { props: { options, prefix: 'P&L' }, global })
    expect(wrapper.find('.filter-menu__button').text()).toContain('All')
    expect(wrapper.findAll('.filter-menu__item')).toHaveLength(0)

    await wrapper.find('.filter-menu__button').trigger('click')
    expect(wrapper.findAll('.filter-menu__item').map((item) => item.text())).toEqual([
      'All',
      'Wins',
      'Losses',
    ])
  })

  it('emits the chosen value and closes', async () => {
    const wrapper = mount(FilterMenu, {
      props: { modelValue: 'all', options },
      global,
      'onUpdate:modelValue': (value: string) => wrapper.setProps({ modelValue: value }),
    })
    await wrapper.find('.filter-menu__button').trigger('click')
    await wrapper.findAll('.filter-menu__item')[1].trigger('click')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['win'])
    expect(wrapper.findAll('.filter-menu__item')).toHaveLength(0)
  })

  it('closes when the backdrop is clicked', async () => {
    const wrapper = mount(FilterMenu, { props: { options }, global })
    await wrapper.find('.filter-menu__button').trigger('click')
    expect(wrapper.find('.filter-menu__list').exists()).toBe(true)
    await wrapper.find('.filter-menu__backdrop').trigger('click')
    expect(wrapper.find('.filter-menu__list').exists()).toBe(false)
  })
})

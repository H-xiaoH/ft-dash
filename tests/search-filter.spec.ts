import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import FilterMenu from '@/components/FilterMenu.vue'
import SearchToggle from '@/components/SearchToggle.vue'
import { i18n } from '@/i18n'

const global = { plugins: [i18n] }
const mountedWrappers: Array<{ unmount: () => void }> = []

function mountTracked(...args: Parameters<typeof mount>): ReturnType<typeof mount> {
  const wrapper = mount(...args)
  mountedWrappers.push(wrapper)
  return wrapper
}

/** The filter popup is teleported to <body>, so it is queried from the document. */
function popupItems(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.filter-menu__item')]
}

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  document.body.innerHTML = ''
})

describe('SearchToggle', () => {
  it('stays collapsed until the icon is clicked', async () => {
    const wrapper = mountTracked(SearchToggle, { props: { placeholder: 'Find' }, global })
    expect(wrapper.find('input').exists()).toBe(false)

    await wrapper.find('button').trigger('click')
    const input = wrapper.find('input')
    expect(input.exists()).toBe(true)
    expect(input.attributes('placeholder')).toBe('Find')
  })

  it('emits the typed term and clears it when collapsed', async () => {
    const wrapper = mountTracked(SearchToggle, { global })
    await wrapper.find('button').trigger('click')
    await wrapper.find('input').setValue('btc')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['btc'])

    await wrapper.find('.search-toggle__close').trigger('click')
    expect(wrapper.find('input').exists()).toBe(false)
    // Closing must not leave an invisible filter behind.
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([''])
  })

  it('closes on Escape', async () => {
    const wrapper = mountTracked(SearchToggle, { global })
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
    const wrapper = mountTracked(FilterMenu, { props: { options, prefix: 'P&L' }, global })
    expect(wrapper.find('.filter-menu__button').text()).toContain('All')
    expect(popupItems()).toHaveLength(0)

    await wrapper.find('.filter-menu__button').trigger('click')
    expect(popupItems().map((item) => item.textContent)).toEqual(['All', 'Wins', 'Losses'])
  })

  it('emits the chosen value and closes', async () => {
    const wrapper = mountTracked(FilterMenu, {
      props: { modelValue: 'all', options },
      global,
      'onUpdate:modelValue': (value: string) => wrapper.setProps({ modelValue: value }),
    })
    await wrapper.find('.filter-menu__button').trigger('click')
    popupItems()[1].click()
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['win'])
    expect(popupItems()).toHaveLength(0)
  })

  it('closes when the backdrop is clicked', async () => {
    const wrapper = mountTracked(FilterMenu, { props: { options }, global })
    await wrapper.find('.filter-menu__button').trigger('click')
    expect(document.querySelector('.filter-menu__list')).not.toBeNull()
    ;(document.querySelector('.filter-menu__backdrop') as HTMLElement).click()
    await nextTick()
    expect(document.querySelector('.filter-menu__list')).toBeNull()
  })

  it('filters searchable options by label, value, and search alias', async () => {
    const searchableOptions = [
      { value: 'browser', label: 'Follow browser' },
      { value: 'tz-shanghai', label: 'Shanghai' },
      { value: 'tz-tokyo', label: 'Tokyo' },
    ]
    const wrapper = mountTracked(FilterMenu, {
      props: {
        options: searchableOptions,
        searchable: true,
        searchText: { browser: 'Asia/Shanghai' },
      },
      global,
    })

    await wrapper.find('.filter-menu__button').trigger('click')
    const input = document.querySelector<HTMLInputElement>('.filter-menu__input')!

    input.value = 'tz-tokyo'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    expect(popupItems().map((item) => item.textContent)).toEqual(['Tokyo'])

    input.value = 'Asia/Shanghai'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    expect(popupItems().map((item) => item.textContent)).toEqual(['Follow browser'])
  })

  it('shows a no-match state and clears the query for the next opening', async () => {
    const wrapper = mountTracked(FilterMenu, {
      props: { options, searchable: true },
      global,
    })

    await wrapper.find('.filter-menu__button').trigger('click')
    const input = document.querySelector<HTMLInputElement>('.filter-menu__input')!
    input.value = 'nowhere'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    expect(popupItems()).toHaveLength(0)
    expect(document.querySelector('.filter-menu__empty')).not.toBeNull()

    ;(document.querySelector('.filter-menu__reset') as HTMLElement).click()
    await nextTick()
    expect(popupItems()).toHaveLength(options.length)
    expect(document.querySelector('.filter-menu__empty')).toBeNull()

    popupItems()[0].click()
    await nextTick()
    await wrapper.find('.filter-menu__button').trigger('click')
    expect(document.querySelector<HTMLInputElement>('.filter-menu__input')!.value).toBe('')
    expect(popupItems()).toHaveLength(options.length)
  })
})

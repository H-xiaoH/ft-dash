import { flushPromises, mount } from '@vue/test-utils'
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
  return [...document.querySelectorAll<HTMLElement>('.v-overlay--active [role="option"]')]
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
    expect(wrapper.find('label').text()).toContain('Find')
  })

  it('emits the typed term and clears it when collapsed', async () => {
    const wrapper = mountTracked(SearchToggle, { global })
    await wrapper.find('button').trigger('click')
    await wrapper.find('input').setValue('btc')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['btc'])

    await wrapper.find('.v-field__clearable [role="button"]').trigger('click')
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
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['win'])
    expect(popupItems()).toHaveLength(0)
  })

  it('exposes the selected option and closes on an outside click', async () => {
    const wrapper = mountTracked(FilterMenu, {
      attachTo: document.body,
      props: { modelValue: 'win', options },
      global,
    })
    await wrapper.get('.filter-menu__button').trigger('click')
    await flushPromises()
    expect(popupItems()[1].getAttribute('aria-selected')).toBe('true')
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 10))
    await flushPromises()
    expect(popupItems()).toHaveLength(0)
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
    const input = document.querySelector<HTMLInputElement>('.filter-menu__list input')!

    input.value = 'tz-tokyo'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    expect(popupItems().map((item) => item.textContent)).toEqual(['Tokyo'])

    input.value = 'Asia/Shanghai'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    expect(popupItems().map((item) => item.textContent)).toEqual(['Follow browser'])
  })

  it('shows a no-match state and clears the query for the next opening', async () => {
    const wrapper = mountTracked(FilterMenu, {
      props: { options, searchable: true },
      global,
    })

    await wrapper.find('.filter-menu__button').trigger('click')
    const input = document.querySelector<HTMLInputElement>('.filter-menu__list input')!
    input.value = 'nowhere'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()

    expect(popupItems()).toHaveLength(0)
    expect(document.querySelector('.filter-menu__list .v-empty-state')).not.toBeNull()

    ;(
      document.querySelector(
        '.filter-menu__list .v-field__clearable [role="button"]',
      ) as HTMLElement
    ).click()
    await new Promise((resolve) => setTimeout(resolve, 10))
    await flushPromises()
    expect(popupItems()).toHaveLength(options.length)
    expect(document.querySelector('.filter-menu__list .v-empty-state')).toBeNull()

    popupItems()[0].click()
    await new Promise((resolve) => setTimeout(resolve, 350))
    await flushPromises()
    await wrapper.find('.filter-menu__button').trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 350))
    await flushPromises()
    expect(document.querySelector<HTMLInputElement>('.filter-menu__list input')!.value).toBe('')
    expect(popupItems()).toHaveLength(options.length)
  })
})

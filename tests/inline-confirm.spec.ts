import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import InlineConfirm from '@/components/InlineConfirm.vue'

describe('InlineConfirm', () => {
  it('renders a centered alert banner with its labels and message', () => {
    const wrapper = mount(InlineConfirm, {
      props: {
        open: true,
        message: '确认关闭这笔交易？',
        confirmLabel: '确认',
        cancelLabel: '取消',
      },
    })

    expect(wrapper.find('[role="alert"].banner').text()).toContain('确认关闭这笔交易？')
    expect(wrapper.find('.inline-confirm__message').text()).toBe('确认关闭这笔交易？')
    expect(wrapper.find('button').text()).toContain('确认')
    expect(wrapper.findAll('button')[1].text()).toContain('取消')
  })

  it('emits typed confirm and cancel events, and disables confirm while pending', async () => {
    const wrapper = mount(InlineConfirm, {
      props: {
        open: true,
        message: '确认？',
        confirmLabel: '确认',
        cancelLabel: '取消',
        pending: true,
      },
    })

    const buttons = wrapper.findAll('button')
    expect(buttons[0].attributes('disabled')).toBeDefined()
    await buttons[0].trigger('click')
    await buttons[1].trigger('click')

    expect(wrapper.emitted('confirm')).toBeUndefined()
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })
})

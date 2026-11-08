import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { i18n } from '@/i18n'

afterEach(() => {
  document.body.innerHTML = ''
})
const render = () =>
  mount(ConfirmDialog, {
    attachTo: document.body,
    props: {
      open: true,
      title: '确认操作',
      confirmLabel: '确认',
      cancelLabel: '取消',
      requireText: 'BTC/USDT',
    },
    global: { plugins: [i18n] },
  })
describe('confirmation safety through Vuetify dialog', () => {
  it('labels its dialog and requires the exact pair before confirming', async () => {
    const wrapper = render()
    await flushPromises()
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog).not.toBeNull()
    const title = document.getElementById(dialog.getAttribute('aria-labelledby')!)
    expect(title?.textContent).toBe('确认操作')
    const input = dialog.querySelector('input')!
    const confirm = dialog.querySelector<HTMLButtonElement>('.v-card-actions button:last-child')!
    expect(confirm.disabled).toBe(true)
    input.value = 'BTC'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    expect(confirm.disabled).toBe(true)
    input.value = 'BTC/USDT'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    expect(confirm.disabled).toBe(false)
    confirm.click()
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })
  it('blocks repeated confirmation while pending and clears input when reopened', async () => {
    const wrapper = render()
    await flushPromises()
    const input = document.querySelector('input')!
    input.value = 'BTC/USDT'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    await wrapper.setProps({ pending: true })
    const confirm = document.querySelector<HTMLButtonElement>('.v-card-actions button:last-child')!
    expect(confirm.disabled).toBe(true)
    confirm.click()
    expect(wrapper.emitted('confirm')).toBeUndefined()
    await wrapper.setProps({ open: false, pending: false })
    await wrapper.setProps({ open: true })
    await flushPromises()
    expect(document.querySelector<HTMLInputElement>('input')?.value).toBe('')
  })
})

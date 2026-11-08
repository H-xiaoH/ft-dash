import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { i18n } from '@/i18n'

it('makes a closing dialog inert and prevents confirmation during leave', async () => {
  const wrapper = mount(ConfirmDialog, {
    props: { open: true, title: 'Confirm', confirmLabel: 'Proceed' },
    attachTo: document.body,
    global: { plugins: [i18n], stubs: { transition: false } },
  })
  const button = document.body.querySelector<HTMLButtonElement>(
    '.v-card-actions button:last-child',
  )!
  await wrapper.setProps({ open: false })
  expect(document.body.querySelector('.v-overlay--active')).toBeNull()
  button.click()
  expect(wrapper.emitted('confirm')).toBeUndefined()
  wrapper.unmount()
})

import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { i18n } from '@/i18n'

const mountedWrappers: VueWrapper[] = []

function mountDialog(open = true) {
  const wrapper = mount(ConfirmDialog, {
    attachTo: document.body,
    global: { plugins: [i18n] },
    props: { open, title: '确认操作' },
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  document.body.innerHTML = ''
  document.body.style.overflow = ''
})

describe('useModalFocus through ConfirmDialog', () => {
  it('keeps the page inert and locked until the last nested modal closes', async () => {
    const shell = document.createElement('div')
    shell.className = 'shell'
    document.body.append(shell)

    const first = mountDialog()
    const second = mountDialog()
    await first.vm.$nextTick()

    expect(shell.hasAttribute('inert')).toBe(true)
    expect(document.body.style.overflow).toBe('hidden')

    await first.setProps({ open: false })
    expect(shell.hasAttribute('inert')).toBe(true)
    expect(document.body.style.overflow).toBe('hidden')

    await second.setProps({ open: false })
    expect(shell.hasAttribute('inert')).toBe(false)
    expect(document.body.style.overflow).toBe('')
  })

  it('releases its lock when an open modal is unmounted', async () => {
    const shell = document.createElement('div')
    shell.className = 'shell'
    document.body.append(shell)

    const wrapper = mountDialog()
    await wrapper.vm.$nextTick()
    expect(shell.hasAttribute('inert')).toBe(true)
    expect(document.body.style.overflow).toBe('hidden')

    wrapper.unmount()
    expect(shell.hasAttribute('inert')).toBe(false)
    expect(document.body.style.overflow).toBe('')
  })

  it('restores the original body overflow value after the last modal closes', async () => {
    const shell = document.createElement('div')
    shell.className = 'shell'
    document.body.append(shell)
    document.body.style.overflow = 'scroll'

    const wrapper = mountDialog()
    await wrapper.vm.$nextTick()
    expect(document.body.style.overflow).toBe('hidden')

    await wrapper.setProps({ open: false })
    expect(document.body.style.overflow).toBe('scroll')
  })

  it('restores the original background focus when the outer modal closes first', async () => {
    const shell = document.createElement('div')
    shell.className = 'shell'
    const backgroundButton = document.createElement('button')
    backgroundButton.textContent = '背景动作'
    shell.append(backgroundButton)
    document.body.append(shell)
    backgroundButton.focus()

    const outer = mountDialog()
    const inner = mountDialog()
    await inner.vm.$nextTick()

    await outer.setProps({ open: false })
    inner.unmount()

    expect(document.activeElement).toBe(backgroundButton)
  })
})

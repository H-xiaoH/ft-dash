import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
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

  it('restores background focus after the outer modal closes and reopens around a nested modal', async () => {
    const shell = document.createElement('div')
    shell.className = 'shell'
    const backgroundButton = document.createElement('button')
    backgroundButton.textContent = '背景动作'
    shell.append(backgroundButton)
    document.body.append(shell)
    backgroundButton.focus()

    const outer = mountDialog()
    await nextTick()
    const inner = mountDialog()
    await nextTick()

    // Browser back removes the drawer while its confirmation stays open; forward reopens it.
    await outer.setProps({ open: false })
    await outer.setProps({ open: true })
    await nextTick()
    expect(shell.hasAttribute('inert')).toBe(true)

    await outer.setProps({ open: false })
    await inner.setProps({ open: false })
    await nextTick()
    expect(shell.hasAttribute('inert')).toBe(false)
    expect(document.body.style.overflow).toBe('')
    expect(document.activeElement).toBe(backgroundButton)
  })

  it('keeps the reopened outer modal focused when the older nested modal closes first', async () => {
    const shell = document.createElement('div')
    shell.className = 'shell'
    const backgroundButton = document.createElement('button')
    shell.append(backgroundButton)
    document.body.append(shell)
    backgroundButton.focus()

    const outer = mountDialog()
    await nextTick()
    const inner = mountDialog()
    await nextTick()
    await outer.setProps({ open: false })
    await outer.setProps({ open: true })
    await nextTick()

    const outerPanel = document.body.querySelector<HTMLElement>('.dialog')
    await inner.setProps({ open: false })
    await nextTick()
    expect(document.activeElement).toBe(outerPanel)

    await outer.setProps({ open: false })
    await nextTick()
    expect(document.activeElement).toBe(backgroundButton)
  })

  it('restores focus to the outer panel and lets only the top modal handle Escape', async () => {
    const shell = document.createElement('div')
    shell.className = 'shell'
    const backgroundButton = document.createElement('button')
    backgroundButton.textContent = '背景动作'
    shell.append(backgroundButton)
    document.body.append(shell)
    backgroundButton.focus()

    const outer = mountDialog()
    await nextTick()
    const outerPanel = document.body.querySelector<HTMLElement>('.dialog')
    expect(outerPanel).not.toBeNull()
    expect(document.activeElement).toBe(outerPanel)

    const inner = mountDialog()
    await nextTick()
    const innerPanel = document.body.querySelectorAll<HTMLElement>('.dialog')[1]
    expect(innerPanel).toBeDefined()
    expect(document.activeElement).toBe(innerPanel)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(inner.emitted('cancel')).toHaveLength(1)
    expect(outer.emitted('cancel')).toBeUndefined()

    await inner.setProps({ open: false })
    await nextTick()
    expect(document.activeElement).toBe(outerPanel)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(outer.emitted('cancel')).toHaveLength(1)

    await outer.setProps({ open: false })
    await nextTick()
    expect(document.activeElement).toBe(backgroundButton)
  })
})

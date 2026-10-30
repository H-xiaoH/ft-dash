import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import MetricTile from '@/components/MetricTile.vue'
import { i18n } from '@/i18n'

/**
 * Four pages draw these tiles; only the statistics page asks for the clickable form, so
 * the default must stay a plain div.
 */
const mounted: VueWrapper[] = []

function mountTile(props: Record<string, unknown> = {}) {
  const wrapper = mount(MetricTile, {
    global: { plugins: [i18n] },
    props: { label: '夏普', value: 1.4, ...props },
  })
  mounted.push(wrapper)
  return wrapper
}

beforeEach(() => setActivePinia(createPinia()))

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
})

describe('MetricTile', () => {
  it('stays a plain tile until a page asks for the clickable form', async () => {
    const plain = mountTile()
    expect(plain.element.tagName).toBe('DIV')
    expect(plain.find('button').exists()).toBe(false)

    const clickable = mountTile({ interactive: true })
    const button = clickable.get('button')
    expect(button.attributes('type')).toBe('button')
    // The visible label still names the tile for a screen reader; the icon is decoration.
    expect(button.text()).toContain('夏普')
    expect(button.attributes('aria-label')).toBeUndefined()
  })

  it('hands the click to the page that made it clickable', async () => {
    const wrapper = mountTile({ interactive: true })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })
})

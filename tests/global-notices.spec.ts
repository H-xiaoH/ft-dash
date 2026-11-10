import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { i18n } from '@/i18n'

/**
 * The connection banner no longer offers a retry: the poll keeps asking by itself, and only a
 * rejected password needs the operator to do something. The text has to say so.
 */
const { rawBot, rawEvents, rawSettings } = vi.hoisted(() => ({
  rawBot: {
    connection: 'unreachable',
    errorKey: null as { key: string; params?: Record<string, unknown> } | null,
    heartbeatAgeMs: null as number | null,
    streamReasonKey: null as string | null,
  },
  rawEvents: { status: 'off' as string },
  rawSettings: { websocket: false },
}))

const bot = rawBot
vi.mock('@/stores/bot', () => ({ useBotStore: () => bot, HEARTBEAT_STALE_MS: 30_000 }))
vi.mock('@/stores/events', () => ({ useEventsStore: () => rawEvents }))
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => rawSettings }))
vi.mock('@/pwa', () => ({ updateAvailable: ref(false), applyPwaUpdate: vi.fn() }))

const { updateAvailable, applyPwaUpdate } = await import('@/pwa')
const GlobalNotices = (await import('@/components/GlobalNotices.vue')).default

describe('GlobalNotices', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'en'
    Object.assign(rawBot, {
      connection: 'unreachable',
      errorKey: null,
      heartbeatAgeMs: null,
      streamReasonKey: null,
    })
    Object.assign(rawEvents, { status: 'off' })
    rawSettings.websocket = false
    updateAvailable.value = false
    vi.clearAllMocks()
  })

  const mountNotices = () => mount(GlobalNotices, { global: { plugins: [i18n] } })

  it('says a lost connection retries on its own, with no button to press', () => {
    const wrapper = mountNotices()

    expect(wrapper.text()).toContain('Retrying automatically')
    expect(wrapper.findAll('button')).toHaveLength(0)
  })

  it('still warns when an online backend heartbeat exceeds 30 seconds', () => {
    rawBot.connection = 'online'
    rawBot.heartbeatAgeMs = 30_001
    const wrapper = mountNotices()
    expect(wrapper.findAll('.v-alert')).toHaveLength(1)
    expect(wrapper.find('.text-warning').exists()).toBe(true)
    expect(wrapper.text()).toContain(i18n.global.t('notices.heartbeatTitle'))
    expect(wrapper.text()).toContain(i18n.global.t('system.lagging'))
  })

  it('shows the informational update after the heartbeat warning and applies it on click', async () => {
    rawBot.connection = 'online'
    rawBot.heartbeatAgeMs = 30_001
    updateAvailable.value = true
    const wrapper = mountNotices()
    const [warning, update] = wrapper.findAll('.v-alert')

    expect(warning.classes()).toContain('text-warning')
    expect(update.classes()).toContain('text-info')
    expect(update.text()).toContain('The page will reload after updating.')
    expect(applyPwaUpdate).not.toHaveBeenCalled()
    await update.get('button').trigger('click')
    expect(applyPwaUpdate).toHaveBeenCalledOnce()
  })

  it('only displays the update notice before reaching the main interface', () => {
    updateAvailable.value = true
    const wrapper = mount(GlobalNotices, {
      props: { standalone: true },
      global: { plugins: [i18n] },
    })

    expect(wrapper.findAll('.v-alert')).toHaveLength(1)
    expect(wrapper.get('.v-alert').classes()).toContain('text-info')
  })

  it('says nothing about a rejected session, which goes back to the sign-in form', () => {
    rawBot.connection = 'unauthorized'
    const wrapper = mountNotices()

    // The connect screen carries this one; an error banner over a dead shell helped nobody.
    expect(wrapper.find('.global-notices').exists()).toBe(false)
  })

  it('says a broken stream retries on its own, with no button to press', () => {
    rawSettings.websocket = true
    rawEvents.status = 'closed'
    const wrapper = mountNotices()

    expect(wrapper.text()).toContain('Retrying automatically')
    expect(wrapper.findAll('button')).toHaveLength(0)
  })
})

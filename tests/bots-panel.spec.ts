import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import BotsPanel from '@/components/BotsPanel.vue'
import ConnectView from '@/views/ConnectView.vue'
import { i18n } from '@/i18n'
import { useBotStore } from '@/stores/bot'
import { useToasts } from '@/composables/useToast'
import { useSettingsStore } from '@/stores/settings'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

describe('BotsPanel', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    useToasts().toasts.value = []
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('lets the latest bot switch own the result toast', async () => {
    const settings = useSettingsStore()
    settings.addBot({
      name: 'first',
      baseUrl: 'https://first.example/api/v1',
      username: 'first',
      password: 'secret',
    })
    const secondBot = settings.addBot({
      name: 'second',
      baseUrl: 'https://second.example/api/v1',
      username: 'second',
      password: 'secret',
    })
    const thirdBot = settings.addBot({
      name: 'third',
      baseUrl: 'https://third.example/api/v1',
      username: 'third',
      password: 'secret',
    })

    const first = deferred<boolean>()
    const latest = deferred<boolean>()
    const bot = useBotStore()
    vi.spyOn(bot, 'switchBot')
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(async (id) => {
        const ok = await latest.promise
        if (ok) settings.setActiveBot(id)
        return ok
      })

    const wrapper = mount(BotsPanel, { global: { plugins: [i18n] } })
    const switchButtons = wrapper.findAll('button.btn--primary')
    expect(switchButtons).toHaveLength(2)

    await switchButtons[0]!.trigger('click')
    await switchButtons[1]!.trigger('click')

    latest.resolve(true)
    await flushPromises()
    first.resolve(false)
    await flushPromises()

    const toasts = useToasts().toasts.value
    expect(toasts).toHaveLength(1)
    expect(toasts[0]?.tone).toBe('good')
    expect(toasts[0]?.message).toContain('third')
    expect(settings.activeBotId).toBe(thirdBot.id)
    expect(bot.switchBot).toHaveBeenNthCalledWith(1, secondBot.id)
    expect(bot.switchBot).toHaveBeenNthCalledWith(2, thirdBot.id)
    wrapper.unmount()
  })

  it('activates the bot added from the connect view', async () => {
    const settings = useSettingsStore()
    settings.addBot({
      name: 'existing',
      baseUrl: 'https://existing.example/api/v1',
      username: 'existing',
      password: 'secret',
    })
    const bot = useBotStore()
    vi.spyOn(bot, 'connect').mockResolvedValue(true)
    vi.spyOn(bot, 'rebuildClient').mockImplementation(() => undefined)

    const wrapper = mount(ConnectView, { global: { plugins: [i18n] } })
    const inputs = wrapper.findAll('input')
    await inputs[0]!.setValue('new-bot')
    await inputs[1]!.setValue('https://new.example/api/v1')
    await inputs[2]!.setValue('new-user')
    await inputs[3]!.setValue('new-password')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const added = settings.bots.find((entry) => entry.name === 'new-bot')
    expect(added).toBeDefined()
    expect(settings.activeBotId).toBe(added?.id)
    expect(bot.connect).toHaveBeenCalled()
    wrapper.unmount()
  })
})

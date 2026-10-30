import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import BotsPanel from '@/components/BotsPanel.vue'
import FilterMenu from '@/components/FilterMenu.vue'
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

/** The connect form probes the bot before saving, so the probe needs an answer. */
function answerProbe(ok = true) {
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    const url = String(input)
    const body = url.includes('/ping')
      ? { status: 'pong' }
      : {
          version: '2026.9',
          api_version: 2.5,
          dry_run: true,
          stake_currency: 'USDT',
          stake_amount: 'unlimited',
          max_open_trades: 3,
        }
    return Promise.resolve(
      new Response(JSON.stringify(ok ? body : { detail: 'Incorrect username or password' }), {
        status: ok ? 200 : 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
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
    vi.unstubAllGlobals()
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
    const picker = wrapper.findComponent(FilterMenu)

    // Picking a bot in the dropdown is the switch; two picks in a row is the race.
    picker.vm.$emit('update:modelValue', secondBot.id)
    await nextTick()
    picker.vm.$emit('update:modelValue', thirdBot.id)
    await nextTick()

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
    answerProbe()
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

  it('saves nothing when the bot refuses the sign-in', async () => {
    answerProbe(false)
    const bot = useBotStore()
    const connect = vi.spyOn(bot, 'connect').mockResolvedValue(true)
    const settings = useSettingsStore()

    const wrapper = mount(ConnectView, { global: { plugins: [i18n] } })
    const inputs = wrapper.findAll('input')
    await inputs[0]!.setValue('typo-bot')
    await inputs[1]!.setValue('https://typo.example/api/v1')
    await inputs[2]!.setValue('typo-user')
    await inputs[3]!.setValue('wrong-password')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    // The probe is what fails: no bot in the list, no connection attempt, and the reason is
    // shown on this form rather than in the shell.
    expect(settings.bots).toHaveLength(0)
    expect(connect).not.toHaveBeenCalled()
    expect(wrapper.find('.banner--bad').text()).toContain('Wrong username or password')
    wrapper.unmount()
  })

  it('only saves a bot the API answers for', async () => {
    const settings = useSettingsStore()
    const wrapper = mount(BotsPanel, { global: { plugins: [i18n] } })
    // Add and edit sit behind the picker's last entry.
    wrapper.findComponent(FilterMenu).vm.$emit('update:modelValue', '__manage')
    await nextTick()

    const fillEditor = async (password: string) => {
      await wrapper
        .findAll('button')
        .find((button) => button.text().includes('Add backend'))!
        .trigger('click')
      const editor = wrapper.find('.bots__editor')
      await editor.find('input[inputmode="url"]').setValue('https://new.example/api/v1')
      await editor.find('input[autocomplete="username"]').setValue('new-user')
      await editor.find('input[type="password"]').setValue(password)
      await editor.trigger('submit')
      await flushPromises()
    }

    // Refused: nothing is written and the editor stays open for another try.
    answerProbe(false)
    await fillEditor('wrong-password')
    expect(settings.bots).toHaveLength(0)
    expect(wrapper.find('.bots__editor').exists()).toBe(true)
    expect(useToasts().toasts.value.at(-1)?.message).toContain('Wrong username or password')

    // Accepted: the same form now lands the bot in the list.
    answerProbe(true)
    await wrapper.find('.bots__editor').trigger('submit')
    await flushPromises()
    expect(settings.bots).toHaveLength(1)
    expect(settings.bots[0]?.baseUrl).toBe('https://new.example/api/v1')
    wrapper.unmount()
  })

  it('opens the manager from the picker and keeps switching for the bots', async () => {
    const settings = useSettingsStore()
    const first = settings.addBot({
      name: 'first',
      baseUrl: 'https://first.example/api/v1',
      username: 'first',
      password: 'secret',
    })
    settings.addBot({
      name: 'second',
      baseUrl: 'https://second.example/api/v1',
      username: 'second',
      password: 'secret',
    })
    settings.setActiveBot(first.id)
    const bot = useBotStore()
    const switchBot = vi.spyOn(bot, 'switchBot').mockResolvedValue(true)

    const wrapper = mount(BotsPanel, { global: { plugins: [i18n] } })
    const picker = wrapper.findComponent(FilterMenu)
    const { options } = picker.props() as { options: { value: string; label: string }[] }
    const values = options.map((option) => option.value)

    // The last entry is the manager; the bots come first.
    expect(values).toHaveLength(3)
    expect(values.at(-1)).toBe('__manage')
    // Its body is closed until that entry is picked.
    expect(wrapper.find('.bots__manage').exists()).toBe(false)
    expect(wrapper.find('.bots__editor').exists()).toBe(false)

    picker.vm.$emit('update:modelValue', '__manage')
    await nextTick()
    expect(wrapper.find('.bots__manage').exists()).toBe(true)
    expect(wrapper.findAll('.bots__row')).toHaveLength(2)
    expect(switchBot).not.toHaveBeenCalled()

    // Picking a bot switches instead of opening the manager again.
    picker.vm.$emit('update:modelValue', settings.bots[1]!.id)
    await flushPromises()
    expect(switchBot).toHaveBeenCalledWith(settings.bots[1]!.id)
    wrapper.unmount()
  })
})

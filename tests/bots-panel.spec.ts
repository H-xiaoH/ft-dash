import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import BotsPanel from '@/components/BotsPanel.vue'
import FilterMenu, { type FilterOption } from '@/components/FilterMenu.vue'
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
  let router: Router
  const renderPanel = () => mount(BotsPanel, { global: { plugins: [i18n, router] } })
  it('confirms removal in a modal and prevents repeat submission while pending', async () => {
    const settings = useSettingsStore()
    settings.addBot({ name: 'First', baseUrl: 'https://a.example', username: 'a', password: 'one' })
    const removal = deferred<boolean>()
    const remove = vi.spyOn(useBotStore(), 'removeBot').mockReturnValue(removal.promise)
    const wrapper = renderPanel()
    try {
      wrapper.findComponent(FilterMenu).vm.$emit('action')
      await nextTick()
      await wrapper.get('.bots__row .text-error').trigger('click')
      await nextTick()
      const dialog = document.querySelector('[role="dialog"]')
      expect(dialog).not.toBeNull()
      expect(dialog?.textContent).toContain('First')
      const confirm = dialog!.querySelector<HTMLButtonElement>('.v-card-actions button:last-child')!
      confirm.click()
      confirm.click()
      await nextTick()
      expect(remove).toHaveBeenCalledTimes(1)
      expect(confirm.disabled).toBe(true)
      removal.resolve(true)
      await flushPromises()
      expect(document.querySelector('.v-dialog.v-overlay--active')).toBeNull()
    } finally {
      wrapper.unmount()
    }
  })

  it('keeps a failed deletion open and allows retry without an account warning', async () => {
    useSettingsStore().addBot({
      name: 'First',
      baseUrl: 'https://a.example',
      username: 'a',
      password: 'one',
    })
    const remove = vi
      .spyOn(useBotStore(), 'removeBot')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(true)
    const wrapper = renderPanel()
    try {
      wrapper.findComponent(FilterMenu).vm.$emit('action')
      await nextTick()
      await wrapper.get('.bots__row .text-error').trigger('click')
      await nextTick()
      const dialog = document.querySelector('[role="dialog"]')!
      expect(dialog.textContent).not.toContain(i18n.global.t('actions.confirmBody'))
      const confirm = dialog.querySelector<HTMLButtonElement>('.v-card-actions button:last-child')!
      confirm.click()
      await flushPromises()
      expect(document.querySelector('[role="dialog"]')).toBe(dialog)
      expect(confirm.disabled).toBe(false)
      confirm.click()
      await flushPromises()
      expect(remove).toHaveBeenCalledTimes(2)
      expect(document.querySelector('.v-dialog.v-overlay--active')).toBeNull()
    } finally {
      wrapper.unmount()
    }
  })

  it('recovers the connect form after an invalid URL', async () => {
    answerProbe()
    const bot = useBotStore()
    vi.spyOn(bot, 'connect').mockResolvedValue(true)
    const wrapper = mount(ConnectView, { global: { plugins: [i18n] } })
    const vm = wrapper.vm as unknown as { submit: () => Promise<void> }
    const inputs = wrapper.findAll('input')
    await inputs[1]!.setValue('http://[')
    await inputs[2]!.setValue('u')
    await inputs[3]!.setValue('p')
    try {
      await expect(vm.submit()).resolves.toBeUndefined()
      await nextTick()
      expect(wrapper.find('.v-alert').text()).toContain(i18n.global.t('errors.config'))
      expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
      await inputs[1]!.setValue('https://new.example')
      await vm.submit()
      expect(useSettingsStore().bots).toHaveLength(1)
    } finally {
      wrapper.unmount()
    }
  })

  it('recovers the backend editor after an invalid URL', async () => {
    answerProbe()
    const wrapper = renderPanel()
    wrapper.findComponent(FilterMenu).vm.$emit('action')
    await nextTick()
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Add backend'))!
      .trigger('click')
    const editor = wrapper.find('.bots__editor')
    await editor.find('input[inputmode="url"]').setValue('http://[')
    await editor.find('input[autocomplete="username"]').setValue('u')
    await editor.find('input[type="password"]').setValue('p')
    const vm = wrapper.vm as unknown as { submit: () => Promise<void> }
    try {
      await expect(vm.submit()).resolves.toBeUndefined()
      await nextTick()
      expect(useToasts().toasts.value.at(-1)?.message).toBe(i18n.global.t('errors.config'))
      await editor.find('input[inputmode="url"]').setValue('https://new.example')
      await vm.submit()
      expect(useSettingsStore().bots).toHaveLength(1)
    } finally {
      wrapper.unmount()
    }
  })

  beforeEach(async () => {
    localStorage.clear()
    sessionStorage.clear()
    setActivePinia(createPinia())
    router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/settings', name: 'settings', component: { template: '<div />' } }],
    })
    await router.push('/settings')
  })

  afterEach(() => {
    useToasts().toasts.value = []
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each([true, false])(
    'probes inactive backends without switching (healthy: %s)',
    async (healthy) => {
      answerProbe(healthy)
      const fetch = vi.spyOn(globalThis, 'fetch')
      const settings = useSettingsStore()
      const first = settings.addBot({
        name: 'first',
        baseUrl: 'https://first.example',
        username: 'u',
        password: 'p',
      })
      const other = settings.addBot({
        name: 'other',
        baseUrl: 'https://other.example',
        username: 'u',
        password: 'p',
      })
      settings.setActiveBot(first.id)
      const wrapper = renderPanel()
      const picker = wrapper.findComponent(FilterMenu)
      picker.vm.$emit('open-change', true)
      await nextTick()
      expect(
        (picker.vm.$props as { options: FilterOption[] }).options.find(
          (entry) => entry.value === other.id,
        )?.dot,
      ).toBe('warn')
      await flushPromises()
      expect(
        (picker.vm.$props as { options: FilterOption[] }).options.find(
          (entry) => entry.value === other.id,
        )?.dot,
      ).toBe(healthy ? 'good' : 'bad')
      const [[, ping], [, config] = []] = fetch.mock.calls
      expect(new Headers(ping?.headers).has('Authorization')).toBe(false)
      if (healthy) expect(new Headers(config?.headers).has('Authorization')).toBe(true)
      expect(settings.activeBotId).toBe(first.id)
      wrapper.unmount()
    },
  )

  it('checks passwordless backends without sending authorization or probing protected config', async () => {
    const settings = useSettingsStore()
    const reachable = settings.addBot({
      baseUrl: 'https://reachable.example',
      username: 'r',
      password: '',
    })
    const offline = settings.addBot({
      baseUrl: 'https://offline.example',
      username: 'o',
      password: '',
    })
    settings.addBot({ baseUrl: 'https://active.example', username: 'a', password: 'secret' })
    settings.setActiveBot(settings.bots.at(-1)!.id)
    const fetchProbe = vi.fn(async (url: string, init: RequestInit) => {
      expect(new Headers(init.headers).has('Authorization')).toBe(false)
      if (url.startsWith('https://offline.example')) throw new TypeError('offline')
      return new Response(JSON.stringify({ status: 'pong' }))
    })
    vi.stubGlobal('fetch', fetchProbe)

    const wrapper = renderPanel()
    const picker = wrapper.findComponent(FilterMenu)
    const option = (id: string) =>
      (picker.vm.$props as { options: FilterOption[] }).options.find((entry) => entry.value === id)
    picker.vm.$emit('open-change', true)
    await flushPromises()
    expect(fetchProbe.mock.calls.map(([url]) => url)).toEqual([
      'https://reachable.example/api/v1/ping',
      'https://offline.example/api/v1/ping',
    ])
    expect(option(reachable.id)?.status).toBe(i18n.global.t('bots.reachableUnverified'))
    expect(option(offline.id)?.status).toBe(i18n.global.t('common.offline'))

    settings.updateBot(reachable.id, { baseUrl: 'https://changed.example' })
    await nextTick()
    expect(option(reachable.id)?.status).toBe(i18n.global.t('bots.notChecked'))
    wrapper.unmount()
  })

  it('returns focus to the selector on cancellation and drops a password prompt for an edited target', async () => {
    const settings = useSettingsStore()
    settings.addBot({ baseUrl: 'https://active.example', username: 'a', password: 'secret' })
    const other = settings.addBot({ baseUrl: 'https://other.example', username: 'o', password: '' })
    const wrapper = mount(BotsPanel, {
      attachTo: document.body,
      global: { plugins: [i18n, router] },
    })
    const picker = wrapper.findComponent(FilterMenu)
    const trigger = wrapper.get('.filter-menu__button').element

    try {
      picker.vm.$emit('update:modelValue', other.id)
      await nextTick()
      const cancel = wrapper.get<HTMLButtonElement>('.bots__prompt button[type="button"]')
      cancel.element.focus()
      await cancel.trigger('click')
      expect(document.activeElement).toBe(trigger)
      expect(wrapper.find('.bots__prompt').exists()).toBe(false)

      picker.vm.$emit('update:modelValue', other.id)
      await nextTick()
      await wrapper.get('.bots__prompt input').setValue('unsaved-secret')
      settings.updateBot(other.id, { baseUrl: 'https://changed.example' })
      await nextTick()
      expect(wrapper.find('.bots__prompt').exists()).toBe(false)
      expect(settings.bots.find((entry) => entry.id === other.id)?.password).toBe('')
    } finally {
      wrapper.unmount()
    }
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

    const wrapper = renderPanel()
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
    expect(wrapper.find('.v-alert').text()).toContain('Wrong username or password')
    wrapper.unmount()
  })

  it('only saves a bot the API answers for', async () => {
    const settings = useSettingsStore()
    const wrapper = renderPanel()
    // Add and edit sit behind the picker's separate action.
    wrapper.findComponent(FilterMenu).vm.$emit('action')
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

    const wrapper = renderPanel()
    const picker = wrapper.findComponent(FilterMenu)
    const { options, actionLabel } = picker.props() as {
      options: FilterOption[]
      actionLabel: string
    }
    const values = options.map((option) => option.value)

    // The manager is an action, independent of the backend choices.
    expect(values).toEqual(settings.bots.map((entry) => entry.id))
    expect(actionLabel).toBe('Manage backends')
    expect(wrapper.find('.bots__manage').exists()).toBe(false)
    expect(wrapper.find('.bots__editor').exists()).toBe(false)

    picker.vm.$emit('action')
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

import { computed, onBeforeUnmount, shallowReactive } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FilterOption, StatusLamp } from '@/components/FilterMenu.vue'
import { FreqtradeApiClient } from '@/data/freqtrade'
import type { Bot } from '@/lib/bots'
import { useBotStore } from '@/stores/bot'
import { useSettingsStore } from '@/stores/settings'
import { useBotSwitch } from './useBotSwitch'

type ProbeStatus = StatusLamp | 'unverified'

export function useBackendPicker(switchOptions?: Parameters<typeof useBotSwitch>[0]) {
  const { t } = useI18n()
  const settings = useSettingsStore()
  const bot = useBotStore()
  const switching = useBotSwitch(switchOptions)
  const probeStatuses = shallowReactive(new Map<Bot, ProbeStatus>())
  let probeController: AbortController | undefined

  const activeLamp = computed<StatusLamp>(() => {
    if (bot.connection === 'unreachable' || bot.connection === 'unauthorized') return 'bad'
    if (bot.connection === 'connecting' || bot.refreshing) return 'warn'
    return bot.connection === 'online' ? 'good' : 'muted'
  })
  const statusKeys: Record<ProbeStatus, string> = {
    good: 'bots.connected',
    warn: 'bots.checking',
    bad: 'common.offline',
    muted: 'bots.notChecked',
    unverified: 'bots.reachableUnverified',
  }
  const options = computed<FilterOption[]>(() =>
    settings.bots.map((entry) => {
      const status =
        entry.id === settings.activeBotId ? activeLamp.value : (probeStatuses.get(entry) ?? 'muted')
      return {
        value: entry.id,
        label: entry.name,
        hint: entry.baseUrl,
        dot: status === 'unverified' ? 'muted' : status,
        status: t(statusKeys[status]),
      }
    }),
  )
  const choice = computed<string>({
    get: () => settings.activeBotId || settings.bots[0]?.id || '',
    set: (id) => {
      const entry = settings.bots.find((item) => item.id === id)
      if (entry) void switching.switchTo(entry)
    },
  })

  function probeBackends(open: boolean) {
    probeController?.abort()
    probeStatuses.clear()
    if (!open) return
    const controller = new AbortController()
    probeController = controller
    for (const entry of settings.bots) {
      if (entry.id === settings.activeBotId) continue
      probeStatuses.set(entry, 'warn')
      void probeBackend(entry, controller.signal)
    }
  }

  async function probeBackend(entry: Bot, signal: AbortSignal) {
    const request = { signal, timeoutMs: 5000 }
    try {
      const api = new FreqtradeApiClient(entry)
      await api.ping({ ...request, anonymous: true })
      if (entry.password && !signal.aborted) await api.showConfig(request)
      if (!signal.aborted) probeStatuses.set(entry, entry.password ? 'good' : 'unverified')
    } catch {
      if (!signal.aborted) probeStatuses.set(entry, 'bad')
    }
  }
  onBeforeUnmount(() => probeController?.abort())

  return { ...switching, options, choice, probeBackends }
}

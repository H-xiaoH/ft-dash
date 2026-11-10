import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { sameConnectionIdentity } from '@/data/freqtrade'
import type { Bot } from '@/lib/bots'
import { useBotStore } from '@/stores/bot'
import { useSettingsStore } from '@/stores/settings'
import { pushToast } from './useToast'

// Both pickers switch the same bot store. A settings-page remount must not reset the sequence.
const latestSwitches = new WeakMap<ReturnType<typeof useBotStore>, number>()

export function useBotSwitch({ offerActivePassword = false } = {}) {
  const { t } = useI18n()
  const settings = useSettingsStore()
  const bot = useBotStore()
  const passwordTarget = shallowRef<Pick<Bot, 'id' | 'baseUrl' | 'username'> | null>(null)
  const dismissedActiveId = ref<string>()
  const passwordDraft = ref('')
  const passwordEntry = computed(() => {
    const target = passwordTarget.value
    if (target) {
      const entry = settings.bots.find((bot) => bot.id === target.id)
      return entry && sameConnectionIdentity(entry, target) ? entry : null
    }
    return offerActivePassword &&
      settings.needsPassword &&
      settings.activeBotId !== dismissedActiveId.value
      ? settings.activeBot
      : null
  })

  function cancelPassword() {
    if (settings.activeBotId === passwordEntry.value?.id)
      dismissedActiveId.value = settings.activeBotId
    passwordTarget.value = null
    passwordDraft.value = ''
  }

  watch(passwordEntry, (entry) => {
    if (!entry) passwordDraft.value = ''
  })

  async function runSwitch(entry: Bot, password?: string) {
    if (bot.actionPending !== null) {
      pushToast(t('bots.busy'), 'bad')
      return
    }
    const reconnect = entry.id === settings.activeBotId
    if (reconnect && password === undefined) return
    if (password !== undefined) {
      cancelPassword()
      settings.updateBot(entry.id, { password })
    }
    const request = (latestSwitches.get(bot) ?? 0) + 1
    latestSwitches.set(bot, request)
    const ok = reconnect ? await bot.connect() : await bot.switchBot(entry.id)
    if (latestSwitches.get(bot) !== request || settings.activeBotId !== entry.id) return
    pushToast(
      ok
        ? reconnect
          ? t('bots.testOk')
          : t('bots.switched', { name: entry.name })
        : t(bot.errorKey?.key ?? 'actions.failed'),
      ok ? 'good' : 'bad',
    )
  }

  async function switchTo(entry: Bot) {
    if (!entry.password) {
      passwordTarget.value = { id: entry.id, baseUrl: entry.baseUrl, username: entry.username }
      passwordDraft.value = ''
      return
    }
    await runSwitch(entry)
  }

  async function submitPassword() {
    if (passwordEntry.value && passwordDraft.value)
      await runSwitch(passwordEntry.value, passwordDraft.value)
  }

  return { switchTo, passwordEntry, passwordDraft, cancelPassword, submitPassword }
}

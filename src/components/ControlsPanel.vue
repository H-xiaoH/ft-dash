<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { pushToast } from '@/composables/useToast'
import { useSettingsStore } from '@/stores/settings'

/**
 * The write-access switch. It sits inside the backends panel, as plain as the remember
 * switch above it: one line of state, and the details wait behind the confirmation.
 *
 * Turning it on is the one move that can cost money, so the switch only asks: what it will
 * enable and the risk are spelled out in the dialog, the way every other dangerous action is.
 */
const { t } = useI18n()
const settings = useSettingsStore()
const confirming = ref(false)
const switchValue = ref(settings.writesEnabled)
watch(
  () => settings.writesEnabled,
  (value) => {
    switchValue.value = value
  },
)

function onToggle(wanted: boolean | null) {
  switchValue.value = !!wanted
  if (wanted) {
    confirming.value = true
    // Restore the native checkbox after the requested state has rendered; access awaits confirmation.
    void nextTick(() => {
      switchValue.value = settings.writesEnabled
    })
    return
  }
  settings.allowControls = false
  settings.controlsAcknowledged = false
}

function confirmEnable() {
  settings.controlsAcknowledged = true
  settings.allowControls = true
  confirming.value = false
  pushToast(t('common.saved'), 'good')
}
</script>

<template>
  <VSwitch :model-value="switchValue" @update:model-value="onToggle">
    <template #label>
      <span class="d-flex flex-column">
        <span>{{ t('actions.title') }}</span>
        <span class="text-caption text-medium-emphasis">{{ t('actions.controlsShortHint') }}</span>
      </span>
    </template>
  </VSwitch>

  <ConfirmDialog
    :open="confirming"
    :title="t('actions.title')"
    :body="t('actions.controlsConfirm')"
    :confirm-label="t('actions.confirmEnable')"
    :cancel-label="t('common.cancel')"
    tone="danger"
    @cancel="confirming = false"
    @confirm="confirmEnable"
  >
    <template #body>
      <p>{{ t('actions.controlsConfirm') }}</p>
      <ul class="controls__hints">
        <li>{{ t('actions.pauseHint') }}</li>
        <li>{{ t('actions.stopHint') }}</li>
        <li>{{ t('actions.forceExitHint') }}</li>
        <li>{{ t('actions.blacklistAddHint') }}</li>
      </ul>
    </template>
  </ConfirmDialog>
</template>

<style scoped>
.controls__hints {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  margin: var(--sp-3) 0 0;
  padding-left: 18px;
  color: var(--text-2);
  font-size: var(--fs-sm);
}
</style>

<script lang="ts">
export type RatioKey = 'sharpe' | 'sqn' | 'sortino' | 'calmar'
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useModalFocus } from '@/composables/useModalFocus'

const props = defineProps<{
  /** Which ratio to explain; `null` keeps the dialog closed. */
  ratio: RatioKey | null
}>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const panel = ref<HTMLElement | null>(null)

const open = computed(() => props.ratio !== null)
const title = computed(() => (props.ratio ? t(`stats.ratios.${props.ratio}.name`) : ''))

const { isTopModal } = useModalFocus(open, panel)

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !open.value || !isTopModal.value) return
  event.preventDefault()
  event.stopPropagation()
  emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="ratio"
      class="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ratio-guide-title"
      @click.self="emit('close')"
    >
      <div ref="panel" class="dialog ratios" tabindex="-1">
        <div class="dialog__head">
          <span id="ratio-guide-title" class="dialog__title">{{ title }}</span>
          <div class="spacer" />
          <button type="button" class="btn btn--icon btn--ghost" @click="emit('close')">
            <span aria-hidden="true">✕</span>
            <span class="sr-only">{{ t('common.close') }}</span>
          </button>
        </div>
        <div class="dialog__body">
          <p>{{ t(`stats.ratios.${ratio}.plain`) }}</p>
          <p class="ratios__bench">{{ t(`stats.ratios.${ratio}.bench`) }}</p>
          <p class="ratios__caveat">{{ t('stats.ratios.caveat') }}</p>
        </div>
        <div class="dialog__foot">
          <button type="button" class="btn btn--primary" @click="emit('close')">
            {{ t('common.close') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ratios__bench {
  color: var(--text-1);
}

.dialog__body p + p {
  margin-top: var(--sp-3);
}

.ratios__caveat {
  border-top: 1px solid var(--line);
  padding-top: var(--sp-3);
  color: var(--text-2);
  font-size: var(--fs-base);
}

/* Long ratio names must not push the plain-language line off a phone screen. */
@media (max-width: 560px) {
  .dialog__title {
    font-size: var(--fs-base);
  }
}
</style>

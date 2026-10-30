<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useModalFocus } from '@/composables/useModalFocus'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const panel = ref<HTMLElement | null>(null)

const { isTopModal } = useModalFocus(
  computed(() => props.open),
  panel,
)

/** The four ratios the statistics page shows, in the order they are usually read. */
const RATIOS = ['sharpe', 'sortino', 'sqn', 'calmar'] as const

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !props.open || !isTopModal.value) return
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
      v-if="open"
      class="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ratio-guide-title"
      @click.self="emit('close')"
    >
      <div ref="panel" class="dialog ratios" tabindex="-1">
        <div class="dialog__head">
          <span id="ratio-guide-title" class="dialog__title">{{ t('stats.ratios.title') }}</span>
          <div class="spacer" />
          <button type="button" class="btn btn--icon btn--ghost" @click="emit('close')">
            <span aria-hidden="true">✕</span>
            <span class="sr-only">{{ t('common.close') }}</span>
          </button>
        </div>
        <div class="dialog__body">
          <p class="ratios__intro">{{ t('stats.ratios.intro') }}</p>
          <dl class="ratios__list">
            <template v-for="key in RATIOS" :key="key">
              <dt>{{ t(`stats.ratios.${key}.name`) }}</dt>
              <dd>
                <p>{{ t(`stats.ratios.${key}.plain`) }}</p>
                <p class="ratios__bench">{{ t(`stats.ratios.${key}.bench`) }}</p>
              </dd>
            </template>
          </dl>
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
.ratios__intro,
.ratios__caveat {
  color: var(--text-2);
  font-size: var(--fs-base);
}

.ratios__list {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--sp-3) var(--sp-4);
  margin: var(--sp-4) 0;
}

.ratios__list dt {
  color: var(--text-1);
  font-weight: 600;
  font-size: var(--fs-base);
}

/* On a phone the ratio name would eat the column; give each one its own line instead. */
@media (max-width: 560px) {
  .ratios__list {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-1) 0;
  }

  .ratios__list dd {
    margin-bottom: var(--sp-3);
  }
}

.ratios__list dd {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

.ratios__list dd p {
  color: var(--text-2);
  font-size: var(--fs-base);
  line-height: 1.5;
}

.ratios__bench {
  color: var(--text-1) !important;
}

.ratios__caveat {
  border-top: 1px solid var(--line);
  padding-top: var(--sp-3);
}
</style>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import Sortable from 'sortablejs'
import { VList } from 'vuetify/components/VList'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'
import type { Bot } from '@/lib/bots'

const props = defineProps<{
  bots: Bot[]
  activeBotId: string
  testing: string | null
  testResult: Record<string, 'ok'>
}>()
const emit = defineEmits<{
  edit: [bot: Bot]
  test: [bot: Bot]
  remove: [bot: Bot]
  reorder: [ids: string[]]
}>()
const { t } = useI18n()
const list = ref<InstanceType<typeof VList> | null>(null)
const announcement = ref('')
let sortable: Sortable | null = null
onMounted(() => {
  if (!list.value) return
  sortable = Sortable.create(list.value.$el, {
    handle: '.bots__drag',
    forceFallback: true,
    dataIdAttr: 'data-bot-id',
    animation: 180,
    delay: 350,
    touchStartThreshold: 8,
    ghostClass: 'is-dragging',
    onEnd(event) {
      const ids = sortable!.toArray()
      sortable!.sort(props.bots.map((bot) => bot.id))
      const next = ids.map((id) => props.bots.find((bot) => bot.id === id)!)
      if (next.length === props.bots.length && next.every(Boolean))
        commit(next, event.item.dataset.botId ?? '')
    },
  })
})
onBeforeUnmount(() => sortable?.destroy())
function moved(ids: Bot[], id: string, to: number) {
  const next = [...ids]
  const from = next.findIndex((bot) => bot.id === id)
  if (from < 0 || to < 0 || to >= next.length || from === to) return null
  next.splice(to, 0, next.splice(from, 1)[0]!)
  return next
}
function commit(next: Bot[], id: string) {
  if (next.every((bot, index) => bot.id === props.bots[index]?.id)) return
  emit(
    'reorder',
    next.map((bot) => bot.id),
  )
  void nextTick(() => {
    const element = list.value?.$el as HTMLElement | undefined
    const row = [...(element?.querySelectorAll<HTMLElement>('[data-bot-id]') ?? [])].find(
      (element) => element.dataset.botId === id,
    )
    row?.querySelector<HTMLButtonElement>('.bots__drag')?.focus({ preventScroll: true })
  })
  announcement.value = t('bots.reordered', {
    name: next.find((bot) => bot.id === id)?.name ?? '',
    position: next.findIndex((bot) => bot.id === id) + 1,
    total: next.length,
  })
}
function keyboard(event: KeyboardEvent, id: string) {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
  event.preventDefault()
  const index = props.bots.findIndex((bot) => bot.id === id)
  const next = moved(props.bots, id, index + (event.key === 'ArrowUp' ? -1 : 1))
  if (next) commit(next, id)
}
</script>

<template>
  <VList
    ref="list"
    tag="ul"
    role="list"
    class="bots d-flex flex-column ga-3 pa-0 ma-0"
    bg-color="transparent"
  >
    <VListItem
      v-for="entry in bots"
      :key="entry.id"
      tag="li"
      role="listitem"
      border
      rounded="lg"
      class="bots__row pa-3"
      :data-bot-id="entry.id"
      :active="entry.id === activeBotId"
      color="primary"
    >
      <div class="d-flex flex-column ga-3">
        <div class="d-flex align-center ga-2 flex-wrap">
          <span class="bots__name">{{ entry.name }}</span>
          <VChip v-if="entry.id === activeBotId" size="x-small" variant="tonal" color="success">{{
            t('bots.current')
          }}</VChip>
          <span class="num small muted bots__url">{{ entry.baseUrl }}</span>
        </div>
        <div class="d-flex align-center ga-2 flex-wrap">
          <VBtn type="button" @click="emit('edit', entry)">
            <AppIcon name="edit" />{{ t('bots.edit') }}
          </VBtn>
          <VBtn
            type="button"
            :color="testResult[entry.id] === 'ok' ? 'success' : undefined"
            :disabled="testing === entry.id"
            @click="emit('test', entry)"
          >
            <AppIcon name="wifi" />{{
              testResult[entry.id] === 'ok' ? t('bots.testSucceeded') : t('bots.test')
            }}
          </VBtn>
          <VBtn color="error" type="button" @click="emit('remove', entry)">
            <AppIcon name="trash" />{{ t('bots.remove') }}
          </VBtn>
          <VSpacer />
          <VBtn
            variant="text"
            :icon="true"
            type="button"
            class="bots__drag"
            density="comfortable"
            :disabled="bots.length < 2"
            :title="t('bots.reorder', { name: entry.name })"
            :aria-label="t('bots.reorder', { name: entry.name })"
            @contextmenu.prevent
            @keydown.stop="keyboard($event, entry.id)"
          >
            <AppIcon name="grip" />
          </VBtn>
        </div>
      </div>
    </VListItem>
  </VList>
  <p class="sr-only" role="status">{{ announcement }}</p>
</template>

<style scoped>
.bots__row.is-dragging {
  border-color: var(--accent);
  background: var(--ink-800);
}
.bots__name {
  font-weight: 500;
}
.bots__url {
  overflow-wrap: anywhere;
}
.bots__drag {
  touch-action: none;
  user-select: none;
  -webkit-touch-callout: none;
  cursor: grab;
}
.bots__drag:active {
  cursor: grabbing;
}
</style>

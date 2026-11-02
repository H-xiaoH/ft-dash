<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
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
const list = ref<HTMLElement | null>(null)
const draft = ref<Bot[] | null>(null)
const dragging = ref<string | null>(null)
const announcement = ref('')
const rows = computed(() => draft.value ?? props.bots)
let timer = 0
let gesture: { id: string; pointer: number; x: number; y: number; handle: HTMLElement } | null =
  null

function cancel() {
  window.clearTimeout(timer)
  const previous = gesture
  gesture = null
  draft.value = null
  dragging.value = null
  if (previous?.handle.hasPointerCapture?.(previous.pointer))
    previous.handle.releasePointerCapture(previous.pointer)
}
function start(event: PointerEvent, id: string) {
  if (event.button !== 0 || gesture || props.bots.length < 2) return
  const handle = list.value
  if (!handle) return
  gesture = { id, pointer: event.pointerId, x: event.clientX, y: event.clientY, handle }
  handle.setPointerCapture?.(event.pointerId)
  timer = window.setTimeout(() => {
    draft.value = [...props.bots]
    dragging.value = id
  }, 350)
}
function moved(ids: Bot[], id: string, to: number) {
  const next = [...ids]
  const from = next.findIndex((bot) => bot.id === id)
  if (from < 0 || to < 0 || to >= next.length || from === to) return null
  next.splice(to, 0, next.splice(from, 1)[0]!)
  return next
}
function move(event: PointerEvent) {
  if (!gesture || gesture.pointer !== event.pointerId) return
  if (!dragging.value) {
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8) cancel()
    return
  }
  const target = document
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest<HTMLElement>('[data-bot-id]')
  if (!target || !list.value?.contains(target)) return
  const next = moved(
    rows.value,
    gesture.id,
    rows.value.findIndex((bot) => bot.id === target.dataset.botId),
  )
  if (next) draft.value = next
}
function commit(next: Bot[], id: string) {
  if (next.every((bot, index) => bot.id === props.bots[index]?.id)) return
  emit(
    'reorder',
    next.map((bot) => bot.id),
  )
  void nextTick(() => {
    const row = [...(list.value?.querySelectorAll<HTMLElement>('[data-bot-id]') ?? [])].find(
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
function finish(event: PointerEvent) {
  if (!gesture || gesture.pointer !== event.pointerId) return
  const next = draft.value
  const id = gesture.id
  cancel()
  if (next) commit(next, id)
}
function keyboard(event: KeyboardEvent, id: string) {
  if (event.key === 'Escape') {
    cancel()
    return
  }
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
  event.preventDefault()
  cancel()
  const index = props.bots.findIndex((bot) => bot.id === id)
  const next = moved(props.bots, id, index + (event.key === 'ArrowUp' ? -1 : 1))
  if (next) commit(next, id)
}
watch(() => props.bots, cancel)
onBeforeUnmount(cancel)
</script>

<template>
  <ul
    ref="list"
    class="bots"
    @pointermove="move"
    @pointerup="finish"
    @pointercancel="cancel"
    @lostpointercapture="cancel"
  >
    <li
      v-for="entry in rows"
      :key="entry.id"
      class="bots__row"
      :data-bot-id="entry.id"
      :class="{ 'is-active': entry.id === activeBotId, 'is-dragging': dragging === entry.id }"
    >
      <div class="row row--wrap">
        <span class="bots__name">{{ entry.name }}</span>
        <span v-if="entry.id === activeBotId" class="chip chip--good">{{ t('bots.current') }}</span>
        <span class="num small muted bots__url">{{ entry.baseUrl }}</span>
      </div>
      <div class="row row--wrap">
        <button type="button" class="btn btn--sm" @click="emit('edit', entry)">
          <AppIcon name="edit" />{{ t('bots.edit') }}
        </button>
        <button
          type="button"
          class="btn btn--sm"
          :class="{ 'bots__test--ok': testResult[entry.id] === 'ok' }"
          :disabled="testing === entry.id"
          @click="emit('test', entry)"
        >
          <AppIcon name="wifi" />{{
            testResult[entry.id] === 'ok' ? t('bots.testSucceeded') : t('bots.test')
          }}
        </button>
        <button type="button" class="btn btn--sm btn--danger" @click="emit('remove', entry)">
          <AppIcon name="trash" />{{ t('bots.remove') }}
        </button>
        <div class="spacer" />
        <button
          type="button"
          class="btn btn--sm btn--icon btn--ghost bots__drag"
          :disabled="bots.length < 2"
          :title="t('bots.reorder', { name: entry.name })"
          :aria-label="t('bots.reorder', { name: entry.name })"
          @pointerdown="start($event, entry.id)"
          @contextmenu.prevent
          @keydown="keyboard($event, entry.id)"
        >
          <AppIcon name="grip" />
        </button>
      </div>
    </li>
  </ul>
  <p class="sr-only" role="status">{{ announcement }}</p>
</template>

<style scoped>
.bots {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  list-style: none;
  padding: 0;
  margin: 0;
}
.bots__row {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--r-2);
  background: var(--ink-900);
}
.bots__row.is-active {
  border-color: var(--line-strong);
}
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
.bots__test--ok {
  color: var(--long);
  border-color: rgb(36 201 138 / 35%);
}
@supports (color: color-mix(in srgb, black, white)) {
  .bots__test--ok {
    border-color: color-mix(in srgb, var(--long) 35%, transparent);
  }
}
</style>

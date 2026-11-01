<script setup lang="ts">
function enter(element: Element) {
  const el = element as HTMLElement
  el.style.height = '0px'
  void el.offsetHeight
  el.style.height = `${el.scrollHeight}px`
}
function leave(element: Element) {
  const el = element as HTMLElement
  el.style.height = `${el.getBoundingClientRect().height}px`
  void el.offsetHeight
  el.style.height = '0px'
}
function clear(element: Element) {
  ;(element as HTMLElement).style.height = ''
}
</script>

<template>
  <Transition
    name="collapse"
    mode="out-in"
    @enter="enter"
    @leave="leave"
    @after-enter="clear"
    @after-leave="clear"
    @enter-cancelled="clear"
    @leave-cancelled="clear"
  >
    <slot />
  </Transition>
</template>

<style>
.collapse-enter-active,
.collapse-leave-active {
  overflow: hidden;
  transition:
    height 200ms ease,
    opacity 200ms ease;
}
.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .collapse-enter-active,
  .collapse-leave-active {
    transition: none;
  }
}
</style>

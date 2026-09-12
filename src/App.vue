<script setup>
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import AppShell from '@/components/AppShell.vue'

const auth = useAuthStore()
const { authenticated } = storeToRefs(auth)
</script>

<template>
  <AppShell v-if="authenticated">
    <RouterView />
  </AppShell>
  <RouterView v-else />
</template>

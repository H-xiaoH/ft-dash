<script setup lang="ts">
import { computed } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { WIDE_LAYOUT_QUERY } from '@/lib/layout'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { isStandalone } from '@/lib/navigation'
import { NAV_ROUTES, MOBILE_NAV_ROUTES, SECONDARY_ROUTES } from '@/router'

defineProps<{ variant: 'rail' | 'tabbar' }>()
const emit = defineEmits<{ railWheel: [event: WheelEvent] }>()
const { t } = useI18n()
const route = useRoute()
const wide = useMediaQuery(WIDE_LAYOUT_QUERY)
const activeTab = computed(() =>
  SECONDARY_ROUTES.some((page) => page.name === route.name) ? 'more' : route.name,
)
</script>

<template>
  <VNavigationDrawer
    v-if="variant === 'rail' && wide"
    permanent
    :width="80"
    :mobile-breakpoint="720"
    tag="nav"
    class="rail"
    :aria-label="t('app.name')"
    @wheel="emit('railWheel', $event)"
  >
    <VList role="presentation" nav color="primary" class="px-1">
      <VListItem
        v-for="item in NAV_ROUTES"
        :key="item.name"
        role="link"
        :to="item.path"
        :replace="isStandalone"
        :active="route.name === item.name"
        :aria-current="route.name === item.name ? 'page' : undefined"
        :aria-label="t(item.titleKey)"
        class="rail__item px-0 py-3 text-center"
      >
        <div class="d-flex flex-column align-center ga-1">
          <AppIcon :name="item.icon" :size="22" /><span class="text-caption">{{
            t(item.titleKey)
          }}</span>
        </div>
      </VListItem>
    </VList>
  </VNavigationDrawer>
  <VBottomNavigation
    v-else-if="variant === 'tabbar' && !wide"
    :model-value="activeTab"
    color="primary"
    grow
    class="tabbar"
    :height="64"
    :aria-label="t('app.name')"
  >
    <VBtn
      v-for="item in MOBILE_NAV_ROUTES"
      :key="item.name"
      :value="item.name"
      :active="activeTab === item.name"
      :to="item.path"
      :replace="isStandalone"
      :aria-current="activeTab === item.name ? 'page' : undefined"
      ><AppIcon :name="item.icon" :size="21" /><span>{{ t(item.titleKey) }}</span></VBtn
    >
  </VBottomNavigation>
</template>

<style scoped>
.tabbar {
  height: calc(64px + env(safe-area-inset-bottom, 0px)) !important;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
.tabbar :deep(.v-btn) {
  min-width: 0;
  padding-inline: 2px;
  font-size: 12px;
}
</style>

# AppNavigation 导航壳拆分设计

## 目标

在不改变路由、页面拖拽、无障碍语义或响应式视觉行为的前提下，把 `src/App.vue` 中独立的 rail 导航、移动端 tabbar、活动指示器和对应样式提取为 `AppNavigation.vue`，让根组件继续承担应用壳编排与页面状态管理。

## 设计

- `AppNavigation.vue` 使用 Vue 3 `<script setup lang="ts">`，通过 `variant: 'rail' | 'tabbar'` 分别渲染桌面 rail 与移动端 tabbar；这样父组件可以把两个单根导航放回原来的 DOM 位置。
- 父组件通过 props 传入 variant、当前路由名、导航索引、指示器位移、指示器过渡和拖拽状态。
- 子组件通过 `rail-wheel` 事件把 wheel 事件交还给 `usePageDrag` 的现有处理器；页面拖拽和路由切换逻辑不下沉。
- `NAV_ROUTES` 仍是唯一导航数据源；RouterLink、`aria-current`、活动指示器和移动端亮度计算保持原有结果。
- 导航专属 CSS 与媒体查询随组件迁移，应用壳的 grid、页面 track 和页面过渡继续留在 `App.vue`。

## 验收标准

- 桌面 rail 与移动端 tabbar 都能标记当前路由，链接目标和文案不变。
- 指示器在静态导航、拖拽中和拖拽结束后的过渡值不变。
- rail 的 wheel 事件仍由 `usePageDrag` 处理，导航组件只转发事件。
- 导航组件有单元测试覆盖活动项、指示器样式和事件转发。
- 既有单测、lint、类型检查、生产构建、格式检查和 E2E 结果不回退。

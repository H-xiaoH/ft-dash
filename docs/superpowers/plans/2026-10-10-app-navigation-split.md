# AppNavigation 导航壳拆分实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `App.vue` 中独立的桌面 rail、移动端 tabbar 和导航指示器提取为可测试的 `AppNavigation.vue`，保持现有行为完全不变。

**Architecture:** `App.vue` 继续拥有应用状态、路由编排和 `usePageDrag`；`AppNavigation.vue` 通过 `variant: 'rail' | 'tabbar'` 作为单根导航壳，父组件把两个实例分别放回 rail 与 tabbar 原有的 DOM 位置，通过 typed props 接收显示状态，并由 rail 实例用 `rail-wheel` 事件把 wheel 输入交回父组件。导航专属样式随组件移动，页面 track 和应用壳样式留在根组件。

**Tech Stack:** Vue 3、`<script setup lang="ts">`、Vue Router、Vue Test Utils、Vitest、现有 CSS tokens。

**Spec:** `.scratch/app-navigation/spec.md`

## Global Constraints

- 使用 `NAV_ROUTES` 作为唯一导航数据源，不复制路由列表。
- 保持 `activeRouteName`、`navIndex`、`indicatorFraction`、`indicatorTransition`、`dragging` 的既有语义。
- 使用 `Props down / Events up`，不让子组件直接读取或修改父组件的拖拽状态。
- `AppNavigation` 的 `variant` 必须是 `'rail'` 或 `'tabbar'`，两个实例分别保持原有 DOM 顺序。
- 遵守 `CONTEXT.md` 的领域词汇，所有回复使用中文。
- 本轮不提交 commit，不覆盖工作树中已有的未提交改动。

## Review Focus

- 当前路由在桌面 rail 和移动 tabbar 上都只产生一个活动项，并继续输出 `aria-current="page"`。
- 拖拽期间的导航指示器仍使用实时位移，tabbar 颜色过渡仍在拖拽时禁用。
- rail 的 wheel 事件仍被父层的 `usePageDrag` 接收，组件拆分不能让页面滚动或 wheel walk 失效。
- 移动端 tabbar 的导航数量、safe-area padding 和媒体查询行为保持不变。
- RouterLink 的路径、图标、翻译 key 和导航可访问名称不变。

### Task 1: 为导航壳建立行为保护

**Files:**
- Create: `tests/app-navigation.spec.ts`
- Reference: `src/components/AppNavigation.vue`

**Interfaces:**
- Consumes: `variant`, `activeRouteName`, `navIndex`, `indicatorFraction`, `indicatorTransition`, `dragging` props。
- Produces: `rail-wheel` event，携带原始 `WheelEvent`。

- [x] **Step 1: 写导航组件的失败测试**
  - 使用现有 i18n，stub `RouterLink`，验证七个 rail/tabbar 链接都来自 `NAV_ROUTES`。
  - 传入 `activeRouteName: 'stats'`，验证两套导航的第三项有活动类和 `aria-current="page"`，其他项没有。
  - 传入 `navIndex: 2`、`indicatorFraction: 0.5`，验证 rail/tabbar 指示器 style 包含对应位移，并验证 tabbar 相邻项得到 50% 的 `--lit`。
  - 触发 rail wheel，验证组件发出 `rail-wheel` 并携带事件对象。

- [x] **Step 2: 运行测试确认当前失败**

  Run: `npm test -- --run tests/app-navigation.spec.ts`

  Expected: FAIL，因为 `AppNavigation.vue` 尚未创建。

### Task 2: 实现独立导航壳

**Files:**
- Create: `src/components/AppNavigation.vue`
- Test: `tests/app-navigation.spec.ts`

**Interfaces:**
- Consumes: typed props `variant: 'rail' | 'tabbar'`, `activeRouteName: RouteRecordName | null | undefined`, `navIndex: number`, `indicatorFraction: number`, `indicatorTransition?: string`, `dragging: boolean`。
- Produces: `rail-wheel: [event: WheelEvent]`。

- [x] **Step 1: 实现 `<script setup lang="ts">` 合约**
  - 在子组件内使用 `useI18n`、`NAV_ROUTES`、`AppIcon` 和 `RouterLink`。
  - 用 `tabLit(index)` 纯函数复现原有 tabbar 亮度计算。
  - 用 `defineEmits` 将 rail 的 wheel 事件显式上抛。

- [x] **Step 2: 迁移 rail、tabbar 模板与导航专属 CSS**
  - 保留原有 class、ARIA 属性、inline style、注释、媒体查询和 safe-area 计算。
  - 通过 `variant` 让每个组件实例只输出一个 nav 根节点，保留 rail → main → tabbar 的文档顺序。
  - 只迁移 `.rail*`、`.tabbar*` 及其相关媒体查询；不迁移 `.shell`、`.main`、页面 track 或 toast 样式。

- [x] **Step 3: 运行导航组件测试确认通过**

  Run: `npm test -- --run tests/app-navigation.spec.ts`

  Expected: 新增导航组件测试全部通过。

### Task 3: 接入根组件并清理重复实现

**Files:**
- Modify: `src/App.vue`
- Test: `tests/app-navigation.spec.ts`

**Interfaces:**
- Consumes: `usePageDrag` 当前返回的 `indicatorFraction`、`indicatorTransition`、`dragging`、`onRailWheel`。
- Produces: 根组件渲染 `AppNavigation`，页面编排继续使用其余 `usePageDrag` 返回值。

- [x] **Step 1: 在 `App.vue` 中接入 `AppNavigation`**
  - 在 `.main` 前放置 `variant="rail"` 实例，在 `.main` 后放置 `variant="tabbar"` 实例，传入活动路由名、导航索引、指示器状态和拖拽状态。
  - 仅在 rail 实例上使用 `@rail-wheel="onRailWheel"`，保持现有 wheel 处理链与移动端文档顺序。

- [x] **Step 2: 删除根组件中已迁移的导入、函数、模板和样式**
  - 删除 `RouterLink`、`AppIcon` 的导航用途及 `tabLit`、导航专属状态解构。
  - 保留页面标题所需的 `NAV_ROUTES` 与页面 track 所需的状态。

- [x] **Step 3: 运行回归验证**

  Run: `npm test`

  Expected: 全部既有测试与导航测试通过，且没有修改测试断言来适配实现。

  Run: `npm run lint && npm run typecheck && npm run build:only && npm run format:check && git diff --check`

  Expected: 所有命令退出码为 0。

  Run: `npm run e2e`

  Expected: 既有 E2E 全部通过，允许保留仓库当前已有的跳过项。

## Self-Review

- 规范覆盖：设计文档中的 props、事件、样式迁移、测试和回归验收分别由 Task 1–3 覆盖。
- 接口一致：Task 2 定义的五个 props 与一个事件在 Task 3 原样接入。
- 范围控制：只拆导航壳，不改变 store、router、页面 track 或业务视图。
- 风险覆盖：当前项、拖拽指示器、wheel、响应式 tabbar 和可访问链接均有测试或完整回归验证。

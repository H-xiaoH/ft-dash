# 交易界面与交互一致性实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变 Freqtrade 数据合同和机器人生命周期的前提下，修复交易详情/筛选、移动端滚动、设置表单、日志、提示条和市场列表的交互一致性问题。

**Architecture:** 保留现有 Vue 3 页面和自定义 CSS 体系，以 query 中的 `filter`/`trade` 分离列表与抽屉状态；把弹层滚动锁和内联确认抽成可复用基础能力，页面级改动只负责编排。移动端手势由交易筛选区域消费，并明确排除页面导航拖拽；市场列表改为视口内 flex 剩余空间滚动。

**Tech Stack:** Vue 3.5、`<script setup lang="ts">`、TypeScript、Vue Router 5、Pinia、Vue I18n、Vitest、Playwright。

**Spec:** `.scratch/trade-ui-polish/spec.md`

## Global Constraints

- 使用 `CONTEXT.md` 中的领域词汇：`pair` 表示交易对，`trade` 表示交易，`openTrades` 表示当前持仓，`closedTrades` 表示已平仓，`bot` 表示机器人，底部通知称为提示条。
- 不改变 Freqtrade API 合同、数据模型、机器人轮询策略、缓存、WebSocket 或机器人切换生命周期。
- 中文和英文文案必须同步维护。
- 保留现有 `FilterMenu`、`ConfirmDialog`、`AppIcon` 和全局 token/CSS 体系；不引入 shadcn-vue、新的图标库或其他第三方 UI 组件库。
- 新增/修改的 SFC 使用 `<script setup lang="ts">`、显式 props/emits 和稳定的 `v-for` key。
- 需要文字确认或明确风险确认的操作继续使用 `ConfirmDialog`；只把机器人删除和清除本机数据做成非模态内联提示。

## Review Focus

- 交易筛选区域上的横向手势不能被全局页面拖拽抢走，垂直手势仍能滚动页面；由 Task 2 的移动端 E2E 覆盖。
- 详情 query 被浏览器返回或数据尚未加载时不能留下陈旧抽屉；由 Task 2 的返回/深链 E2E 覆盖。
- 交易详情打开确认框时不能提前解除背景 `inert` 或 body 滚动锁；由 Task 1 的嵌套弹层单测和 Task 2 的抽屉 E2E 覆盖。
- 无效日志时间、长提示条文案和窄视口不能溢出或抛错；由 Task 4 的格式化单测和提示条 E2E 覆盖。
- 短视口与大量交易对时，名单自身滚动、主页面不滚动且键盘仍可聚焦名单；由 Task 5 的市场 E2E 覆盖。

## 文件边界

- 共享交互：`src/composables/useModalFocus.ts`、`src/components/InlineConfirm.vue`。
- 交易路由与手势：`src/views/TradesView.vue`、`src/views/DashboardView.vue`、`src/composables/usePageDrag.ts`、`src/components/TradeDetail.vue`。
- 设置与机器人：`src/views/SettingsView.vue`、`src/components/BotsPanel.vue`、`src/i18n/locales/zh-CN.ts`、`src/i18n/locales/en.ts`。
- 格式与共用视觉：`src/lib/format.ts`、`src/composables/useFormat.ts`、`src/views/LogsView.vue`、`src/App.vue`、`src/styles/components.css`。
- 市场布局：`src/views/MarketView.vue`。
- 回归覆盖：`tests/format.spec.ts`、新增共享组件/组合式函数单测（必要时）、`e2e/trades.spec.ts`、`e2e/settings.spec.ts`、`e2e/market.spec.ts`。

### Task 1: 嵌套弹层滚动锁与内联确认基础能力

**Files:**
- Create: `src/components/InlineConfirm.vue`
- Modify: `src/composables/useModalFocus.ts`
- Modify: `src/components/ConfirmDialog.vue`
- Modify: `src/components/TradeDetail.vue`
- Test: `tests/modal-focus.spec.ts`
- Test: `tests/inline-confirm.spec.ts`

**Interfaces:**
- `InlineConfirm.vue` consumes `open`, `message`, `confirmLabel`, `cancelLabel`、`pending` props and produces `confirm`/`cancel` events；组件不保存业务状态。
- `useModalFocus(open, panel)` 保持现有调用签名，内部增加跨实例计数，只有计数归零时解除 shell `inert`、body overflow lock 和焦点上下文。
- `ConfirmDialog` 和 `TradeDetail` 继续使用现有 props/emits，不把业务确认动作下沉到共享组件。

- [ ] **Step 1: Write the failing modal-lock tests**

  在 `tests/modal-focus.spec.ts` 挂载两个同时打开的 `ConfirmDialog`（或一个详情抽屉加一个确认框），断言第一次关闭后 `.shell` 仍有 `inert`、`document.body.style.overflow` 仍为 `hidden`，最后一个关闭后两者恢复；补充卸载仍打开实例时能清理锁的测试。

- [ ] **Step 2: Run the focused modal tests and verify they fail**

  Run: `npm run test -- tests/modal-focus.spec.ts`
  Expected: FAIL because current `useModalFocus` 没有全局嵌套计数，也没有 body 滚动锁。

- [ ] **Step 3: Implement the counted modal lock in `src/composables/useModalFocus.ts`**

  增加模块级 active-lock 计数和首次锁定时保存的 body overflow；每个 composable 实例只释放自己取得的锁，`onBeforeUnmount` 也走同一释放路径。焦点仍按实例保存和恢复，shell 只在全局计数从 0 到 1/1 到 0 时切换 `inert`。

- [ ] **Step 4: Add the shared inline-confirm component**

  在 `src/components/InlineConfirm.vue` 实现 `open`、`message`、`confirmLabel`、`cancelLabel`、`pending` 的类型化 props 和 `confirm`/`cancel` emits；使用 `role="alert"` 的 `.banner` 容器、可换行的消息区和按钮区，消息在容器中居中，按钮保持可点击目标尺寸。

- [ ] **Step 5: Run the focused tests and verify they pass**

  Run: `npm run test -- tests/modal-focus.spec.ts tests/inline-confirm.spec.ts`
  Expected: PASS with nested lock restoration and typed inline events covered.

- [ ] **Step 6: Add scroll-boundary styles**

  在 `TradeDetail.vue` 的详情正文和 `ConfirmDialog.vue` 的 dialog/overlay 上设置 `overscroll-behavior`；详情正文保留 `overflow-y: auto`、移动端触摸纵向滚动和 safe-area 行为，使背景锁定时只有详情正文消费滚动。

- [ ] **Step 7: Commit the shared interaction foundation**

  ```bash
  git add src/components/InlineConfirm.vue src/composables/useModalFocus.ts src/components/ConfirmDialog.vue src/components/TradeDetail.vue tests/modal-focus.spec.ts tests/inline-confirm.spec.ts
  git commit -m "♻️ refactor: 统一弹层滚动锁与内联确认"
  ```

### Task 2: 交易筛选手势、路由上下文与详情返回

> 后续用户决定移除交易页筛选专用的左右手势和滑动背景块。本任务中与交易筛选手势、`[data-swipe-tabs]` 和 `moveFilter` 相关的步骤以该决定为准：筛选只通过点击切换，横向滑动交给全局页面导航或原生滚动容器。

**Files:**
- Modify: `src/views/TradesView.vue`
- Modify: `src/views/DashboardView.vue`
- Modify: `src/composables/usePageDrag.ts`
- Modify: `e2e/trades.spec.ts`
- Modify: `e2e/navigation.spec.ts`（仅在需要验证全局手势排除时）

**Interfaces:**
- `TradesView` 继续以 `Filter = 'open' | 'closed' | 'all'` 为唯一筛选类型；筛选只通过点击切换。
- 页面手势层不再识别交易筛选专用的 `[data-swipe-tabs]` 区域；横向手势继续由全局页面导航或原生滚动容器处理。
- `DashboardView` 的 `openOverviewTrade(trade: Trade, filter: 'open' | 'closed'): void` 统一带上筛选和交易 query。

- [ ] **Step 1: Add failing E2E assertions for route context and return**

  在 `e2e/trades.spec.ts` 增加：总览当前持仓行打开后 URL 同时含 `filter=open` 和 `trade` 且活动筛选为“持仓中”；最近平仓同理为 `filter=closed`；从交易列表打开详情后 `page.goBack()` 关闭抽屉并仍停留在 `/trades`。

- [ ] **Step 2: Run the focused E2E tests to verify the new assertions fail**

  Run: `npx playwright test e2e/trades.spec.ts --grep "matching trades tab|same trades list|recently closed rows"`
  Expected: FAIL because overview rows lack the filter query and `TradesView` uses `replace` when opening a detail.

- [ ] **Step 3: Implement explicit trade/list query transitions**

  在 `DashboardView.vue` 用 `openOverviewTrade` 替换两处行内导航；在 `TradesView.vue` 的 `openTrade` 使用 `router.push` 保存详情历史项，监听 `route.query.trade` 从有值变为无值时清空 `selected`，保持现有 `filter` 同步和深链异步解析。

- [x] **Step 4: Replace the cancelled mobile filter-swipe assertions**

  用户确认取消交易筛选左右滑动；`e2e/trades.spec.ts` 改为验证从交易结果区域横滑会进入全局页面导航，而不会改变交易筛选。

- [x] **Step 5: Remove the obsolete owned tab gesture**

  移除筛选容器的 `data-swipe-tabs`、`touch-action`、touch handlers、`moveFilter` 以及 `usePageDrag` 中对应的特殊分支。

- [x] **Step 6: Run the focused trade E2E tests and verify they pass**

  Run: `npx playwright test e2e/trades.spec.ts`。
  Expected: PASS，且筛选过渡、URL 同步、全局导航横滑、deep link、focus/inert 测试继续通过。

- [ ] **Step 7: Commit the trade navigation changes**

  ```bash
  git add src/views/TradesView.vue src/views/DashboardView.vue src/composables/usePageDrag.ts e2e/trades.spec.ts e2e/navigation.spec.ts
  git commit -m "✨ feat: 优化交易筛选与详情返回"
  ```

### Task 3: 设置下拉、机器人表单与内联删除确认

**Files:**
- Modify: `src/views/SettingsView.vue`
- Modify: `src/components/BotsPanel.vue`
- Modify: `src/i18n/locales/zh-CN.ts`
- Modify: `src/i18n/locales/en.ts`
- Modify: `e2e/settings.spec.ts`
- Test: `tests/inline-confirm.spec.ts`（如 Task 1 的覆盖不足则补充 props/emits 场景）

**Interfaces:**
- `BotsPanel` 增加局部 `nameTouched` 标记和 `watch(() => form.value?.username, ...)`；提交时仍使用现有 `defaultBotName` 兜底。
- `SettingsView` 和 `BotsPanel` 都消费 Task 1 的 `InlineConfirm`，确认事件仍调用各自已有业务函数。
- 测试连接结果只影响按钮文案/状态，不再渲染名称旁结果 chip。

- [ ] **Step 1: Add failing settings E2E assertions**

  在 `e2e/settings.spec.ts` 增加：语言/时区触发按钮使用同一设置选择器类和宽度；测试连接成功后机器人名称区域没有 `bots.testOk` chip、测试按钮显示“连接成功”；添加机器人时用户名输入会补充名称，手动改名后用户名不再覆盖；删除按钮打开列表内确认而非 `[role=dialog]`；清除本机数据提示正文居中。

- [ ] **Step 2: Run focused settings tests to verify the assertions fail**

  Run: `npx playwright test e2e/settings.spec.ts --grep "dropdown|test connection|name|delete|center"`
  Expected: FAIL on current separate styles, name chip, missing username watcher, modal delete and non-centered banner.

- [ ] **Step 3: Unify language/timezone menu presentation**

  给两个 `FilterMenu` 使用同一 `settings__filter` class、同一 `align="start"` 和 full-width trigger 样式；时区仅保留 searchable/searchText/hint 差异，确保选项内容不被裁切。

- [ ] **Step 4: Move connection success into the test button**

  在 `BotsPanel.vue` 测试按钮根据 `testResult[entry.id]` 渲染连接成功文案和成功态；开始新测试时清除该条旧结果，失败时回到可重试的测试连接按钮；删除名称区域的成功/失败 chip。

- [ ] **Step 5: Add controlled username-to-name linking**

  `startAdd` 将 `nameTouched` 置为 false，名称输入事件置为 true；用户名 watcher 只在未手动编辑名称且表单仍存在时写入 trimmed username；`startEdit` 将标记置为 true，避免既有机器人名称被重写。

- [ ] **Step 6: Replace the bot delete dialog and center the local-data prompt**

  移除 `BotsPanel` 的机器人删除 `ConfirmDialog`，在机器人列表下方渲染 `InlineConfirm`；保持 `confirmRemove` 的并发检查、store 调用和提示条。`SettingsView` 也改用 `InlineConfirm`，通过 flex wrap、`justify-content: center` 和消息最大宽度让“这会把保存的凭据与偏好一并删除”居中且窄屏可换行。

- [ ] **Step 7: Run focused settings tests and verify they pass**

  Run: `npx playwright test e2e/settings.spec.ts --grep "dropdown|test connection|name|delete|center"`
  Expected: PASS，且既有设置布局、时区搜索、通知和机器人切换测试不回退。

- [ ] **Step 8: Commit settings and robot changes**

  ```bash
  git add src/views/SettingsView.vue src/components/BotsPanel.vue src/i18n/locales/zh-CN.ts src/i18n/locales/en.ts e2e/settings.spec.ts tests/inline-confirm.spec.ts
  git commit -m "✨ feat: 统一设置与机器人操作反馈"
  ```

### Task 4: 日志日期时间和自适应提示条

**Files:**
- Modify: `src/lib/format.ts`
- Modify: `src/composables/useFormat.ts`
- Modify: `src/views/LogsView.vue`
- Modify: `src/App.vue`（仅在需要调整提示条可访问标记时）
- Modify: `src/styles/components.css`
- Modify: `tests/format.spec.ts`
- Modify: `e2e/settings.spec.ts`（已有提示条测试旁补充尺寸断言）

**Interfaces:**
- 新增 `DateTimeParts` 类型和 `formatDateTimeParts(value, locale, fallback, timeZone): DateTimeParts`；`useFormat` 暴露 `dateTimeParts(value): DateTimeParts`，无效值返回与当前 locale 一致的 fallback date、空 time，不改变 `dateTime`。
- 日志视图只消费 `useFormat().dateTimeParts`，不直接读取 `Intl` 或 settings timezone。

- [ ] **Step 1: Add failing formatter tests**

  在 `tests/format.spec.ts` 断言同一个 UTC 时间在 `zh-CN`/指定时区下返回独立 `date` 与 `time`，并断言 `null`/非法时间返回安全 fallback；保留现有 `formatDateTime` 测试。

- [ ] **Step 2: Run focused formatter tests to verify they fail**

  Run: `npm run test -- tests/format.spec.ts`
  Expected: FAIL because `formatDateTimeParts` 尚不存在。

- [ ] **Step 3: Implement locale/timezone-aware date-time parts**

  在 `src/lib/format.ts` 使用与 `formatDateTime` 相同的 `parseTimestamp` 和 timeZone，分别用 dateStyle/timeStyle formatter 生成两段文本；在 `useFormat.ts` 暴露 typed wrapper。

- [ ] **Step 4: Render log timestamps on two lines**

  `LogsView.vue` 为每行计算 `dateTimeParts`，日期和时间放在同一个 `.logs__time` 内的两个 block/line 元素，保持 `num` 和现有网格列语义；无效时间显示安全占位而不是抛错。

- [ ] **Step 5: Make toasts content-adaptive**

  调整 `toast-stack` 为 `width: max-content` + `max-width: calc(100vw - 32px)`，桌面保留右下角定位、移动端保留居中定位；`.toast` 使用 `fit-content`、`max-width: 100%` 和可断行规则，倒计时条和现有 Transition 不变。

- [ ] **Step 6: Run formatter and focused UI tests**

  Run: `npm run test -- tests/format.spec.ts`
  Run: `npx playwright test e2e/settings.spec.ts --grep "toasts"`
  Expected: PASS；短文案不再撑满固定宽度，长文案在视口内换行，日志时间保持 locale/timezone 正确。

- [ ] **Step 7: Commit formatting and toast changes**

  ```bash
  git add src/lib/format.ts src/composables/useFormat.ts src/views/LogsView.vue src/App.vue src/styles/components.css tests/format.spec.ts e2e/settings.spec.ts
  git commit -m "💄 style: 优化日志时间与提示条布局"
  ```

### Task 5: 市场交易对名单的视口内滚动

**Files:**
- Modify: `src/views/MarketView.vue`
- Modify: `e2e/market.spec.ts`
- Modify: `e2e/support/fixtures.ts`

**Interfaces:**
- `MarketView` 不改变 `whitelistRows`、`blacklistRows`、`selectedPair` 或 K 线数据流；只增加页面/列表容器 class 和布局约束。
- `mockApi(page, options)` 增加可选 `whitelistCount?: number`；启用时返回稳定的 `P01/USDT`…交易对名单，现有默认 fixture 行为不变。
- `.market-page` 使用可用视口高度，交易对所属 panel 为 flex 子项，`.market__scroll` 使用 `flex: 1; min-height: 0; overflow-y: auto`，不再使用固定 `62vh`。

- [ ] **Step 1: Add failing market layout E2E assertions**

  在 `e2e/market.spec.ts` 增加短视口和长白名单场景：交易对列表容器的 `scrollHeight > clientHeight`，主页面 `document.scrollingElement.scrollTop` 保持 0；键盘 focus 仍能落到 `.market__scroll`。

- [ ] **Step 2: Run focused market test to verify it fails**

  Run: `npx playwright test e2e/market.spec.ts --grep "inside|scroll|whitelist"`
  Expected: FAIL because current fixed `62vh` list plus K 线区域 still grows the page and the expected flex classes do not exist.

- [ ] **Step 3: Implement the viewport flex layout**

  先在 `e2e/support/fixtures.ts` 实现 `whitelistCount` 的可选响应，再给根 stack 和交易对 panel 增加明确 class；根高度按 `100dvh - var(--topbar-h) - shell paddings` 计算，K 线 panel 保持内容高度，名单 panel `flex: 1; min-height: 0`，名单滚动容器移除 `max-height: 62vh` 并占满剩余空间。确保手机 bottom bar 的 `--shell-pad-bottom` 被计算在可用高度内。

- [ ] **Step 4: Run market and accessibility checks**

  Run: `npx playwright test e2e/market.spec.ts e2e/a11y.spec.ts --grep "market|routes|whitelist"`
  Expected: PASS，名单可见区域内部滚动、焦点区域仍有 role/label，其他市场 tab 和 K 线回归不受影响。

- [ ] **Step 5: Commit market layout changes**

  ```bash
  git add src/views/MarketView.vue e2e/market.spec.ts e2e/support/fixtures.ts
  git commit -m "📱 feat: 让市场交易对列表自适应滚动"
  ```

### Task 6: 全量验证与 Vue 3 审查

**Files:**
- Modify: 仅在验证发现问题时修改对应实现/测试文件
- Review: `src/**/*.vue`、`src/composables/**/*.ts`、`src/lib/format.ts`、相关测试与规格/计划文件

- [ ] **Step 1: Run the full unit, lint, type, format and build checks**

  ```bash
  npm test
  npm run lint
  npm run typecheck
  npm run format:check
  npm run build
  git diff --check HEAD~5..HEAD
  ```

  Expected: all commands exit 0；单测无失败，类型检查和 lint 无错误，生产构建成功，diff 无空白错误。

- [ ] **Step 2: Run the full Playwright suite**

  Run: `npm run e2e`
  Expected: 现有 E2E 全部通过，只有已知且未改动的 WebKit skip 保持原状；重点复查交易详情、设置、市场和无障碍页面。

- [ ] **Step 3: Perform the Vue 3 review pass**

  按 `vue3-reviewer` 六个维度检查新增/修改内容：Composition API/typed props-emits、deprecated API、现有 AppIcon 约定、项目非 Laravel 因此 Wayfinder 不适用、组件边界与共享 composable；同时按 `vue-best-practices` 检查 computed 纯函数、watch 副作用、数据流和 SFC 顺序。

- [ ] **Step 4: Verify requirement checklist against the spec**

  逐项确认交易左右滑动、总览筛选上下文、详情返回/滚动锁、语言/时区一致、连接成功位置、用户名联动、机器人内联删除、清除数据居中、提示条自适应、日志换行和市场内滚动；任何未覆盖项必须报告而不是默认为完成。

- [ ] **Step 5: Commit any final review fixes with gitmoji**

  只有发现并修复最终问题时才追加提交；提交信息沿用项目现有 gitmoji 约定，提交前重新运行受影响的验证命令。

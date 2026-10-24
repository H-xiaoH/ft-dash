# FT Dash 数据层重写与运行时可靠性实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 FT Dash 的机器人数据访问重写为有 session 生命周期和请求代次的数据层，并修复本次 code review 的全部 Must fix/Should fix，同时完成 PWA、Freqtrade 版本软提示、生产代理/CDN 和 `source-map-js` 验证。

**Architecture:** 新增 `src/data/freqtrade`，由 transport 处理鉴权、超时和 HTTP 错误，由当前 API v1 client 处理 endpoint，由 `BotSession` 处理单一活动机器人、刷新代次、快照、写操作 mutex 和 WebSocket 生命周期；Pinia `bot` store 只投影 session 状态并保留现有页面 action。页面只保留明确的 watcher/ref，纯逻辑留在纯函数中。

**Tech Stack:** Vue 3 Composition API、Pinia、TypeScript、Vitest、Vue Test Utils、Playwright、Vite、vite-plugin-pwa。

**Spec:** `docs/superpowers/specs/2026-10-24-ft-dash-data-layer-hardening-design.md`

## Global Constraints

- 本次以 Freqtrade API v1 的当前目标契约为参考，不实现旧版本的 endpoint、字段或响应形状兼容分支。
- 版本不匹配不阻断连接，只显示可能出现问题和错误的提示。
- 当前机器人是唯一实时数据源；切换机器人是切换数据源，不是并行轮询。
- 机器人快照只用于切换回来时先画一帧；真实刷新完成前所有写操作必须保持禁用。
- `remember=false` 时密码和 `wsToken` 都不能进入 `localStorage`。
- 不对真实生产机器人执行写操作；生产检查只读。
- 不创建、不恢复 `codex/trade-ui-polish` 分支；实现直接在当前 `main` 工作树完成。
- 提交使用 gitmoji；不改变用户已经完成的历史提交。
- 不引入通用 query framework，不重做全部页面组件，不修改生产主机、CDN 或反向代理配置。

## Review Focus

- 旧 session 的成功/失败响应在机器人切换后到达：必须不改变当前 bot 的数据、错误或 loading；由 Task 2 的 session race tests 覆盖。
- `response.text()` 在 headers 已收到后卡住：必须触发同一个 timeout；由 Task 1 的 transport body-timeout test 覆盖。
- 版本未知或非目标版本：必须连接成功并出现一次可定位的软警告；由 Task 1/2 的 compatibility tests 覆盖。
- 用户快速切换交易对或连续操作：必须取消/丢弃旧读请求并互斥写请求；由 Task 2/5 的 generation tests 覆盖。
- 生产 base path、SPA fallback、API cache 和 WebSocket Upgrade 同时存在：必须保留 API 原始状态码且静态壳仍可更新；由 Task 6 的 artifact/proxy checklist 覆盖。

## 文件与任务边界

任务按共享接口顺序执行：Task 1 产出 transport/client，Task 2 消费它并产出 session，Task 3 将 session 接入凭据和事件生命周期，Task 4 修复纯函数，Task 5 修改视图，Task 6 做依赖、构建、设备和部署验收。每个任务都先写回归测试、确认测试失败，再实现并运行自己的测试。

### Task 1: 当前 Freqtrade API client 与 transport

**Files:**
- Create: `src/data/freqtrade/errors.ts`
- Create: `src/data/freqtrade/transport.ts`
- Create: `src/data/freqtrade/client.ts`
- Create: `src/data/freqtrade/index.ts`
- Modify: `src/lib/stream.ts`，从新模块读取 `WS_AUTH_UNSUPPORTED_STATUS`
- Modify: `tests/api.spec.ts`，迁移 import 并增加 transport/client contract tests
- Modify: `tests/stream-auth.spec.ts`，迁移 `ApiError` import
- Modify: `src/lib/api.ts`，临时从 `src/data/freqtrade/index.ts` re-export，保持任务之间工作树可编译；在 Task 3 完成全部消费者迁移后删除

**Interfaces:**
- Produces `Credentials`, `RequestOptions`, `ApiErrorKind`, `ApiError`, `describeError`, `normalizeBaseUrl`, `absoluteBaseUrl`, `websocketUrl`。
- Produces `FreqtradeTransport.request<T>(path: string, options?: RequestOptions): Promise<T>`；transport 负责 Basic/JWT、一次 bearer→Basic 重试、完整响应体 timeout、外部 AbortSignal 和 `cache: no-store`。
- Produces `FreqtradeApiClient`，保留当前 `FreqtradeApi` 的 endpoint 方法签名（`ping`, `showConfig`, `health`, `status`, `trades`, `pairCandles`, 所有 analytics/read/write endpoints），但严格按目标 API v1 的响应模型解析，不提供旧形状 fallback。
- Produces `inspectCompatibility(): Promise<CompatibilityResult>`，结果包括 `status: 'compatible' | 'warning' | 'unknown'`、检测到的版本、参考契约标识和可展示的 warning key；探测失败不抛出阻断连接的错误。

- [ ] **Step 1: 写 transport/client 的失败测试。**

  在 `tests/api.spec.ts` 增加：`response body stall is covered by the request timeout`、`external abort is classified separately`、`current contract errors retain endpoint/status/detail`、`version mismatch returns a warning without rejecting connection`、`version probe failure returns unknown warning`。保留现有 Basic/JWT、URL、query、401 retry、422 detail 测试并改用新 import。

- [ ] **Step 2: 运行测试确认失败。**

  Run: `npm test -- tests/api.spec.ts tests/stream-auth.spec.ts`

  Expected: 新增测试因 `src/data/freqtrade/*` 不存在或当前 timeout 在 `response.text()` 前清理而 FAIL；不得通过放宽断言使其通过。

- [ ] **Step 3: 实现 transport。**

  将 `response.text()`、JSON parse 和错误映射放进 timeout 的生命周期内；只有完整 body 读取或异常结束后才清理 timer/listener。为 timeout、abort、offline、CORS、HTTP、parse 保留可区分的 `ApiError`。仅保留 bearer 被 401 拒绝时的一次 Basic retry，不为旧 Freqtrade 响应形状增加 retry/fallback。

- [ ] **Step 4: 实现严格 API client 和软兼容探测。**

  将当前 `src/lib/api.ts` 的 endpoint 方法迁入 `FreqtradeApiClient`。版本探测优先读取当前 API 的版本信息；缺失、不可解析或代理返回非预期状态时返回 `unknown` warning，不阻断 `ping/showConfig`。解析错误包含 endpoint 和字段位置。

- [ ] **Step 5: 运行 Task 1 测试确认通过。**

  Run: `npm test -- tests/api.spec.ts tests/stream-auth.spec.ts`

  Expected: 新增与迁移测试全部 PASS，且 body timeout 的 fake response 在指定 timeout 内被 abort。

- [ ] **Step 6: 提交 Task 1。**

  ```bash
  git add src/data/freqtrade src/lib/api.ts src/lib/stream.ts tests/api.spec.ts tests/stream-auth.spec.ts
  git commit -m "♻️ refactor: 重写 Freqtrade API transport"
  ```

### Task 2: BotSession、刷新代次与写操作 mutex

**Files:**
- Create: `src/data/freqtrade/session.ts`
- Modify: `src/stores/bot.ts`
- Modify: `tests/bot-switch.spec.ts`
- Create: `tests/bot-session.spec.ts`

**Interfaces:**
- Consumes `FreqtradeApiClient`, `ApiError` and URL helpers from Task 1。
- Produces `ResourceName`、`RefreshSummary`、`BotSessionState` 和 `BotSessionController`。
- `BotSessionController` 至少提供：`connect(): Promise<boolean>`、`stop(): void`、`refreshAll(): Promise<RefreshSummary>`、`refreshCore(): Promise<RefreshSummary>`、`refreshTrades(): Promise<RefreshSummary>`、`refreshAnalytics(): Promise<RefreshSummary>`、`refreshMarket(): Promise<RefreshSummary>`、`refreshSystem(): Promise<RefreshSummary>`、`startPolling(): void`、`stopPolling(): void`、`fetchCandles(pair: string, timeframe: string, limit?: number): Promise<PairCandlesResponse | null>`、`runAction<T>(name: string, task: (client: FreqtradeApiClient) => Promise<T>): Promise<T | null>`。
- `BotSessionState` 必须包含当前 bot id/epoch、`snapshotStale`、核心/交易 readiness、兼容性结果、按资源错误、action pending token 和现有 `bot.ts` 暴露的业务数据。`data` 字段沿用现有完整数据面：`showConfig`、`health`、`sysinfo`、`balance`、`profit`、`profitAll`、`openTrades`、`count`、`trades`、`tradeStats`、`performance`、`daily`、`weekly`、`monthly`、`whitelist`、`blacklist`、`locks`、`logs`、`candleCache`、`latencyMs` 和 `lastFetchAt`；类型直接引用 `src/lib/types.ts`，不复制第二套 API 类型。

- [ ] **Step 1: 写 session race/mutex 的失败测试。**

  在 `tests/bot-session.spec.ts` 增加：`keeps a snapshot stale until core and trades are both fresh`、`drops an old resource success after a session switch`、`drops an old resource failure after a session switch`、`does not let one successful resource clear another resource error`、`serializes actions and old finally cannot clear the next action`、`allows a mismatched version while publishing a warning`。在 `tests/bot-switch.spec.ts` 保留现有切换、poll latch 和 stream isolation 回归。

- [ ] **Step 2: 运行测试确认失败。**

  Run: `npm test -- tests/bot-session.spec.ts tests/bot-switch.spec.ts`

  Expected: 新 session tests FAIL，至少能证明旧 `snapshotStale` 在 `refreshAll` 完成前被错误清除，或并发 action 覆盖 `actionPending`。

- [ ] **Step 3: 实现 `BotSessionController`。**

  将 epoch、每资源 generation、请求 AbortController、snapshot capture/restore、poll latch、refresh aggregation、heartbeat 和 stream 生命周期从 store 的隐式变量收拢到 session。每次连接/切换/停止都推进 epoch；提交响应前检查 epoch、资源 generation 和 bot id。核心与 trades 成功前保持 snapshot stale；可选资源失败保留自己的错误。

- [ ] **Step 4: 实现 action mutex 并迁移 store。**

  让所有写 endpoint 经由 `runAction` 的单一 token/mutex。Pinia store 只把 session state 投影为现有 refs/getters/actions，保留页面需要的 `writesAllowed`、`actionPending`、`actionError` 和 endpoint wrappers。移除 `bot.ts` 中重复的刷新和生命周期协调逻辑。

- [ ] **Step 5: 运行 session/store 测试确认通过。**

  Run: `npm test -- tests/bot-session.spec.ts tests/bot-switch.spec.ts`

  Expected: 旧竞态测试与新增测试全部 PASS；旧响应不能改变当前 bot 的数据、错误、loading 或刷新 latch。

- [ ] **Step 6: 提交 Task 2。**

  ```bash
  git add src/data/freqtrade/session.ts src/stores/bot.ts tests/bot-session.spec.ts tests/bot-switch.spec.ts
  git commit -m "🐛 fix: 统一机器人会话刷新与操作锁"
  ```

### Task 3: 凭据生命周期、机器人激活与事件隔离

**Files:**
- Modify: `src/stores/settings.ts`
- Modify: `src/lib/bots.ts`
- Modify: `src/stores/events.ts`
- Modify: `src/views/ConnectView.vue`
- Modify: `src/components/BotsPanel.vue`
- Modify: `src/views/SettingsView.vue`
- Modify: `src/i18n/locales/zh-CN.ts`
- Modify: `src/i18n/locales/en.ts`
- Modify: `tests/bots.spec.ts`
- Modify: `tests/bots-panel.spec.ts`
- Modify: `tests/events-store.spec.ts`
- Modify: `tests/locale-preference.spec.ts`（如清除设置的断言需要迁移）
- Modify: `tests/bot-switch.spec.ts`（补充 session event scope 断言）

**Interfaces:**
- `settings.clearStoredData(): void` 重置持久化与内存 defaults；调用方只需再通知 bot session/events cleanup，不自行拼接 reset 字段。
- `settings.addBot(input: BotInput): Bot` 在 `input.wsToken` 缺省时写入 `''`，不读取当前活动 bot。
- events store 提供 `beginScope(scope: { botId: string; epoch: number }): void`、`endScope(): void`、`ingest(message: WsMessage, scope: { botId: string; epoch: number }): void`；scope 参数必填，非当前 scope 的消息被丢弃。

- [ ] **Step 1: 写凭据、清除、激活和事件隔离的失败测试。**

  增加：`does not persist password or wsToken when remember is false`、`clearStoredData resets in-memory controls and region preferences`、`new bot does not inherit active wsToken`、`connect view activates the newly added bot`、`old bot events are ignored after scope changes`。测试同时断言 localStorage、sessionStorage 和 Pinia 内存值。

- [ ] **Step 2: 运行测试确认失败。**

  Run: `npm test -- tests/bots.spec.ts tests/bots-panel.spec.ts tests/events-store.spec.ts tests/locale-preference.spec.ts`

  Expected: 至少出现 wsToken 持久化、清除后 controls/locale/timezone 保留或新 bot 仍连接旧 active bot 的 FAIL。

- [ ] **Step 3: 修复 settings/bot serialization。**

  将 `password` 和 `wsToken` 一起纳入 remember 策略；`clearStoredData` 重置所有 `DEFAULT_SETTINGS` 字段并清空 bot 列表/active id；连接页添加新 bot 后显式激活它，再用新 credentials 重建 session。

- [ ] **Step 4: 修复事件 scope 和兼容性提示。**

  bot session 切换/停止时推进 event scope 并清空旧列表；在 Settings/System 可查看兼容性 warning，在 Connect/首次连接时最多提示一次。新增中英文文案，明确“仍已连接，但可能出现接口错误”，不得写成拒绝连接。

- [ ] **Step 5: 运行测试确认通过。**

  Run: `npm test -- tests/bots.spec.ts tests/bots-panel.spec.ts tests/events-store.spec.ts tests/locale-preference.spec.ts tests/bot-switch.spec.ts`

  Expected: 全部 PASS，且旧 session 事件不会出现在当前机器人列表。

- [ ] **Step 6: 提交 Task 3。**

  ```bash
  git add src/stores/settings.ts src/lib/bots.ts src/stores/events.ts src/views/ConnectView.vue src/components/BotsPanel.vue src/views/SettingsView.vue src/i18n/locales tests/bots.spec.ts tests/bots-panel.spec.ts tests/events-store.spec.ts tests/locale-preference.spec.ts tests/bot-switch.spec.ts src/lib/api.ts
  git rm src/lib/api.ts
  git commit -m "🔒 fix: 收紧机器人凭据与事件隔离"
  ```

### Task 4: K 线、CSV 和绩效哨兵值

**Files:**
- Modify: `src/lib/candles.ts`
- Modify: `src/lib/csv.ts`
- Modify: `src/lib/format.ts`
- Modify: `src/views/DashboardView.vue`
- Modify: `src/views/StatsView.vue`
- Modify: `tests/candles.spec.ts`
- Modify: `tests/csv.spec.ts`
- Modify: `tests/stats.spec.ts`

**Interfaces:**
- `SIGNAL_COLUMNS` 包含 `enter_long`, `exit_long`, `enter_short`, `exit_short`。
- `collectCandleMarks()` 对 short 入场产生 `sell`，对 short 出场产生 `buy`；trade fill 根据 `trade.side` 选择 long/short 的 entry/exit 方向。
- `toCsv()` 保留 RFC 引号规则，并对以 `=`, `+`, `-`, `@` 开头的字符串做公式注入防护。
- 新增纯函数 `hideFreqtradeSentinel(value: Numberish, sentinel = -100): Numberish`，命中 sentinel 返回 `null`，否则返回原值；MetricTile 继续将 `null` 显示为 `—`。

- [ ] **Step 1: 写失败测试。**

  增加 short signal/fill 方向、short open trade 的测试；增加 `=SUM(...)`、`+cmd`、`-cmd`、`@cmd` 导出单元格的安全断言；增加 sentinel helper 和 Dashboard/Stats 显示为 `—` 的断言。

- [ ] **Step 2: 运行测试确认失败。**

  Run: `npm test -- tests/candles.spec.ts tests/csv.spec.ts tests/stats.spec.ts`

  Expected: short marks 方向错误、CSV 原样输出公式文本或 `-100` 仍格式化为数字时 FAIL。

- [ ] **Step 3: 实现纯函数和视图接入。**

  只在 domain utility 中做方向/CSV/sentinel 处理，不把安全逻辑放进模板；Dashboard 和 Stats 的 profit factor 传入 `hideFreqtradeSentinel()`。

- [ ] **Step 4: 运行测试确认通过并提交。**

  Run: `npm test -- tests/candles.spec.ts tests/csv.spec.ts tests/stats.spec.ts`

  Expected: 全部 PASS。

  ```bash
  git add src/lib/candles.ts src/lib/csv.ts src/lib/format.ts src/views/DashboardView.vue src/views/StatsView.vue tests/candles.spec.ts tests/csv.spec.ts tests/stats.spec.ts
  git commit -m "🐛 fix: 修正交易方向导出与绩效哨兵值"
  ```

### Task 5: MarketView、LogsView 与页面级副作用

**Files:**
- Modify: `src/views/MarketView.vue`
- Modify: `src/views/LogsView.vue`
- Create: `tests/market-view.spec.ts`
- Create: `tests/logs-view.spec.ts`
- Modify: `e2e/market.spec.ts`
- Modify: `e2e/smoke.spec.ts`

**Interfaces:**
- `MarketView` 的 candle load 只由一个带 `immediate: true` 的 watcher 启动；watch cleanup 或 request generation 保证旧 pair/timeframe 不能提交结果。
- `LogsView` 使用 `useTemplateRef<HTMLDivElement>('logs')` 或等价的 Vue 3.5 template ref；follow 开启且 `lines` 追加时滚动到底部，关闭时不改变 `scrollTop`。

- [ ] **Step 1: 写快速切换和自动滚动失败测试。**

  `market-view.spec.ts` 断言首次选中交易对只请求一次，快速切换时旧 response 不覆盖 `candles/loading/error`；`logs-view.spec.ts` 断言 follow 开启滚到底部、关闭 follow 不滚动。E2E 增加实际页面反馈断言。

- [ ] **Step 2: 运行测试确认失败。**

  Run: `npm test -- tests/market-view.spec.ts tests/logs-view.spec.ts`

  Expected: 在旧实现上出现重复 candle request、旧 pair data 覆盖或 scroll container 未变化的 FAIL。

- [ ] **Step 3: 实现 watcher cleanup 和 logs ref。**

  删除 `onMounted` 与 watcher 的重复初始化；将当前 pair/timeframe 捕获在 load request 中，并在 cleanup/sequence check 后才提交；用 `nextTick` 在 DOM 更新后按 follow 状态滚动。

- [ ] **Step 4: 运行组件/E2E 测试确认通过。**

  Run: `npm test -- tests/market-view.spec.ts tests/logs-view.spec.ts`  
  Expected: PASS。

  Run: `npm run e2e -- --grep "market|log|candle"`  
  Expected: 相关 E2E PASS。

- [ ] **Step 5: 提交 Task 5。**

  ```bash
  git add src/views/MarketView.vue src/views/LogsView.vue tests/market-view.spec.ts tests/logs-view.spec.ts e2e/market.spec.ts e2e/smoke.spec.ts
  git commit -m "✨ fix: 修复市场加载与日志跟随"
  ```

### Task 6: 依赖、PWA、生产部署和 source-map 验收

**Files:**
- Modify: `package.json`, `package-lock.json`，将 `source-map-js` 固定到 `>=1.2.2` 的可审计解析结果，并将 Vite 升至包含当前审计修复的版本
- Inspect/Modify only when verification proves necessary: `vite.config.ts`
- Modify: `e2e/pwa-navigation.spec.ts`
- Create if useful for repeatability: `docs/deployment-verification.md`

**Interfaces:**
- 不改变应用运行时 API；本任务产出的是可重复的构建产物检查、PWA E2E 检查和生产只读检查结果。
- 如依赖升级，保留 package-lock 的完整依赖关系；不得手工删除 `source-map-js` 条目。

- [ ] **Step 1: 先记录依赖与 bundle 基线。**

  Run: `npm ls source-map-js --all`、`npm audit --json`、`npm audit --omit=dev --json`、`npm run build`，并在 `dist` 中搜索 `source-map-js`、`SourceMapConsumer`。记录它是生产依赖路径、开发路径还是实际进入 bundle。

- [ ] **Step 2: 写 PWA/base-path 失败或回归测试。**

  在 `e2e/pwa-navigation.spec.ts` 增加 manifest `display/start_url/scope`、service worker 注册、standalone 返回行为和 API 请求不被 HTML fallback 吞掉的断言；如 `vite.config.ts` 的 denylist 不能覆盖自定义 `/kevin/api/v1`，先写出该失败用例。

- [ ] **Step 3: 最小化修复依赖或配置。**

  将 `source-map-js` 升至修复版本 `>=1.2.2`，并将 Vite 升至包含当前审计修复的版本（当前 registry 可用 `8.3.5`），更新完整 lockfile；优先使用正常依赖解析，只有依赖范围仍锁住 `1.2.1` 时才增加最小 `overrides`。如测试证明自定义 `/kevin/api/v1` 未被 fallback denylist 覆盖，再调整 `vite.config.ts`。保持 hashed assets 可缓存、HTML/SW/manifest 可更新、API 不缓存；不把 source map 运行时代码通过搜索排除规则隐藏。

- [ ] **Step 4: 验证构建产物和本地静态服务器。**

  Run: `npm run format:check`、`npm run typecheck`、`npm run lint`、`npm run build`、`npm run e2e`。用本地静态服务器执行 `curl -I` 检查 HTML、manifest、service worker、hashed assets 的 MIME、缓存和压缩，并确认 API 路径返回原始非 HTML 状态码。

- [ ] **Step 5: 验证真实生产 HTTP/WebSocket 行为。**

  对 `https://ft.hxiaoh.cn/kevin/api/v1` 只读执行 headers、OPTIONS、未授权 API 状态和 WebSocket Upgrade 检查；不得携带或猜测凭据。分别记录 CORS、`Cache-Control`、`Authorization` 处理、SPA fallback 和 Upgrade 结论。若生产需要认证才能判断某项，标记“环境无法验证”，不猜测结果。

- [ ] **Step 6: 验证设备安装态。**

  读取并使用 `argent-android-emulator-setup` 与 `argent-device-interact` 技能；若无物理设备，只在 Android 模拟器/Chromium 设备上验证安装、standalone、返回键、safe-area、旋转、更新和网络切换，并在最终报告明确设备类型。

- [ ] **Step 7: 提交 Task 6（若有仓库改动）。**

  ```bash
  git add package.json package-lock.json vite.config.ts e2e/pwa-navigation.spec.ts docs/deployment-verification.md
  git commit -m "🧪 test: 补充 PWA 与生产部署验收"
  ```

## 最终全量验收与交付

- [ ] 重新读取本计划和规格，逐条建立完成清单，确认没有遗漏 Must/Should 或 Review Focus。
- [ ] 运行完整命令：`npm run format:check`、`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`、`npm run e2e`、`npm audit`、`npm audit --omit=dev`。
- [ ] 保存 `source-map-js` 依赖路径、生产 bundle 搜索、PWA、设备、生产 HTTP/WebSocket 的实际输出或明确的不可验证原因。
- [ ] 使用 `requesting-code-review` 做最终 whole-branch review；Critical/Important finding 必须在提交前修复并重新验证。
- [ ] 确认 `git status`、分支列表和提交历史：工作区干净、没有 `codex/trade-ui-polish`、提交均使用 gitmoji。

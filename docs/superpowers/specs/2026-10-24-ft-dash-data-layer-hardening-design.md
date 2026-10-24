# FT Dash 数据层重写与运行时可靠性设计

**日期：** 2026-10-24  
**状态：** 已获用户确认，待实施计划审阅  
**范围：** 本次 code review 的全部 Must fix、Should fix，以及 PWA、Freqtrade 版本提示、生产 CDN/反向代理和 `source-map-js` 验证

## 目标

把 FT Dash 的数据访问和机器人会话从 `bot` Pinia store 中拆出，形成一个有明确生命周期、请求代次、刷新就绪状态和写操作互斥的数据层；同时修复已确认的逻辑问题，并用可重复的构建、部署和设备验证证明结果。

本次以仓库已记录的 **Freqtrade 2026.8 / API v2.5** 和 `/api/v1` endpoint 契约为参考，不实现旧版本的 endpoint、字段或响应形状兼容分支。版本不匹配不阻断连接，只显示可能出现问题和错误的提示。

## 已确认的产品约束

- 当前机器人是唯一实时数据源；切换机器人是切换数据源，不是并行轮询。
- 机器人快照只用于切换回来时先画一帧；真实刷新完成前所有写操作必须保持禁用。
- `remember=false` 时密码和 `wsToken` 都不能进入 `localStorage`。
- 清除本机数据必须清除持久化数据和当前 SPA 会话中的内存状态。
- 不创建、不恢复 `codex/trade-ui-polish` 分支；实现直接在当前 `main` 工作树完成。
- 提交使用 gitmoji；不改变用户已经完成的历史提交。
- 不对真实生产机器人执行写操作；生产检查只读。

## 架构

### 数据流

```text
视图 / 组件
    ↓ 调用 Pinia action，读取标准化状态
bot store（UI 投影、错误展示、生命周期入口）
    ↓
BotSession（当前 bot、刷新协调、快照、取消、写锁、stream 生命周期）
    ↓
Freqtrade API client（目标 API v1 的 endpoint 与响应模型）
    ↓
transport（Basic/JWT、超时、AbortSignal、HTTP 错误、JSON 解析）
    ↓
HTTP / WebSocket
```

### 责任边界

- `transport` 只负责请求生命周期和传输错误，不知道页面和 Pinia。
- `Freqtrade API client` 只负责当前目标契约的 endpoint、请求参数和响应解析；不为旧版本保留分支。
- `BotSession` 负责一个活动机器人的完整会话。它拥有 session epoch、每类资源的 request generation、`AbortController`、快照和 action mutex。
- `bot` store 负责把 session 结果暴露成现有页面使用的响应式字段，保留现有公开 action 名称，减少 UI 迁移面。
- `events` store 只接收当前 bot/session 的事件；旧 session 的消息不可进入当前事件列表。
- 纯逻辑问题继续放在纯函数中：K 线标记、CSV 转义、哨兵值显示和请求错误分类不依赖组件实例。
- `MarketView` 与 `LogsView` 只保留页面级 watcher 和 DOM ref；不在模板中隐式派生或启动重复请求。

本次没有必要新增通用 query framework 或重做组件层。现有视图改动属于状态绑定和副作用修正，不满足新增组件的收益门槛。

## 会话与刷新模型

### 请求代次

每次连接、切换、断开和清除数据都会推进 session epoch。每个资源请求还记录自己的 generation。响应只有同时满足以下条件才能提交到状态：

1. session epoch 仍是发起请求时的 epoch；
2. 资源 generation 仍是最新 generation；
3. 当前活动 bot id 与请求所属 bot id 相同。

旧响应仍允许自然结束，但只能被丢弃，不能修改数据、错误、loading、连接状态或刷新锁。

### 刷新就绪与快照门禁

session 将刷新分成核心资源、交易资源和可选资源。切换到有快照的机器人时先恢复快照并标记 `snapshotStale=true`；只有当前 epoch 的核心资源和交易资源都成功完成后，才清除该标记。可选统计、日志和市场资源失败不会把旧数据伪装成全量成功，但不会阻止已确认的核心数据继续显示。

`writesAllowed` 必须同时满足：

- 操作员开启控制并完成风险确认；
- 当前数据不是快照；
- 当前 session 的核心和交易资源已就绪；
- 没有其他写操作占用 mutex。

### 写操作互斥

所有写 endpoint 通过 session 的单一 mutex 执行。新的写操作在已有操作进行时不会覆盖 `actionPending`，而是返回明确的忙碌结果；`finally` 只能释放它自己持有的 token。切换和移除机器人在写操作期间保持现有安全行为，不会把写请求留给另一个机器人。

### 错误聚合

每个资源保留自己的 loading、success timestamp 和 error。批量刷新使用可区分成功与失败的聚合结果，不允许某个成功请求清除其他资源仍然有效的错误，也不允许失败资源继续被误报成全局 online。连接状态由核心资源结果和 transport 错误共同决定。

## Freqtrade 版本策略

- 以 Freqtrade 2026.8 / API v2.5 的 API v1 契约作为唯一实现契约，不维护旧版本 endpoint/字段 fallback。
- 版本比较以 `show_config.version`/`version` 返回的 2026.8 系列和 API 版本 2.5 为参考；补丁版本差异只产生提示，不改变连接策略。
- 连接成功路径尽力调用版本接口；版本接口不存在、被代理拦截或响应无法解析时，仍允许连接，并设置“无法确认版本”的软警告。
- 检测到非目标版本时，仍允许连接，并在连接页和系统页显示检测到的版本、参考契约和可能受影响的功能。
- 软警告不单独禁止写操作；但数据未就绪、快照未刷新或 transport/解析错误仍按数据层安全门禁处理。
- 当前版本允许的可选能力可以降级。例如策略没有信号列时只隐藏信号标记；这不是旧版本响应兼容。
- 不同版本的错误不会静默改写成另一种响应形状。解析失败必须包含 endpoint、HTTP 状态或字段路径，便于诊断。

## 凭据和本机数据

- `serializeBots()` 在 `remember=false` 时移除密码和 `wsToken`；sessionStorage 中的临时凭据仍可供当前标签页使用。
- `addBot()` 的缺省 `wsToken` 是空字符串，不从活动机器人继承。
- 从连接页添加机器人后，settings store 立即将新 bot 设为 active，并让 bot session 连接该 bot。
- 清除本机数据时重置 bots、active bot、凭据、语言偏好、时区、WebSocket 设置、控制权限、通知设置和确认状态；随后 bot session 与 events session 一并清理。

## 纯逻辑与视图修复

- K 线同时识别 `enter_long/exit_long` 和 `enter_short/exit_short`：long 入场/出场分别是 buy/sell，short 入场/出场分别是 sell/buy。
- `MarketView` 使用一次 immediate watcher 初始化交易对和 timeframe；请求用 generation 或 abort cleanup 防止快速切换覆盖当前 loading、错误和数据。
- 带信号 K 线请求仅在当前契约明确表示信号列不支持时降级；网络、认证和 5xx 错误不触发第二次请求。
- `LogsView` 用模板 ref 指向实际滚动容器，开启 follow 且日志追加时滚到底部；关闭 follow 时不抢用户滚动位置。
- CSV 对字符串中以 `=`, `+`, `-`, `@` 开头的值增加 Excel 公式注入防护，同时保留 RFC 引号和换行转义。
- `profit_factor === -100` 在 Dashboard 和 Stats 统一显示 `—`，不作为真实数值参与展示。

## PWA、生产代理和 CDN 验证

### PWA / 设备

构建产物必须验证：

- manifest 的 `start_url`、`scope`、`display=standalone`、图标和 base path 正确；
- service worker、manifest 和静态资源可通过部署 base path 获取；
- API 路径不会被 SPA fallback 或 service worker 当成 HTML 缓存；
- standalone 模式下返回键、safe-area、底栏、横竖屏和页面恢复行为正确；
- 安装后首次启动、更新后刷新、离线静态壳和重新联网行为正确。

若当前环境没有物理手机，报告必须明确写成 Android 模拟器/Chromium 设备验证，不能称为真实物理设备验证。

### CDN / 反向代理

对生产站点和本地产物静态服务器只读检查：

- `index.html`、service worker 和 manifest 的缓存策略适合更新；
- hashed JS/CSS/字体/图标可以长期缓存且 MIME、压缩和内容长度正确；
- API 响应包含正确的 CORS、`Cache-Control: no-store` 和 OPTIONS 行为；
- `Authorization` 不被 CDN 缓存或转发错误污染；
- WebSocket 握手正确转发 `Upgrade`/`Connection`，失败时前端给出明确提示；
- 非 API 路径回退到 `index.html`，API 404/401/5xx 保持原始状态码，不被 SPA 页面吞掉。

## `source-map-js` 处理

先用 `npm ls`、`npm audit --omit=dev` 和生产 bundle 内容确认：

1. 它是否仍是生产依赖路径；
2. 它是否实际进入 JS bundle；
3. 是否存在上游可用升级。

如果只存在于开发工具链，不将开发依赖漏洞误报为运行时漏洞；如果实际进入生产包，则升级上游依赖、替换不必要的 compiler 路径或调整打包方式，并以 bundle 搜索和审计结果作为验收证据。不会通过手工删除锁文件条目掩盖依赖关系。

## 测试与验收

### 单元与组件测试

为每个 Must/Should 修复补充可复现测试，重点覆盖：

- 快照切换在交易刷新完成前拒绝写操作；
- 跨页面/快速 action 只能有一个写请求，旧 `finally` 不会清除新状态；
- 旧 session、旧资源 generation 的成功和失败响应都不会覆盖新数据；
- response body 卡住会超时；
- 清除数据和 `remember=false` 不留控制权限、密码或 ws token；
- 新 bot 激活且不继承旧 token；
- 事件按 bot/session 隔离；
- partial failure、MarketView 快速切换、短线 K 线标记、CSV 公式注入、日志 follow 和 `-100` 哨兵显示。

### 全量验证

```text
npm run format:check
npm run typecheck
npm run lint
npm test
npm run build
npm run e2e
npm audit
npm audit --omit=dev
```

另行检查构建目录中不存在 `source-map-js`、`SourceMapConsumer` 或不应进入生产包的 source-map 运行时代码；若依赖仍以生产路径存在，必须在结果中说明原因和处理结论。

### 完成标准

- 规格中的所有 Must fix 和 Should fix 都有实现和回归测试。
- 连接不会因版本未知或版本不匹配被拒绝，但用户能看到可定位的软警告。
- 所有完整验证命令以新代码重新执行并记录结果。
- 生产 API、CDN、反向代理和 PWA 验证结论区分“已验证”“环境无法验证”和“发现问题”。
- 最终 code review 通过后，使用 gitmoji 提交，不创建额外分支。

## 非目标

- 不实现旧 Freqtrade 版本的兼容分支。
- 不修改生产主机、CDN 或反向代理配置；发现外部配置问题时输出明确修复建议。
- 不引入完整通用缓存框架或重做全部页面组件。
- 不把版本软警告伪装成连接成功的兼容性保证。

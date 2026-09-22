# ft-dash

[![Deploy to GitHub Pages](https://github.com/H-xiaoH/ft-dash/actions/workflows/deploy.yml/badge.svg)](https://github.com/H-xiaoH/ft-dash/actions/workflows/deploy.yml)

[English](README.md) · **简体中文**

面向 [Freqtrade](https://www.freqtrade.io/) 机器人的移动优先、可离线运行的 Web 控制台。
它是一个纯静态的 Vue PWA：浏览器直接与你的机器人 REST API 通信，不需要部署后端，中间也没有
任何第三方。

## 功能

- **总览** — 账户净值、浮动/总/今日盈亏、交易笔数与盈亏比，配每日盈亏柱状图（可按住滑动查看
  每一根柱子）、当前持仓与最近平仓。
- **交易** — 持仓中 / 已平仓 / 全部交易（"全部"会把实时持仓与历史合并）列表，含方向、投入、
  开仓价与当前价、盈亏、持仓时长；表头点击排序，搜索按钮点开才展开，结果过滤（全部 / 盈利 /
  亏损），单笔详情抽屉（订单、手续费、资金费、杠杆、止损、强平价）与 CSV 导出。手机端同一
  数据以卡片列表呈现，不需要横向滚动。
- **统计** — 按交易对的总计，外加胜率（含盈利/亏损笔数）、平均持仓时长、手续费、成交额与最近
  平仓时间（由已加载的成交明细推导，不额外请求接口）；日/周/月收益图表与周期表格；以及平均
  持仓时长。表头点击排序，搜索在当前列表内过滤。
- **市场** — K 线图置顶（按住横向滑动可刮擦，左上角按交易所样式显示该 K 柱的开高低收/涨跌/
  成交量），配交易对选择器与机器人当前周期；下方为白名单、黑名单与生效中的交易锁。
- **日志** — 机器人实时日志，支持最低级别过滤、点开式搜索与自动滚动。
- **系统** — CPU / 内存 / 负载、心跳延迟告警、进程运行时长、生效配置（策略、交易所、交易模式、
  投入模式）以及实时事件带。
- **实时事件** — 由 Freqtrade WebSocket 推送的事件带（入场、成交、撤单、保护机制触发、警告、
  异常），位于系统页。
- **机器人控制** — 暂停/恢复入场、停止、重载配置、市价平仓、编辑黑名单、解除交易锁。默认
  **关闭**，需在设置页显式确认开启；危险操作还会要求输入配对名二次确认。

界面语言：**简体中文** 与 **English**（默认跟随浏览器）。

页面可见时以固定 2 秒节奏刷新（余额、持仓、盈亏、CPU/内存），较重的数据分批拉取——交易与
交易对列表每 8 秒，统计、日志与配置每 24 秒。切换到后台时轮询完全停止，上一轮未返回时会跳过
当前轮次而不是排队堆积。

## 快速开始

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 单元测试（vitest）
npm run e2e          # 端到端测试，跑在生产构建上（playwright）
npm run lint         # eslint
npm run format:check # prettier，加 --write 自动修复
npm run build        # 类型检查 + 生产构建（输出 dist/）
```

端到端套件不会连接真实机器人：它把应用指向一个假的 API 域名，所有请求由
`e2e/support/fixtures.ts` 中的固定数据应答，因此可完全离线运行、不需要任何凭据。首次运行需要
`npx playwright install chromium` 下载浏览器。

打开页面后填写 API 地址、用户名与密码即可。凭据只保存在本机浏览器（localStorage，关闭
"在此设备上记住凭据"后改为 sessionStorage），仅作为 `Authorization` 头发往你填写的 API。

### API 地址

以下写法都会被规范化到 `…/api/v1`：

| 你输入 | 解析结果 |
| --- | --- |
| `bot.example.com` | `https://bot.example.com/api/v1` |
| `https://bot.example.com` | `https://bot.example.com/api/v1` |
| `https://bot.example.com/freqtrade` | `https://bot.example.com/freqtrade/api/v1` |
| `/ft-api` | 相对当前源（本地开发代理，见下） |

### CORS：必须放行你部署所在的来源

浏览器会拒绝调用未放行该来源的 API。把应用所在的来源加入 Freqtrade 配置并重启机器人：

```json
{
  "api_server": {
    "enabled": true,
    "listen_ip_address": "0.0.0.0",
    "listen_port": 8080,
    "username": "your-api-user",
    "password": "a-long-random-password",
    "jwt_secret_key": "a-long-random-string",
    "CORS_origins": ["https://your-name.github.io", "http://localhost:5173"]
  }
}
```

本地开发时把 `http://localhost:5173` 一并加入。若不想放宽 CORS，也可以用开发代理（见
`.env.example`）：把 `VITE_API_BASE_DEFAULT` 设为 `/ft-api`，并在不入库的 `.env.local` 里把
`FT_DEV_PROXY_TARGET` 指向提供 `/api/v1` 的来源。

## 鉴权

两种传输、两套机制，由 Freqtrade 决定各自接受哪一种：

| 传输 | 机制 | 说明 |
| --- | --- | --- |
| REST（`/status`、`/profit`、各类操作） | **HTTP Basic** `Authorization: Basic …` | 始终使用、始终可用。若缓存中的 JWT 被拒（机器人换了 `jwt_secret_key` 重启），该请求会自动改用 Basic 重试，轮询不中断。 |
| `POST /token/login` | **HTTP Basic** | 仅用于签发下面这个 JWT。 |
| WebSocket（`/message/ws`） | **`?token=` 查询参数** | 浏览器无法在 WebSocket 握手中添加 `Authorization` 头，因此 Basic 在此不可用。Freqtrade 接受来自 `/token/login` 的 JWT（需配置 `api_server.jwt_secret_key`）或共享的 `api_server.ws_token`。 |

**实时推送鉴权**在设置页可选，默认 **自动**：

1. **自动（JWT）** — 每次连接向 `/token/login` 换取 15 分钟有效期的 JWT；若该接口不可用（旧版
   Freqtrade、未配置 `jwt_secret_key`）或握手被拒，则在设置了 `ws_token` 时回退使用它。
2. **ws_token** — 直接使用 `api_server.ws_token` 中的共享密钥，适合放在反向代理后面，或不想让
   登录接口接触凭据的场景。
3. **关闭推送** — 只轮询，除实时事件带外一切功能照常。

失败会明确提示而非静默：握手被拒时（Freqtrade 对错误令牌返回 `403`，浏览器看不到关闭码）会
显示"握手被拒绝——令牌无效，或反向代理未转发 Upgrade 请求"，且自动重试在三次后停止，避免坏
配置空转。轮询不受影响，Basic 依然有效。

## 部署到 GitHub Pages

1. 把仓库推送到 GitHub。
2. 在 **Settings → Pages** 中把来源设为 **GitHub Actions**。
3. 推送到 `main`。随附的工作流（`.github/workflows/deploy.yml`）会依次执行 lint、格式检查、
   单元测试、端到端测试、构建（`VITE_BASE=/<仓库名>/`）并发布 `dist/`。

应用使用 hash 路由，所以 `/#/trades` 这类深链在 Pages 上无需 404 重写即可访问。子路径部署由
`VITE_BASE` 处理；用户站点或根域名请用 `VITE_BASE=/` 构建。

## 配置项

构建时无需任何配置。可选环境变量（放在不入库的 `.env.local`，说明见 [`.env.example`](.env.example)）：

| 变量 | 用途 |
| --- | --- |
| `VITE_API_BASE_DEFAULT` | 预填连接页的 API 地址。公开部署建议留空。 |
| `VITE_BASE` | 应用部署的公开路径（Pages 项目页用 `/<仓库>/`，根域名用 `/`）。 |
| `FT_DEV_PROXY_TARGET` | 仅开发用的代理目标，让 `npm run dev` 能访问未放行 `localhost:5173` 的 API。 |

切勿把真实主机、用户名或密码写进仓库：`.env*` 文件已在 gitignore 中。

## 安全说明

- **应用是纯前端的。** 任何能打开页面的人都能看到界面，但没有能通过机器人 Basic 鉴权的凭据
  就读不到任何数据。
- **请使用 HTTPS**，并设置足够长的随机 API 密码。凭据保存在访问者的浏览器里，不在任何服务器上。
- **Freqtrade 会记录 WebSocket 地址**，而令牌只能通过查询参数传递（协议本身没有其他方式），
  因此控制台 URL 会出现在机器人日志中；ft-dash 每次连接都重新申请 JWT 且从不复用，暴露窗口
  仅限该令牌 15 分钟的有效期。
- **接口数据从不进入缓存。** Service Worker 只预缓存应用外壳（HTML/CSS/JS/字体/图标），所有
  `/api/…` 请求一律走网络。
- 机器人控制默认关闭，需在设置页开启；开启后操作会立即作用于真实账户。

## 兼容性

基于 **Freqtrade 2026.8 / API v2.5** 开发，并在实盘 futures 实例上做过端到端验证。它读取
`/ping`、`/show_config`、`/version`、`/health`、`/sysinfo`、`/balance`、`/profit`、
`/profit_all`、`/status`、`/count`、`/trades`、`/performance`、`/stats`、`/daily`、`/weekly`、
`/monthly`、`/logs`、`/whitelist`、`/blacklist`、`/locks` 与 `/pair_candles`；在开启控制功能后
会向 `/start`、`/stop`、`/stopentry`、`/reload_config`、`/forceexit`、`/blacklist` 与
`/locks/delete` 发起请求。

较旧的版本可能缺少个别接口（例如 `/pair_candles` 的列过滤或 `/stats` 的 durations）；对应的
面板会显示错误或保持为空，而不会让应用崩溃。实时推送需要 `api_server.jwt_secret_key`（自动
JWT 方式）或已配置的 `api_server.ws_token`。

## 技术栈

Vue 3（`<script setup>` + TypeScript）· Vite · Pinia · vue-router · vue-i18n · VueUse ·
`vite-plugin-pwa`（Workbox）· ESLint + Prettier · Vitest + Playwright · 手写 SVG 图表，无图表
依赖。

## 目录结构

```
src/
  lib/          API 客户端、格式化、坐标刻度、交易对统计、CSV、存储
  stores/       设置、机器人数据与轮询、实时事件带
  views/        每个页面一个文件
  components/   外壳组件、手写图表、工具栏控件、对话框
  composables/  本地化格式化、Toast、随视口变化的图表高度
  i18n/         简体中文与英文文案
tests/          单元测试（vitest）
e2e/            端到端测试（playwright，全部请求由固定数据应答）
```

## 参与贡献

提交信息遵循 [gitmoji](https://gitmoji.dev/)（`✨ feat:`、`🐛 fix:`、`📝 docs:` …）。提 PR 前请
运行 `npm run lint`、`npm run format:check`、`npm test` 与 `npm run e2e`，CI 跑的是同一套。
新增界面文案必须同时加到 `src/i18n/locales/zh-CN.ts` 与 `src/i18n/locales/en.ts`（两份文案要求
键位完全一致）。参与本项目即视为遵守[行为准则](CODE_OF_CONDUCT.md)。

## 许可证

[MIT](LICENSE)。ft-dash 与 Freqtrade 项目无隶属关系。交易有风险；本软件不提供任何担保，也不
构成投资建议。

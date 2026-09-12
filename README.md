# FT Dash · Freqtrade 美化面板 (PWA)

一个用 **Vue 3 + Vite** 写的 freqtrade 前端面板：深色玻璃拟态 UI、纯 SVG 图表（零图表依赖）、
可安装为 PWA。覆盖主流 freqtrade REST API 接口，包括机器人启停、强制平仓、黑白名单与交易锁管理。

测试环境默认指向 `https://bot.example.com/api/v1`。

---

## 功能

| 页面 | 内容 |
| --- | --- |
| **总览** | 账户总资产、总盈亏、胜率、持仓数；累计盈亏曲线、每日盈亏柱状图、盈亏分布环形图；机器人状态与控制按钮；持仓速览与最近平仓 |
| **交易** | 持仓中 / 历史两个视图；按交易对、标签搜索；按时间、盈亏、交易对、投入排序；历史分页；全部平仓；点击任意交易查看详情抽屉（含订单明细） |
| **K线** | 直连机器人 `pair_candles` 读取实时 K 线（蜡烛图 + 成交量 + 十字光标 + OHLC 提示），支持白名单交易对与时间周期切换、自动刷新，并展示策略附加指标列 |
| **统计** | 盈亏比、最大回撤、夏普/索提诺/Calmar、总交易额；持仓时长分布；退出原因环形图；日/周/月收益曲线与明细表；交易对表现；入场标签 / 出场原因 / 组合表现 |
| **市场** | 白名单（含历史表现，一键加入黑名单）、黑名单增删、交易锁新增/解除、交易对表现排行 |
| **日志** | 级别过滤、关键词搜索、自动刷新、行数限制、一键导出 `.txt`、各级别计数 |
| **系统** | CPU / 内存 / 负载、心跳与运行时长、`show_config` 全量配置、策略列表与策略源码查看 |
| **设置** | 连接信息与切换服务器、主题（深色/浅色/跟随系统）、表格密度、自动刷新间隔、PWA 安装、命令审计记录、清除本地数据 |

其他：

- **PWA**：`manifest` + Workbox Service Worker，可安装到主屏/桌面；**API 请求永不缓存**（`NetworkOnly`），保证数据实时性
- **自绘 SVG 图表**：面积图、柱状图、环形图、蜡烛图全部手写，无 ECharts / Chart.js 依赖
- **认证**：优先 JWT（过期前自动续期），失败自动回退 HTTP Basic；401 自动登出
- **容错**：所有接口并行请求且互不影响，老版本 freqtrade 缺少的接口（如 `/stats`）不会拖垮页面；字段名做了多版本兼容
- **响应式**：桌面侧边栏 + 移动端底部导航（含安全区适配）

---

## 快速开始

```bash
npm install
npm run dev          # http://localhost:5173
```

打开页面后填写：

- **服务器地址**：默认 `/api/v1`（开发服务器已把 `/api` 代理到 `bot.example.com`，无需任何服务端配置）
- **用户名 / 密码**：freqtrade `api_server` 配置里的 `username` / `password`

> 也可以点「直连测试站」填入 `https://bot.example.com/api/v1`，但浏览器直连需要服务端放行 CORS，见下一节。

切换其他机器人：改 `.env`（复制 `.env.example`）里的 `VITE_FT_TARGET`，或直接在登录页填完整地址。

### 为什么默认走 `/api/v1` 而不是完整地址？

浏览器直连 freqtrade 会先发一个带 `Authorization` 的 CORS 预检请求。若你的站点不在
`api_server.CORS_origins` 里，服务器会返回 **`400 Disallowed CORS origin`**，页面无法读取任何数据：

```bash
$ curl -i -X OPTIONS https://bot.example.com/api/v1/profit \
    -H "Origin: http://localhost:5173" \
    -H "Access-Control-Request-Headers: authorization"
HTTP/2 400
Disallowed CORS origin      # ← 就是这里
```

所以本项目用**同源代理**绕开 CORS：浏览器请求 `/api/v1/...`，由 Vite（开发）/ 反向代理（生产）
转发到机器人，同源请求不触发预检。

### 方式一：同源代理（推荐）

**开发环境**：已配置好，无需改动。

**生产环境**：`npm run build` 后把 `dist/` 交给 Web 服务器，并把 `/api` 反代到机器人。

Caddy：

```caddy
dash.example.com {
    root * /var/www/ft-dash
    try_files {path} /index.html
    handle /api/* {
        reverse_proxy 127.0.0.1:8080
    }
}
```

Nginx：

```nginx
server {
    listen 443 ssl;
    server_name dash.example.com;
    root /var/www/ft-dash;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

这样浏览器只发同源请求，不需要在机器人上配置 CORS。

### 方式二：直连 + CORS

前端部署在别处（如静态托管），需要修改机器人配置并**重启**：

```json
"api_server": {
  "enabled": true,
  "CORS_origins": ["https://dash.example.com"],
  "jwt_secret_key": "换成足够长的随机字符串"
}
```

注意：`CORS_origins` **不能带结尾斜杠**，且不支持 `*`（因为请求带凭据）。
然后在登录页填完整地址 `https://bot.example.com/api/v1`。

---

## 部署到 GitHub Pages

仓库自带 `.github/workflows/deploy.yml`：push 到 `main` 后自动跑测试 → 构建 → 发布到 Pages。
构建时会自动把 Vite 的 `base` 设成 `/<仓库名>/`，并把 `dist/index.html` 复制成 `dist/404.html`
作为 SPA 深链接回退（否则直接打开 `/trades` 会 404）。

### ⚠️ Pages 上没有 `/api` 代理，必须先放行 CORS

Pages 是纯静态托管，**没有反向代理**，所以不能用「同源代理」模式。你必须让机器人接受
Pages 的域名，否则页面会一直报「无法连接到服务器」：

```json
"api_server": {
  "enabled": true,
  "CORS_origins": ["https://<你的用户名>.github.io"],
  "jwt_secret_key": "换成足够长的随机字符串"
}
```

改完**重启机器人**。然后在登录页把服务器地址填成完整地址 `https://bot.example.com/api/v1`。

### 关于公开仓库与你的机器人地址

浏览器要直连机器人，**API 地址必然出现在打包后的 JavaScript 里**——任何访问该 Pages 站点的人
都能从网络面板或 bundle 里看到它。把仓库设为公开只是让它更容易被搜到，并不是泄露的根源。
因此：

- 本项目**不会**把任何主机名写进源码，构建时可通过仓库变量注入，见下。
- 你的机器人地址应当被当作**公开信息**来对待。真正的防线是强密码，以及尽可能用
  VPN / 隧道 / IP 白名单限制访问，而不是指望地址保密。

### 可选：让登录页预先填好服务器地址

默认不预填（保持仓库与 bundle 干净）。要预填就在仓库里加一个 **Actions variable**：

```bash
gh variable set FT_BASE --repo <用户名>/<仓库名> --body "https://bot.example.com/api/v1"
```

工作流会把它作为 `VITE_FT_BASE` 传给构建。注意这会让该地址出现在公开的 Pages bundle 中
（反正直连模式下它本来也会出现，只是省去手动输入）。

### 本地验证 Pages 构建

```bash
VITE_BASE=/你的仓库名/ npm run build
cp dist/index.html dist/404.html
npx serve dist      # 或任意静态服务器
```

---

## 安全说明

### 凭据是怎么处理的

- 登录优先走 **JWT**：access token 只存在内存里（15 分钟过期，自动续期），
  **密码从不写入磁盘**。
- 勾选「记住登录状态」时，localStorage 里只保存 **refresh token**（可撤销、会过期），
  而不是密码。refresh token 泄露可以吊销，密码泄露不能。
- 机器人不支持 JWT（老版本）时无法续期，因此**不会持久化任何凭据**，每次重新打开
  页面需要重新登录（页面内的会话不受影响）。
- 退出登录会同时清空内存和 localStorage 中的全部凭据。
- 服务器地址中内嵌的账号密码（`https://user:pass@host`）会被自动剥离，避免被保存、
  显示在设置页或出现在报错信息里。
- 明文 HTTP 连接会在登录页给出警告（局域网自建场景不阻止，只提示）。

### 客户端防护

- **CSP**：生产构建会注入 `Content-Security-Policy`，禁止内联脚本、外部脚本、
  `object/embed`、`base-uri` 劫持与表单劫持（内联样式因组件大量使用 style 属性而放行）。
  `connect-src` 保持宽松，因为 API 地址是运行时用户可填的。
- **不缓存交易数据**：所有 API 请求带 `cache: 'no-store'`，Service Worker 对 `/api`
  使用 `NetworkOnly`——余额、持仓、盈亏不会落到磁盘缓存。
- **无第三方请求**：仅 3 个运行时依赖（Vue / Vue Router / Pinia），无 CDN、无外部字体、
  无统计脚本。
- **无 Cookie**：认证走 `Authorization` 头，`credentials: 'omit'`，因此不存在 CSRF 面。
- 唯一的 `v-html` 在图标组件里，内容来自内置的固定图标表，不接受任何外部输入。

### 部署时请补上这些响应头

`frame-ancestors` 无法通过 `<meta>` 下发，必须由 Web 服务器设置。否则本面板可能被
第三方页面用 iframe 嵌套，诱导点击「停止」「平仓」等按钮（点击劫持）：

```nginx
add_header Content-Security-Policy "frame-ancestors 'none'" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "no-referrer" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

### 其他

- 强烈建议不要把 freqtrade API 直接暴露在公网。优先使用 VPN / SSH 隧道 / 反向代理 + 访问控制。
- **不要**在公用电脑上勾选「记住登录状态」。
- 本面板可以启停机器人、强制平仓、改黑白名单——能打开它的人就等同于能操作账户，请按此标准保护访问入口。

---

## 可用脚本

```bash
npm run dev          # 开发服务器（含 /api 代理）
npm run build        # 生产构建 -> dist/
npm run preview      # 预览生产构建（同样带 /api 代理）
npm run icons        # 重新生成 PWA 图标（纯 Node 手写 PNG 编码，无依赖）
npm run smoke        # 端到端渲染测试（无需浏览器、无需账号）
npm run verify-live  # 用真实账号跑一遍应用自己的请求层 + store，打印派生指标
```

`smoke` 会用假数据接管 `fetch`，然后跑**真实**的 `client.js → endpoints.js → stores → 渲染` 全链路：
9 个页面逐一 SSR 渲染，外加 40 余项针对数据层与轮询契约的断言（信封解包、时间戳单位、日志行格式、
认证与重试、`-100` 哨兵值等）。改完代码先跑它，几秒出结果。

```bash
FT_USER=你的用户名 FT_PASS=你的密码 npm run verify-live   # 看应用算出来的指标
```

---

## 项目结构

```
src/
  api/
    client.js          # 请求层：baseURL 规范化、JWT/Basic 认证、401 续期与重试、错误归一化
    endpoints.js       # freqtrade REST API 封装
  stores/
    auth.js            # 会话与登录状态（持久化）
    bot.js             # 全部机器人数据 + 派生指标（summary/趋势/统计/排行）
    settings.js        # 主题、刷新间隔、表格密度等偏好
    ui.js              # Toast、确认弹窗、命令审计
  composables/
    useBotActions.js   # 所有写操作：确认 -> 调用 -> 记录 -> Toast -> 刷新
    useElementSize.js  # 图表宽度自适应
  components/
    charts/            # 手写 SVG：AreaChart / BarChart / DonutChart / CandleChart
    AppShell.vue       # 侧边栏 + 顶栏 + 移动端底部导航
    TradesTable.vue    # 交易表格（持仓/历史复用）
    TradeDetail.vue    # 交易详情抽屉
  views/               # 9 个页面
  utils/format.js      # 数值/百分比/时间/时长格式化 + 多版本字段兼容取值
scripts/
  generate-icons.mjs   # PWA 图标生成
  smoke-render.mjs     # 端到端渲染 + 数据层断言（fetch 打桩）
  verify-live.mjs      # 真实账号跑应用自身代码并打印派生指标
```

---

## 兼容性说明

freqtrade 各版本的返回结构并不一致，以下差异均已实测并做了归一化处理（见 `src/stores/bot.js`
的 `normalizeResult` 与 `src/utils/format.js`）：

| 差异 | 实际返回 | 处理方式 |
| --- | --- | --- |
| `/trades` | `{trades, trades_count, offset, total_trades}` 信封 | 解包成数组，并用 `total_trades` 做分页 |
| `/daily` `/weekly` `/monthly` | `{data, fiat_display_currency, stake_currency}` | 取 `data`；接口返回**倒序**，图表会反转为时间正序 |
| `/locks` | `{lock_count, locks}` | 取 `locks` |
| `/logs` | `{log_count, logs}`，行格式为 `[日期, 毫秒时间戳, logger, 级别, 消息]` | 解包并同时兼容旧的 `[时间戳, 级别, 消息]` 三段格式 |
| 时间戳 | 新版本返回**毫秒**，旧版本返回秒 | `toEpochSeconds()` 自动判别（阈值 1e11） |
| `/stats` | `durations` 是纯秒数（`{wins: 7764.15}`），且退出原因只有 `wins/losses/draws` | 同时兼容 `{avg,max,min}` 对象形式；总笔数由各原因求和得出 |
| `sortino` / `calmar` | 数据不足时返回哨兵值 `-100` | 显示为 `N/A`，不再打印无意义的 -100 |
| `profit_factor` | 无亏损交易时为 `null` | 显示为 `—` |
| `/strategies` `/available_pairs` | 机器人运行中返回 `503 Bot is not in the correct state.` | 页面显式展示该提示，不影响其他卡片 |
| 盈亏字段 | 同时存在 `profit_ratio`、`profit_pct`、`realized_profit_ratio` 等 | 依次尝试，取不到时由开仓价/当前价推算 |
| `sysinfo` | 只有 `cpu_pct`(每核)、`cpu_avg`、`cpu_load_avg`、`ram_pct`，无 `ram_used/ram_total` | 按核心数画柱状图，内存只显示百分比 |

如果某个接口在你的版本上不存在（返回 404），对应卡片会显示为空而不会让整页报错。

---

## 已知限制

- 浏览器端交易历史分页依赖服务端返回顺序（已用 `order_by_id=false` 让最新交易排在最前）；
  页面内排序仅作用于当前已加载的一页。
- `pair_candles` 只有在机器人运行时才有数据（停止/回测状态下返回为空）。
- 机器人运行中时 `/strategies` 返回 503 属正常现象，需要停止机器人后才能查看策略源码。
- 强制开仓按钮未在 UI 中暴露（需要 `force_entry_enable: true`），但 API 封装已就绪（`api.forceEnter`）。

# 部署与 PWA 验收记录

**验收日期：** 2026-10-24  
**构建参考：** Freqtrade 2026.8 / API v2.5  
**检查范围：** FT Dash 构建产物、本地静态预览、`ft.hxiaoh.cn` 只读 HTTP/WebSocket 行为和 `192.168.5.2` 可达性。

## 依赖与构建产物

- `source-map-js` 已固定为 `1.2.2`，同时覆盖 Vue compiler、jsdom、Vite、vue-i18n 和 vue-router 的依赖路径。
- Vite 已升级为 `8.3.5`；jsdom 已升级为 `30.1.3`，Vitest 已升级为 `5.0.5`。
- `npm audit --json`：0 个漏洞。
- `npm audit --omit=dev --json`：0 个漏洞。
- `npm run build`：通过，使用 Vite 8.3.5。
- `dist` 中没有 `source-map-js`、`SourceMapConsumer` 或 `.map` 文件。
- 默认构建的 manifest 使用 `/`；使用 `VITE_BASE=/kevin/ npm run build:only` 构建时，manifest 的 `start_url` 和 `scope` 均为 `/kevin/`，可以由反向代理挂载到该前缀。

## PWA 与本地静态服务

`e2e/pwa-navigation.spec.ts` 在 Chromium 下 6/6 通过，覆盖：

- manifest 的 `display=standalone`、`start_url`、`scope` 和 192/512 图标；
- service worker 注册并激活；
- `/kevin/api/v1` 形状路径由上游返回 JSON 401 时不会被 app shell 吞掉；
- standalone 页面导航和交易详情返回历史行为。

本地 `vite preview` 的只读头检查结果：

| 路径 | 状态/MIME | 缓存 |
| --- | --- | --- |
| `/` | 200 / `text/html` | `no-cache` |
| `/manifest.webmanifest` | 200 / `application/manifest+json` | `no-cache` |
| `/sw.js` | 200 / `text/javascript` | `no-cache` |
| hashed JS / WOFF2 | 200 / 正确 MIME | 预览服务器为 `no-cache` |

本地预览没有 API 代理：未知 `/kevin/api/v1/*` 会被 Vite preview 回退为 HTML。生产部署必须让 API 代理优先于 SPA fallback；service worker 已使用 `/api/` denylist，能覆盖 `/kevin/api/v1`，但它不能修复服务器端错误路由。

## 生产只读检查

目标：`https://ft.hxiaoh.cn/kevin/api/v1`。请求未携带凭据，也没有执行任何写操作。

已观察到：

- `/kevin/api/v1/` 返回 `404 application/json`，不是 HTML fallback。
- `/kevin/api/v1/status` 返回 `401 application/json`，说明未授权状态码能到达 API。
- API 响应未观察到 `Cache-Control: no-store`；需要在 API/反向代理层补上，避免认证响应被缓存。
- `OPTIONS /kevin/api/v1/status` 携带 `Origin: https://ft.hxiaoh.cn` 返回 `400 Disallowed CORS origin`。若 FT Dash 从其他 origin 提供，必须把真实前端 origin 加入 Freqtrade CORS 白名单；若前端与 API 完全同源，则浏览器同源请求不依赖这条跨域许可。
- WebSocket Upgrade（无凭据、仅使用占位 token）返回 `403`，请求经 Caddy 到达 uvicorn；没有执行成功认证所需的 `101` 检查，因此 Upgrade 是否在已认证连接上完整工作标记为“环境无法验证”。
- `https://ft.hxiaoh.cn/kevin/`、其 manifest 和 `sw.js` 返回的页面标题是 `FreqUI`，不是本仓库 FT Dash 的构建产物。当前 URL 不能作为 FT Dash PWA 的生产验收地址，疑似站点/路径指向了另一套应用。

内网主机 `192.168.5.2`：HTTP 端口可达并由 Caddy 返回 308 到 HTTPS；从当前环境访问 HTTPS 时收到 TLS internal error，无法继续验证主机上的 API、CDN 或 WebSocket 配置。

## 部署建议

1. 将 FT Dash 的实际构建产物挂载到预期路径，并确认 `/manifest.webmanifest`、`/sw.js` 和 hashed assets 不再返回 FreqUI 页面。
2. 在 SPA fallback 之前匹配 `/kevin/api/v1/*`，保持 API 的 401/404/5xx 原始状态和 JSON MIME。
3. 为 API/鉴权响应设置 `Cache-Control: no-store`；hashed assets 可设置长期 immutable 缓存，HTML、manifest 和 service worker 保持可更新。
4. 将实际 FT Dash 前端 origin 加入 CORS 白名单，并确认认证 WebSocket 连接获得 `101 Switching Protocols`。


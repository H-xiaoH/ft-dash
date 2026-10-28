# ft-dash

纯前端 Freqtrade 控制台：Vue 3 + TS + Vite + Pinia + vue-router + vue-i18n，可安装 PWA。
命令、目录、部署、鉴权矩阵见 `README.md`（中文：`README.zh-CN.md`）。领域术语以 `CONTEXT.md` 为准。

## 硬约束

- 接口只走 `src/data/freqtrade`（transport 负责 Basic/JWT、超时、AbortSignal、错误分类）；推送走 `src/lib/stream.ts` 与 `stores/bot.ts`。
- 纯前端：不加后端、不加第三方 API；Service Worker 只缓存应用外壳，`/api/` 一律走网络。
- 写操作必须同时满足 `allowControls` 与 `controlsAcknowledged`；危险操作用交易对名二次确认。
- 文案同时进 `src/i18n/locales/zh-CN.ts` 与 `en.ts`，键位保持一致（`tests/i18n.spec.ts` 会拦）。
- 图表是手写 SVG，不引图表库。
- `inert` 无 polyfill，浏览器下限 iOS Safari 15.5。
- 术语用 `CONTEXT.md` 的词；新概念先补词表。

## 验证 — 由便宜到贵，报「通过」必须带命令与输出

`npm run typecheck` → `npm test`（`tests/**`）→ `npm run lint` → `npm run format:check` → `npm run build` → `npm run e2e`

`npm run e2e` 会先构建再用 Playwright 跑（首次需 `npx playwright install chromium webkit`），只在改 UI / 路由 / PWA 时跑。
会话没有 shell 工具时：把命令和预期交给用户，不声称已验证。

## 工作方式

- 多文件或有行为变化的改动：先写 `.scratch/<slug>/spec.md`（验收标准），再逐项实现；不新建 `docs/superpowers/`。
- 行为改动先加会失败的测试，再实现；提交用 gitmoji（格式参考 git-commit-message）。
- 收尾按 verification-before-completion；独立复审按 requesting-code-review。
- 进行中的计划在 `.scratch/<slug>/`，已完成的规格在 `docs/specs/`，历史结论在 `docs/archive/`。

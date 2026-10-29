# 已完成工作归档

2026-10 期间由 agent 驱动、以计划文件推进的三项工作已全部落地并合并。原始计划与 SDD ledger 已删除，
需要原文时从下列提交取回；结论与证据以本文件为准。

> 这些计划的复选框从未同步（会话结束时停在未勾选状态），**不要**据此判断还有未完成项。

## 1. 2026-10-10 导航壳拆分

- 规格：`docs/specs/app-navigation-split.md`
- 结果：把 `App.vue` 里的桌面 rail 与移动端 tabbar 拆成单根 `AppNavigation.vue`
  （`variant: 'rail' | 'tabbar'`，`rail-wheel` 事件回传），应用壳保留 grid / 页面 track / 过渡。
- 证据：完整单测 136 通过；lint、typecheck、`build:only`、`format:check` 退出 0；
  e2e 87 passed / 1 skipped。最终复审无 Critical，Important 已修复（单根实例、`fetchCandles` 请求代次）。
- 提交：`a70de8c`（拆分导航壳并加固机器人切换）、`a61a82f`（隔离机器人切换并发状态）。

## 2. 2026-10-12 交易界面与交互一致性

- 规格：`docs/specs/trade-ui-polish.md`
- 结果：模态焦点锁改为计数式（`useModalFocus`）、新增 `InlineConfirm` 统一行内确认、
  交易详情用 query 历史项承载返回语义、设置页语言/时区菜单统一、日志时间戳两行、
  提示条内容自适应、市场页视口 flex 布局。
- 证据：随分支 `codex/trade-ui-polish` 合并（`b85b1bb`），后续修复延续到 `74a61e0`。
- 说明：该分支已合并，工作树上不再需要它。

## 3. 2026-10-24 数据层重写与运行时加固

- 设计：`docs/specs/freqtrade-data-layer.md`
- 结果：`src/data/freqtrade/` 拆出 `transport` / `client` / `session`；请求代次、快照、
  写锁与事件隔离就位；凭据按机器人存储且 `remember=false` 时不落 localStorage；
  PWA 更新与生产反向代理行为验证。旧 `src/lib/api.ts` 已删除。
- 证据：提交 `fc0f431`…`33d9de8`；构建与依赖审计、PWA/生产验收见
  `docs/archive/deployment-verification.md`（Freqtrade 2026.9 / API v2.5）。

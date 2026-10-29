# docs

文档按「还活着 / 已结束」分开放。新增文件前先看这张表，别再往根目录堆。

| 位置 | 放什么 | 会不会再改 |
| --- | --- | --- |
| `.scratch/<slug>/` | 进行中的计划与验收标准（`spec.md`）。git 忽略，不进历史 | 会，随工作推进 |
| `docs/specs/` | 已完成并合并的规格：为什么这么设计、边界在哪 | 不改，只追加 |
| `docs/archive/` | 历史结论与验收记录：当时的输出、提交号、证据 | 不改 |
| `docs/images/` | README 的截图（`en/`、`zh/`），由 e2e 固定数据渲染，不用真实账户 | 换了界面再重拍 |

一份工作的落点：写计划 → 做完 → 规格进 `specs/`，结论与证据进 `archive/`，`.scratch/` 里的草稿删掉。

## specs

- [app-navigation-split](specs/app-navigation-split.md) — 把 rail / tabbar 从 `App.vue` 拆成 `AppNavigation.vue`
- [freqtrade-data-layer](specs/freqtrade-data-layer.md) — 数据层重写：transport / client / session 的分层与竞态控制
- [trade-ui-polish](specs/trade-ui-polish.md) — 交易与各页面的手势、滚动边界、提示一致性

## archive

- [completed-work](archive/completed-work.md) — 2026-10 三批工作的结论与提交区间
- [deployment-verification](archive/deployment-verification.md) — 2026-10-24 构建、PWA 与生产环境验收记录

约定细节（术语、验证顺序、提交格式）见仓库根的 `AGENTS.md`；领域词汇见 `CONTEXT.md`。

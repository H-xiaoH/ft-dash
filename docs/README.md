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

- [audit-reliability-fixes](specs/audit-reliability-fixes.md) — 写入口门禁、后台告警、K线刷新与成交区间、表单恢复、未知统计与Safari15.5基础样式

- [trades-zero-all](specs/trades-zero-all.md) — 交易每页条数以0显示全部，占位符说明；正数分页保留

- [settings-display-copy](specs/settings-display-copy.md) — 界面设置合并标题和说明，保留简短字段标签

- [status-labels](specs/status-labels.md) — 顶栏短状态文案，连接优先、未知不推断、交易模式明确展示

- [remove-version-warnings](specs/remove-version-warnings.md) — 移除版本兼容性检测和提示，替代数据层旧规格中的版本软警告

- [dropdown-motion](specs/dropdown-motion.md) — 共用下拉菜单中心缩放、淡入淡出与遮罩虚化，关闭禁用交互

- [foldable-layout](specs/foldable-layout.md) — 主导航与切页以720 CSS px切换，表格独立判断；折叠和手势中断复位

- [desktop-page-motion](specs/desktop-page-motion.md) — 桌面上下紧贴切页，按页面高度共享边界；手机横向不变

- [ratio-guide-copy](specs/ratio-guide-copy.md) — 四项指标说明重写；界面分档与指标局限，中英文同步

- [ui-motion-and-backend-probes](specs/ui-motion-and-backend-probes.md) — 交易与周期展开收起、弹窗进出与背景虚化、响应延迟卡片、下拉后端状态探测

- [app-navigation-split](specs/app-navigation-split.md) — 把 rail / tabbar 从 `App.vue` 拆成 `AppNavigation.vue`
- [freqtrade-data-layer](specs/freqtrade-data-layer.md) — 数据层重写：transport / client / session 的分层与竞态控制
- [trade-ui-polish](specs/trade-ui-polish.md) — 交易与各页面的手势、滚动边界、提示一致性
- [trades-sort-on-phone](specs/trades-sort-on-phone.md) — 交易页手机宽度的排序下拉 + 方向按钮，与桌面列头同一套规则
- [backend-picker](specs/backend-picker.md) — 设置页「后端」改成一个下拉选后端，最后一项「管理后端」展开增删改
- [ratio-guide](specs/ratio-guide.md) — 统计页两块风险磁贴共用的比值说明弹窗（夏普／索提诺／SQN／Calmar 的白话解释与分档）
- [ui-limits-and-auto-retry](specs/ui-limits-and-auto-retry.md) — 设置页「界面」的数量上限、登录先探测、401 回登录页、全自动重试

## archive

- [audit-fixes-verification](archive/audit-fixes-verification.md) — 2026-11-01 审计修复、全量检查与OKX模拟开平仓闭环记录

- [completed-work](archive/completed-work.md) — 2026-10 三批工作的结论与提交区间
- [deployment-verification](archive/deployment-verification.md) — 2026-10-24 构建、PWA 与生产环境验收记录

约定细节（术语、验证顺序、提交格式）见仓库根的 `AGENTS.md`；领域词汇见 `CONTEXT.md`。

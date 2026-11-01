# 项目目录与文档

源码按职责分目录，规格和历史记录集中在 `docs/`。新增文件先按下表选择位置。

| 位置 | 内容 |
| --- | --- |
| `src/data/freqtrade/` | API 传输、客户端与会话管理 |
| `src/views/` | 页面 |
| `src/components/` | 共用组件与手写 SVG 图表 |
| `src/composables/` | Vue 组合式函数 |
| `src/stores/` | 设置、机器人数据和事件状态 |
| `src/lib/` | 格式化、存储、图表计算等通用逻辑 |
| `src/i18n/`、`src/styles/` | 中英文文案、样式与设计变量 |
| `tests/`、`e2e/` | 单元/组件测试、端到端测试与固定数据 |
| `public/` | PWA 图标和其他静态资源 |
| `docs/specs/` | 已完成的规格，说明设计目的和边界；后续变化另写规格 |
| `docs/archive/` | 历史结论、验收结果和证据，保留当时状态 |
| `docs/images/en/`、`docs/images/zh/` | README 截图，由端到端固定数据生成 |
| `.scratch/<slug>/` | 进行中的计划和临时证据，不入库；完成后清理 |

根目录保留 README、领域词表、项目约定、许可证，以及构建工具需要的配置和入口。
`node_modules/`、`dist/`、`test-results/`、`playwright-report/` 和 `coverage/` 都是可重新生成的本地产物，不入库。
本地环境配置也不入库；`.env.example` 是可提交的配置示例。

完成一项工作后，规格放入 `specs/`，需要长期保留的结论放入 `archive/`，补上索引，再清理 `.scratch/` 草稿。
归档记录只描述当时的验证状态，不代表当前版本已经重新验证。

## specs

### 数据、后端与运行可靠性

- [freqtrade-data-layer](specs/freqtrade-data-layer.md) — transport、client、session 分层与竞态控制
- [audit-reliability-fixes](specs/audit-reliability-fixes.md) — 写入口门禁、后台告警、K 线刷新、表单恢复、未知统计与 Safari 15.5 基础样式
- [backend-picker](specs/backend-picker.md) — 后端下拉选择与管理入口
- [ui-limits-and-auto-retry](specs/ui-limits-and-auto-retry.md) — 界面数量上限、登录探测、401 回连接页与自动重试
- [remove-version-warnings](specs/remove-version-warnings.md) — 移除版本兼容性检测与软警告

### 导航、布局与动效

- [page-frame-motion](specs/page-frame-motion.md) — 展开与桌面共用页面窗口，短页和长页同帧贴合切换
- [app-navigation-split](specs/app-navigation-split.md) — 拆分桌面导航与手机底栏
- [desktop-page-motion](specs/desktop-page-motion.md) — 桌面上下切页与共享页面边界
- [foldable-layout](specs/foldable-layout.md) — 720 CSS px 导航切换、表格布局及手势中断复位
- [dropdown-motion](specs/dropdown-motion.md) — 下拉菜单缩放、淡入淡出、背景虚化与关闭时禁用交互
- [ui-motion-and-backend-probes](specs/ui-motion-and-backend-probes.md) — 展开收起、弹窗动画、响应延迟与后端探测

### 交易、统计与界面文案

- [trade-ui-polish](specs/trade-ui-polish.md) — 手势、滚动边界与提示一致性
- [trades-sort-on-phone](specs/trades-sort-on-phone.md) — 手机排序下拉与方向按钮
- [trades-zero-all](specs/trades-zero-all.md) — 每页条数填 0 显示全部，正数保持分页
- [sort-profit-labels](specs/sort-profit-labels.md) — 排序组合去除中间竖线，白名单明确累计已平仓盈亏口径
- [ratio-guide](specs/ratio-guide.md) — 夏普、索提诺、SQN 与 Calmar 的指标说明弹窗
- [ratio-guide-copy](specs/ratio-guide-copy.md) — 指标说明、分档与局限的中英文文案
- [status-labels](specs/status-labels.md) — 顶栏状态、连接优先级与交易模式
- [settings-display-copy](specs/settings-display-copy.md) — 界面设置合并标题和说明

### 项目维护

- [e2e-synchronization](specs/e2e-synchronization.md) — 折叠手势与下拉位置测试等待 resize 和入场动画完成
- [privacy-cleanup](specs/privacy-cleanup.md) — 历史环境与交易明细脱敏，清理本地配置和临时备份
- [readme-screenshots](specs/readme-screenshots.md) — 双语 README 与固定数据截图更新
- [project-layout](specs/project-layout.md) — 目录职责、文档索引和临时产物清理

## archive

- [page-frame-motion-verification](archive/page-frame-motion-verification.md) — 2026-11-02 页面接缝、滚动位置与动画清理验收
- [ui-and-readme-verification](archive/ui-and-readme-verification.md) — 2026-11-01 排序/盈亏口径修复与六张 README 截图验收
- [audit-fixes-verification](archive/audit-fixes-verification.md) — 2026-11-01 审计修复、全量检查与 模拟开平仓记录
- [completed-work](archive/completed-work.md) — 2026-10 三批工作的结论与提交区间
- [deployment-verification](archive/deployment-verification.md) — 2026-10-24 构建、PWA 与生产环境验收记录

项目约定见 [AGENTS.md](../AGENTS.md)，领域词汇见 [CONTEXT.md](../CONTEXT.md)，使用与开发说明见 [中文 README](../README.zh-CN.md) / [English README](../README.md)。

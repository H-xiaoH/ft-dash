# 周期图层与 MD3 迁移复审

2026-11-08，范围为当前未提交迁移代码及近期图表、控件和交易详情改动。按单用户浏览器连接多个 Freqtrade 后端的使用规模审查。

## 改动

总览周期图账户净值折线及数据点置于盈亏柱上方，折线 `z: 3`、柱状 `z: 2`，未更改数据口径。

## 验证

- `npm run typecheck`：退出码 0。
- `npm test`：32 个文件、244 项通过。
- `npm run lint`：退出码 0，无错误或警告。
- `npm run format:check`：`All matched files use Prettier code style!`。
- `npm run build`：退出码 0，生成应用及 PWA 外壳。
- `env -u NO_COLOR npm run e2e -- --workers=2`：163 passed、7 skipped，3.4 分钟；包括 Chromium、WebKit 和展开触屏布局。
- 跳过项为 6 个需显式启用的 README 截图生成用例，以及 1 个受 WebKit 跨源固定响应限制的控制台遍历用例。
- 应用内浏览器读取超时，未完成手动视觉复核；自动化测试不能替代真实 iPhone/PWA 验证。

## 独立复审结论

未发现必须阻止交付的确定性金额或写操作错误。以下问题尚未修改。

1. **P2：K 线历史读数没有等价键盘入口。** `src/components/CandleChart.vue` 的键盘处理只支持缩放和复位，历史 OHLC/成交量依赖十字光标事件。仅用键盘操作范围条时，摘要仍显示最新蜡烛，无法逐根读取历史行情。建议增加左右键选择及同步读数，或提供可访问的历史数据列表，并补回归。
2. **P2：历史净值归桶缺少有效测试。** `src/components/PeriodChart.vue` 包含 UTC 日/周/月边界、采集开始过滤、期内末值和当前期实时净值等金额计算，但没有对应组件测试；端到端固定数据的历史净值始终为空。建议使用乱序、跨日/月、采集开始前采样、缺期及当前期数据，断言各周期输出。
3. **MD3 导航取舍：底栏包含 7 个目的地。** `src/components/AppNavigation.vue` 将全部路由放入底栏，标签为 10px，窄屏空间紧张。[Google 导航指南](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns)建议底栏承载 3–5 个同级目的地。可考虑收敛主要入口并提供次级导航；这是信息架构取舍，不等同于自动化无障碍检查失败。

总体采用标准 MD3 的配色角色、表面、圆角、按钮层级与组件动效，未引入 Expressive 风格。紧凑数据表、等宽数字及已确认的 36px 工具栏属于项目选择。菜单和弹窗过渡与整体风格相符；Vuetify 滑动过渡的位移规则只在 `prefers-reduced-motion: no-preference` 中生效，不能据全局 120ms 时长认定减弱动效失效。

本次未提交、未推送。

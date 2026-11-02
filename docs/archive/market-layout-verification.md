# 市场页布局验收

日期：2026-11-02。规格见 [market-layout](../specs/market-layout.md)。

K 线区域固定图形高度，并为策略信息和信号图例预留空间。请求失败时继续显示灰色闪动占位，十秒后自动重试；已有缓存的刷新失败保留图表。移除最后分析和白名单范围说明，中英文删除对应未使用键。白名单共用一张表，手机也显示三列表头。

回归测试先在旧实现上失败：360px 切换交易对时高度变化约 105px，768/1280px 变化 48px；原页面存在第二份白名单列表。新增断言检查加载、成功、失败与空数据的图表尺寸和白名单位置，360/390/768/1280px 的三列表头与重复项，以及失败占位和自动重试。空数据模拟响应补齐接口必需的 timeframe_ms 字段后验证。

WebKit 冒烟测试原先要求市场页手机端使用卡片，已按三列表格要求更新，仍检查横向溢出。独立复审未发现确定缺陷；按复审建议补测缓存刷新失败后保留图表和元信息、十秒重试。使用本地固定接口数据，不包含真实账户数据；本轮未做 iPhone Mirroring 真机复测。

| 命令 | 输出 |
| --- | --- |
| `npm run typecheck` | 退出 0 |
| `npm test` | 33 files passed，272 passed，退出 0 |
| `npm run lint` | 退出 0 |
| `npm run format:check` | All matched files use Prettier code style! |
| `npm run build` | built，52 项外壳预缓存，退出 0 |
| `npm run e2e -- --workers=2` | 143 passed，7 skipped，退出 0 |
| `git diff --check` | 无输出，退出 0 |

七项跳过为既有六项按需 README 截图生成和一项受跨域模拟响应限制的 WebKit 全路由控制台扫描。

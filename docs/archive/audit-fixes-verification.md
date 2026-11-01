# 审计修复验收记录

日期：2026-11-01。规格：`docs/specs/audit-reliability-fixes.md`。验收后用户另行授权提交部署。

## 本地检查

| 命令 | 输出与结果 |
| --- | --- |
| `npm run typecheck` | 退出0 |
| `npm test` | 33 files passed；260 tests passed |
| `npm run lint` | 退出0 |
| `npm run format:check` | All matched files use Prettier code style! |
| `npm run build` | built；52项应用外壳预缓存 |
| `npm run e2e` | 128 passed，7 skipped，0 failed |
| `git diff --check` | 无输出，退出0 |

跳过项沿用已有规则：6项文档截图生成用例，1项WebKit完整路由控制台遍历（测试桩跨域限制）。新增Safari基础样式用例通过。

行为变更先加失败测试：首轮8项失败后转绿。独立复审又指出含var的未知颜色函数在计算阶段失效，加强CSS用例后确认失败；显式@supports隔离后转绿，复核未发现Critical/Important。

## 用户确认的模拟盘

通过本仓库实际数据层与store连接。控制关闭时stop返回null；控制开关与风险确认开启且数据就绪后才允许写操作。

测试通过实际数据层完成模拟开仓与平仓；具体交易参数、标识和账户信息已移除。

已确认测试交易关闭，未操作测试范围外的交易或更改后端配置。

## 设备边界

最终本机Safari已通过现有本机开发代理连接模拟盘，行情图、交易对切换及测试成交标记可见；测试标签与临时服务已关闭，未保存密码。

本机Safari与Playwright WebKit分开验证；CSS功能禁用测试验证基础样式，不等同于Safari15.5物理设备。没有物理iPhone控制入口，因此iPhone安装、刘海安全区、旋转与离线恢复仍未实测。

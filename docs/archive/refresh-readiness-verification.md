# 剩余刷新等待拆分验收

日期：2026-11-02。规格见 [refresh-readiness](../specs/refresh-readiness.md)。记录提交前的本地验证。

## 结果

health从交易核心组独立，sysinfo归系统组；连接取消ping前置等待，在配置与核心/历史完成后启动轮询和推送。各组共用在途任务，移除全量合并锁；刷新状态由必要资源和token管理。晚到401仍停止轮询并保留鉴权错误优先级。

| 命令 | 输出 |
| --- | --- |
| `npm run typecheck` | 退出 0 |
| `npm test` | 全量测试通过，退出 0 |
| `npm run lint` | 退出 0 |
| `npm run format:check` | All matched files use Prettier code style! |
| `npm run build` | built，52项外壳预缓存，退出 0 |
| `npm run e2e -- --workers=2` | 140 passed，7 skipped，退出 0 |
| `git diff --check` | 无输出，退出 0 |

新增阻塞场景在旧实现上先失败，再验证修复：慢health/sysinfo/统计下连接先完成，核心轮询持续，推送提前启动；已完成资源可再刷，慢资源不重复；旧可选任务完成不能清除新刷新状态；晚到401不能被成功核心刷新覆盖。

原先用于挂起连接的ping测试改为挂起配置请求，保留切换后端、恢复快照及旧响应隔离的测试意图。独立复审发现恢复前先检查旧心跳会误报，新增测试复现后改为在健康请求完成后评估；再次复审未发现新增阻塞问题。

七项跳过仍为六项按需截图生成和一项受跨域模拟响应限制的WebKit全路由控制台扫描。本轮使用固定接口数据，未连接真实后端模拟慢接口。

# 数据独立刷新验收

日期：2026-11-02。规格见 [independent-refresh](../specs/independent-refresh.md)。本记录对应历史整理前的本地验证。

新增测试先在旧实现上复现两项阻塞：心跳未完成时历史/统计未启动，整轮轮询等待核心组。另复现晚到历史成功覆盖鉴权失败，以及同组网络错误掩盖401的混合错误；修复后全量单测通过。

| 命令 | 输出 |
| --- | --- |
| `npm run typecheck` | 退出 0 |
| `npm test` | 33 files passed，264 tests passed |
| `npm run lint` | 退出 0 |
| `npm run format:check` | All matched files use Prettier code style! |
| `npm run build` | built，52 项应用外壳预缓存，退出 0 |
| `npm run e2e -- --workers=2` | 最终构建 139 passed，7 skipped，退出 0 |
| `git diff --check` | 无输出，退出 0 |

独立复审发现的混合错误已修复并再次复审确认。重新审查又补齐跨组组合：核心网络失败、历史401时，连接收尾也必须保留鉴权失败；测试先复现错误，再验证共用错误优先级规则的修复。既有会话切换、旧请求清理、网络恢复、鉴权停止轮询和后台告警测试保留；写操作仍要求核心与历史资源就绪。

七项跳过为六项按需截图生成和一项受跨域模拟响应限制的 WebKit 全路由控制台错误扫描。验证使用固定接口数据，未连接真实后端；验证时尚未提交或部署。

# 后端管理与按钮修整验收

日期：2026-11-02。范围为 d8b52df 之后的工作区改动，规格见 [backend-controls](../specs/backend-controls.md) 和 [market-trades-polish](../specs/market-trades-polish.md)。用户追加授权执行完整测试与 code review，保留不提交、不推送。

规范与需求两路独立复审发现并修复：按钮高度清理误删登录页品牌标记高度（恢复40px方形）；删除后端和排序分隔线的旧端到端断言与新需求不一致（改为命名弹窗与1px分隔线）。术语文档同步新交互。再次复审未发现剩余阻塞项。

新增浏览器覆盖实际鼠标长按拖动、刷新后保留顺序、活动后端不变、方向键排序焦点、手机/桌面标准按钮32px及SVG、删除弹窗文案/Escape取消与焦点恢复、滚动后白名单表头位置。表头位置测量使用实际 sticky 的 th，不使用随表体滚动的 thead 容器。未删除或跳过失败检查。

| 命令 | 输出 |
| --- | --- |
| `npm run typecheck` | 退出 0 |
| `npm test` | 35 files passed，280 passed，退出 0 |
| `npm run lint` | 退出 0 |
| `npm run format:check` | All matched files use Prettier code style! |
| `npm run build` | built，52 项外壳预缓存，退出 0 |
| `npm run e2e -- --workers=2` | 144 passed，7 skipped，退出 0 |
| `git diff --check` | 无输出，退出 0 |

七项跳过为既有六项按需 README 截图生成和一项受跨域模拟响应限制的 WebKit 全路由控制台扫描。所有接口使用固定测试数据，未访问真实后端或执行账户操作；浏览器引擎验证不代表 iPhone Mirroring 真机复测。

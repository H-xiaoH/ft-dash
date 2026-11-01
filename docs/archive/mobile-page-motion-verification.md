# 手机底栏切页验收

日期：2026-11-02。规格见 [mobile-page-motion](../specs/mobile-page-motion.md)。记录本地未提交改动。

点击底栏时，原先的离场样式直接把旧页透明度设为0，和手指拖动时两页同时可见的效果不同。改为普通导航保留旧页，仅滑动完成交接路由时隐藏旧页根节点。正向用例新增旧页可见性断言后在旧实现失败，修复后补齐正反向的接缝与共同位移检查。

| 命令 | 输出 |
| --- | --- |
| `npm run typecheck` | 退出 0 |
| `npm test` | 33 files passed，264 tests passed |
| `npm run lint` | 退出 0 |
| `npm run format:check` | All matched files use Prettier code style! |
| `npm run build` | built，退出 0 |
| `npm run e2e -- --workers=2` | 140 passed，7 skipped，退出 0 |
| `git diff --check` | 无输出，退出 0 |

独立复审核对了滑动交接与宽布局调用路径，未发现阻塞问题。七项跳过仍为六项按需截图生成与一项受跨域模拟响应限制的 WebKit 全路由控制台扫描。

iPhone Mirroring 要求先在手机上解锁，本轮未能完成真机复测。自动化使用固定接口数据；未提交或部署。

## 再次复测

正反向点击各重复三次，共6项通过。完整重跑曾有反向用例仅采到两帧，未进入后续几何断言；该几何测试改用400ms测试时长以保留足够采样，产品时长不变，帧数、可见性与2px阈值保留。

iPhone Mirroring 已能连接并显示 PWA，但旧会话底栏点击尚未生效，不能据此宣称真机切页通过；新版真机结果另行确认。

调整采样时长后的最终完整重跑：`npm run e2e -- --workers=2` 输出140 passed、7 skipped，退出0。

# 页面窗口切换验收

日期：2026-11-02。记录提交前的本地验证，规格见 [page-frame-motion](../specs/page-frame-motion.md)。

## 修复范围

- 展开屏与桌面沿用 720 CSS px 断点，共享视口高度与单条轨道动画；短持仓页切市场、统计切长交易列表均先定位再绘制。
- 总览滚到底后，把离场内容保留在窗口内部的原滚动位置，再同步复位文档；避免先闪回顶部。临时高度不压缩内容，结束后恢复正常滚动。
- 清除旧 resize 保护并停用宽布局的页面根 CSS 位移动画，避免压掉起始位置或在轨道结束后再次滑动。
- WebKit 展开触屏回归纳入正式套件；两次边界读取使用同一轨道时刻，接缝仍要求小于 2px。部分几何用例在测试内放慢动画以增加采样帧，产品时长不变；常规导航用例继续检查产品时长下的行为。

## 验证结果

| 命令 | 输出与结果 |
| --- | --- |
| `npm run typecheck` | 退出 0 |
| `npm test` | 33 files passed；260 tests passed |
| `npm run lint` | 退出 0 |
| `npm run format:check` | All matched files use Prettier code style! |
| `npm run build` | built；52 项应用外壳预缓存 |
| `npx playwright test e2e/foldable.spec.ts --grep 'expanded touch page frames' --workers=1` | 10 passed，退出 0 |
| `npm run e2e -- --workers=1` | 139 passed、7 skipped，退出 0 |
| `git diff --check` | 无输出，退出 0 |

新增用例先复现旧实现的接缝和滚动跳变，再验证修复。完整验证还发现抽屉动画采样在点击等待期间提前耗尽，已改为从抽屉出现开始计时，原位移断言保留。并发重复运行曾出现采样帧不足，最终完整验证使用单 worker，未降低帧数、接缝或跳动阈值。

七项跳过仍为六项按需生成 README 截图，以及一项受跨域模拟响应限制的 WebKit 全路由控制台错误扫描；后者在 Chromium 中执行。

独立复审检查了滚动转移、原生动画与 Vue 回调、减少动态效果、resize 和清理路径；提出的 pending 动画取样保护已补齐。

验证使用固定 API 数据及 Chromium/WebKit 的触屏视口模拟；未进行折叠屏或 iPhone Mirroring 真机复验。

## CI 帧采样

首次推送后的 Actions 中，四项 WebKit 展开用例仅取得 1～2 帧，未达到几何取样的前置条件，部署被阻止。CI 曾改用与本地相同的单 worker，仍有两项 WebKit 用例取样不足，因此恢复原有两个 worker。WebKit 改为在原生动画的 0%、25%、50%、75%、99% 五个时间点同步取样，再从头正常播放；启动位置、2px 几何和清理断言保留。Chromium 继续验证实时帧数和运动过程。

`npx playwright test e2e/foldable.spec.ts --grep 'expanded touch page frames' --workers=2`：10 passed，退出 0。

确定性取样改动后，重新运行类型检查、单元测试、lint、格式检查与构建，均退出 0；`npm run e2e -- --workers=2` 完整套件 139 passed、7 skipped，退出 0。新增首末采样位移大于 100px 的断言，确保不是重复测量静止页面；独立复审未发现阻塞问题。

## 历史整理时的复审

补齐父级 `.page-track` 的原生动画清理断言，同时保留页面自身的残留 CSS 动画检查。原先只检查页面自身，不能覆盖真正承载轨道动画的节点。

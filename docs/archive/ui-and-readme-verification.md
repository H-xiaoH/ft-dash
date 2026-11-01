# 排序、盈亏口径与 README 截图验收

日期：2026-11-01。记录本地工作区的验收结果；这些改动当时尚未提交或部署。

## 排序与盈亏口径

规格：[sort-profit-labels](../specs/sort-profit-labels.md)。交易页排序组合去除中间竖线；市场白名单显示累计已平仓盈亏，明确排除当前持仓。

| 命令 | 输出与结果 |
| --- | --- |
| `npm run typecheck` | 退出 0 |
| `npm test` | 33 files passed；260 tests passed |
| `npm run lint` | 退出 0 |
| `npm run format:check` | All matched files use Prettier code style! |
| `npm run build` | built；52 项应用外壳预缓存 |
| `npm run e2e` | 最终完整重跑 129 passed、7 skipped，退出 0 |
| `git diff --check` | 无输出，退出 0 |

新增断言先在旧实现上失败，再验证修复。首次完整套件有一项原有页面动画断言失败，单独重跑及随后完整重跑均通过；未修改该动画用例。独立复审未发现问题。

## README 与截图

规格：[readme-screenshots](../specs/readme-screenshots.md)。中英文说明同步当前功能与限制，六张图片全部使用测试固定数据。

- `SCREENS=1 ./node_modules/.bin/playwright test e2e/screenshots.spec.ts --project=chromium`：6 passed，退出 0。
- 六张图片逐张检查：中英文概览和市场页各为 1280×900，手机交易页为 390×844。
- 原有标题、代码块和链接目标均保留，本地引用存在。
- `npm run format:check`：All matched files use Prettier code style!；`git diff --check`：退出 0。
- 独立复审指出一处建议语气被强化为必做要求，已恢复为建议。

常规套件的七项跳过为六项按需截图生成，以及一项受跨域模拟响应限制的 WebKit 全路由控制台错误扫描；后者在 Chromium 中执行。

## 提交前复验

完整复验发现折叠触摸测试在 resize 事件处理前发送合成手势，下拉定位测试则在入场缩放结束前记录位置。按 CI 的两个 worker 重跑后，这两项仍失败；补齐对应等待，未改变产品代码或原断言。两个用例各重复三次，共 6 项通过；独立复审未发现问题。规格见 [e2e-synchronization](../specs/e2e-synchronization.md)。

修复后依序重新运行 `npm run typecheck`、`npm test`、`npm run lint`、`npm run format:check`、`npm run build`，均退出 0；单元测试 33 文件、260 项通过。`npm run e2e -- --workers=2` 完整套件 129 passed、7 skipped，退出 0。暂存文件的已知隐私标识与私钥扫描未命中；提交身份按用户选择保留当前 Git 配置。

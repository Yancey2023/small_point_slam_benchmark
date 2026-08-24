# Benchmark Web 工作台

Vue 单页应用和 Node 本地 API 位于同一个可维护边界内：

- `src/components`：选择器、进度面板、轨迹图和性能横向条形图，各组件样式使用 scoped CSS。
- `src/composables`：页面状态和 SSE 生命周期。
- `src/api`：浏览器 API 客户端。
- `shared`：前后端共用的数据契约。
- `server`：manifest 目录、串行任务执行、历史结果扫描、CSV 进度、轨迹与性能统计读取。
- `public/report.json`：由本地 CSV 预计算得到、可直接部署到 GitHub Pages 的静态报告数据。

服务端不会接受任意命令或可执行路径。数据集和算法 ID 必须来自本地 manifest 目录，实际进程参数由服务端根据已发现的清单、默认配置和构建产物组装。

服务会扫描 `results/<dataset>/<algorithm>`（多 bag 数据集会增加 bag 层级）。重启网页服务后不需要重新运行算法，已有完整 CSV 会直接出现在轨迹和性能对比面板。性能指标从结果 CSV 动态生成，除算法处理墙钟时间、算法 CPU 总时间、CPU 占用和内存外，还包括各类传感器消息处理，以及通用 LIO 阶段的平均、P95、最大、累计耗时与调用次数。
性能指标的定义和分组说明由服务端随结果动态返回。界面中的问号支持鼠标悬停、键盘聚焦和触屏点按，不应在组件内按指标 ID 重复维护说明。
总览默认选择算法处理总耗时、算法 CPU 总耗时和峰值常驻内存；阶段耗时默认显示累积值。

常用命令：

```sh
pnpm dev       # 根目录执行，启动 API 与 Vite
pnpm test:web  # 运行 Vitest
pnpm build:web # 类型检查并构建前后端
pnpm start:web # 启动生产服务
```

## 静态报告与 GitHub Pages

静态报告只保留轨迹和性能对比，隐藏数据集/算法运行选择、运行模式和进度面板。轨迹抽样、长度、
边界以及全部性能统计都在生成阶段完成；浏览器只读取 `public/report.json`，不会下载或解析原始
CSV。

在本地结果更新后，从仓库根目录执行：

```sh
pnpm generate:web-report  # results CSV -> frontend/public/report.json
pnpm validate:web-report  # 校验 schema、预计算内容和本地路径泄露
pnpm build:web:static     # 输出 frontend/dist
pnpm export:web:static    # 依次生成数据并构建，适合本地发布前使用
pnpm dev:web:static       # 开发预览，支持前端热更新，不启动 benchmark API
pnpm preview:web:static   # 构建后预览与 Pages 一致的最终产物
```

两个预览命令默认分别使用 Vite 的 `5173` 和 `4173` 端口。修改 Vue/CSS 时使用
`dev:web:static`；发布前使用 `preview:web:static` 检查最终构建结果。报告数据发生变化时先运行
`pnpm generate:web-report`，开发服务器会自动重新加载更新后的 `report.json`。

`report.json` 需要随代码提交，因为 `results/` 按设计不进入 Git，GitHub Actions 也不会重新运行
SLAM 算法。`.github/workflows/web-ci.yml` 同时验证本地工作台和静态页面；
`.github/workflows/pages.yml` 在 `main` 更新后将 `frontend/dist` 部署到 GitHub Pages。仓库的
Pages 发布源需要选择 **GitHub Actions**。

首次启用、工作流触发条件、权限和故障排查见
[GitHub Pages 静态报告文档](../doc/github_pages.md)。

# Benchmark Web 工作台

Vue 单页应用和 Node 本地 API 位于同一个可维护边界内：

- `src/components`：选择器、进度面板、轨迹图和性能横向条形图，各组件样式使用 scoped CSS。
- `src/composables`：页面状态和 SSE 生命周期。
- `src/api`：浏览器 API 客户端。
- `shared`：前后端共用的数据契约。
- `server`：manifest 目录、串行任务执行、历史结果扫描、CSV 进度、轨迹与性能统计读取。

服务端不会接受任意命令或可执行路径。数据集和算法 ID 必须来自本地 manifest 目录，实际进程参数由服务端根据已发现的清单、默认配置和构建产物组装。

服务会扫描 `results/<dataset>/<algorithm>`（多 bag 数据集会增加 bag 层级）。重启网页服务后不需要重新运行算法，已有完整 CSV 会直接出现在轨迹和性能对比面板。性能指标从原始 `timings.csv` 动态生成，除总耗时和 CPU 外，还包括各类传感器消息处理，以及通用 LIO 阶段的平均、中位、P95、最大、累计耗时与调用次数。

常用命令：

```sh
pnpm dev       # 根目录执行，启动 API 与 Vite
pnpm test:web  # 运行 Vitest
pnpm build:web # 类型检查并构建前后端
pnpm start:web # 启动生产服务
```

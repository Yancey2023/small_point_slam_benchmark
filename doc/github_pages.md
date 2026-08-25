# GitHub Pages 静态报告

GitHub Pages 用于公开展示已经完成的 benchmark 结果。它只包含性能、轨迹和精度对比，不提供
用于启动任务的数据集/算法选择、进度监控或取消任务功能，也不需要部署 Node API。

## 数据如何进入网页

本地工作台从 `results/` 下的 CSV 动态读取结果；Pages 不会直接使用这些 CSV。发布前由本地
生成器完成以下工作：

1. 扫描数据集和算法 manifest，发现已有结果。
2. 对轨迹进行抽样，并预先计算轨迹长度和边界。
3. 预先计算性能指标的均值、P95、峰值、累计值和调用次数。
4. 删除本地输出路径，只写入 `frontend/public/report.json`。

`results/` 不进入 Git，因此 GitHub Actions 不会重新运行算法，也无法在 CI 中重新生成报告。
更新 benchmark 结果后，必须在有本地 CSV 的机器上重新生成并提交 `report.json`。

## 首次启用

1. 打开 GitHub 仓库的 **Settings → Pages**。
2. 在 **Build and deployment → Source** 中选择 **GitHub Actions**。
3. 确认仓库允许 GitHub Actions 运行。
4. 推送到 `main`，或在 Actions 页面手动运行 **Deploy GitHub Pages**。

部署工作流使用最小权限：构建阶段只读取仓库，部署阶段使用 `pages: write` 和
`id-token: write` 发布到 `github-pages` environment。静态资源使用相对路径，因此项目 Pages
部署在 `https://<owner>.github.io/<repository>/` 时不需要写死仓库名。

## 更新静态报告

运行算法并确认本地网页结果正确后，在仓库根目录执行：

```sh
pnpm export:web:static
```

该命令依次执行：

- `pnpm generate:web-report`：从本地 CSV 生成预计算的 `frontend/public/report.json`；
- `pnpm validate:web-report`：校验 schema、完整轨迹和性能数据，并检查本地路径泄露；
- `pnpm build:web:static`：生成可发布的 `frontend/dist`。

提交前至少检查：

```sh
git diff --stat frontend/public/report.json
pnpm test:web
pnpm build:web:static
```

`frontend/dist` 是可重复生成的构建产物，不进入 Git；需要提交的是
`frontend/public/report.json` 以及相关前端代码。

## 本地预览

修改 Vue 或 CSS 时使用热更新模式：

```sh
pnpm dev:web:static
```

默认地址为 `http://127.0.0.1:5173`。该命令验证并读取现有 `report.json`，不会启动 benchmark
API。报告数据变化后先运行 `pnpm generate:web-report`，页面会重新加载静态数据。

发布前预览最终构建：

```sh
pnpm preview:web:static
```

默认地址为 `http://localhost:4173`。它会先执行完整静态构建，再通过 Vite Preview 提供与
Pages artifact 相同的文件。

## 工作流说明

### Web CI

文件：`.github/workflows/web-ci.yml`

每次 push 和 pull request 都会执行：

1. 使用 lockfile 安装 pnpm workspace 依赖；
2. 运行前端测试；
3. 构建带本地 API 的工作台；
4. 校验已提交的 `report.json` 并构建静态页面。

该工作流不会发布网页。它保证动态工作台和静态报告两种模式不会互相破坏。

### Deploy GitHub Pages

文件：`.github/workflows/pages.yml`

以下情况会触发部署：

- `main` 上的前端、workspace 配置、lockfile 或 Pages 工作流发生变化；
- 在 Actions 页面通过 `workflow_dispatch` 手动运行。

工作流分为两个 job：

1. `build` 校验并构建静态报告，然后上传 `frontend/dist` Pages artifact；
2. `deploy` 把 artifact 发布到 `github-pages` environment，并记录最终页面地址。

同一时间只保留最新的 Pages 部署，新的提交会取消尚未完成的旧部署。

## 哪些修改会自动部署

推送到 `main` 时，下列路径会触发 Pages：

- `frontend/**`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `.github/workflows/pages.yml`

只修改 C++、算法 patch 或数据集 manifest 不会自动发布，因为这些修改本身不会改变已提交的
静态报告。需要先重新运行相关 benchmark、生成 `report.json`，再提交该文件。

## 常见问题

### 页面没有最新结果

确认 `frontend/public/report.json` 已重新生成并提交。GitHub Actions 不读取本地机器上被忽略的
`results/`。

### 构建提示静态报告为空或版本无效

运行：

```sh
pnpm generate:web-report
pnpm validate:web-report
```

不要手工编辑压缩后的 JSON。schema 变化时应使用当前代码重新生成。

### 页面能打开但资源为 404

确认使用 `pnpm build:web:static`，而不是普通的 `pnpm build:web`。静态模式会生成相对资源
地址并复制 `report.json`，普通构建面向本地 Node API。

### Pages 工作流没有触发

确认提交位于 `main` 且包含上述触发路径；否则在 Actions 页面手动运行
**Deploy GitHub Pages**。

### deploy job 权限失败

确认 Pages 发布源为 **GitHub Actions**，仓库或组织策略允许 Actions 使用 `pages: write` 和
OIDC `id-token: write`，并检查 `github-pages` environment 是否配置了等待审批规则。

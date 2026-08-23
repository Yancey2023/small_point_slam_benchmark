# Small Point SLAM Benchmark

一个不依赖 ROS/ROS2 的 SLAM 基准框架。bag 文件只通过 `rosbag_io` 读取，进入
`core` 后立即转换为本项目自有类型；算法适配层不会接触 ROS 消息、节点、话题或日志接口。

## 当前结构

```text
3rdparty/                 # 本地第三方库，整体不进入 Git
core/                     # 静态公共库：数据、运行、计时、CPU、CSV
datasets/<source>/        # 数据集清单；data/ 不进入 Git
algorithm/<algorithm>/    # 上游信息、配置、Git patch
algorithm_downloads/      # 原始上游仓库，不进入 Git
results/<dataset>/<algo>/ # 原始和分析 CSV，不进入 Git
scripts/                  # 下载、patch、运行、分析、校验
frontend/                 # Vue/Vite 本地 benchmark 工作台
doc/                      # 架构和移植说明
```

目前 core 和算法适配均可独立链接、运行和输出结果；上游仓库 ref 已固定到已核验的 commit，移植差异通过 Git patch 保存。算法和数据集由服务实时扫描 manifest，不需要同步修改前端列表。

当前算法包括 FAST-LIO2、Point-LIO、VoxelMap、VoxelMap (with imu)、Super-LIO、
KISS-ICP、Faster-LIO 和 Small Point LIO。

## 构建 core

先把未开源的 `rosbag_io` 放到 `3rdparty/rosbag_io`。当前开发环境的来源是：

```text
/home/yancey/cpp/navigation/3rdparty/rosbag_io
```

Linux 与 Windows 使用相同的 CMake 流程：

```sh
cmake --preset default
cmake --build --preset default
ctest --test-dir build/default --output-on-failure
```

需要 C++20、CMake 3.24+、yaml-cpp 和 spdlog。项目不查找或链接任何 ROS 包。

## 算法工作流

```sh
python scripts/download_algorithms.py fast_lio
python scripts/patch_algorithms.py apply fast_lio
cmake -S . -B build/algorithms -DSLAM_BENCHMARK_BUILD_ALGORITHMS=ON
cmake --build build/algorithms
```

开发适配时修改忽略目录 `algorithm/fast_lio/source/FAST_LIO`，之后生成 Git patch：

```sh
python scripts/patch_algorithms.py generate fast_lio
python scripts/patch_algorithms.py check fast_lio
```

脚本均用 `pathlib` 与参数数组调用子进程，不依赖 Bash、`cp`、`sed` 等平台命令。

## 运行与分析

每个算法可执行程序遵循统一参数：

```sh
python scripts/run_benchmark.py fast_lio datasets/example/manifest.yaml sequence_01 --run-mode full_speed
python scripts/run_benchmark.py fast_lio datasets/example/manifest.yaml sequence_01 --run-mode realtime
python scripts/analyze_results.py results
```

原始输出包括 `sensor_messages.csv`、`realtime_pose.csv`、
`final_trajectory.csv`、`timings.csv`、`cpu.csv` 和 `summary.csv`。`full_speed` 不等待
bag 时间间隔，用于测吞吐；`realtime` 按消息时间戳节流，用于评估实时 CPU 需求。

## Web 工作台

根目录是 pnpm workspace，网页项目位于 `frontend`。开发模式同时启动 Vite 和本地任务 API：

```sh
pnpm install
pnpm dev
```

打开 `http://127.0.0.1:5173`，即可勾选数据集和算法、查看实时消息进度，并按单个数据集、多种算法查看 XY/XZ/YZ 轨迹投影，以及按指标筛选的性能横向条形图。服务会自动扫描 `results` 并复用之前运行的结果；性能面板除总耗时和 CPU 外，还可以比较各类传感器消息处理，以及通用 LIO 阶段的平均、中位、P95、最大、累计耗时与调用次数。服务默认从
`build/default` 查找算法，找不到时会自动选择 `build` 下最新的同名可执行文件；也可以通过跨平台环境变量
`BENCHMARK_BUILD_DIR` 指定构建目录。

生产构建及本地运行：

```sh
pnpm build:web
pnpm start:web
```

生产服务默认监听 `http://127.0.0.1:4174`。为了保持 CPU 数据可比较，网页任务采用单队列顺序执行。

更完整的接口与移植约束见 [架构说明](doc/architecture.md)、
[算法参数约定](doc/algorithm_parameters.md)、[算法移植指南](doc/porting_algorithms.md)
和 [移植状态](doc/port_status.md)。

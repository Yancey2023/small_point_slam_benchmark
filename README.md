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
doc/                      # 架构和移植说明
```

目前 core、清单和脚本骨架可编译、可测试，上游仓库 ref 已固定到已核验的 commit。四个上游算法的独立可执行程序需要在各自的
ROS-free 移植完成并生成 patch 后启用；仓库不会用假实现冒充算法结果。

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
python scripts/run_benchmark.py fast_lio datasets/example/manifest.yaml sequence_01
python scripts/analyze_results.py results
```

原始输出包括 `sensor_messages.csv`、`realtime_pose.csv`、
`final_trajectory.csv`、`timings.csv`、`cpu.csv` 和 `summary.csv`。

更完整的接口与移植约束见 [架构说明](doc/architecture.md)、
[算法移植指南](doc/porting_algorithms.md) 和 [移植状态](doc/port_status.md)。

# 架构说明

## 依赖边界

`rosbag_io` 是 bag 存储与 ROS wire-format 解码的唯一入口。core 的公开头文件只暴露
`slam_benchmark` 自有类型。ROS1 bag、ROS2 SQLite 和 MCAP 只是输入格式，不代表项目
对 ROS 运行时、头文件、typesupport 或中间件有依赖。

数据流如下：

```text
dataset manifest -> rosbag_io -> unit conversion -> SensorSample -> SlamAlgorithm
                                                        |
ResultSink <- realtime pose / final trajectory / timings |
    |
raw CSV + process CPU / resident-memory samples
```

## core 接口

- `SensorDefinition`：稳定的传感器 ID、类型、话题、内参、畸变、4x4 外参，以及 reader
  从实际 bag 探测到的话题/逐点时间/强度可用性。
- `SensorSample`：纳秒消息时间戳与 `PointCloud/Imu/Image/Gnss/WheelSpeed` variant。
- `PointCloud`：点数据与等长的 `point_time_offset_ns` 数组，时间相对消息时间戳。
- `SlamAlgorithm`：初始化并返回数据集兼容性、按时间顺序处理消息、结束处理。
- `ResultSink`：实时位姿、最终轨迹和任意命名的阶段耗时。
- `BenchmarkRunner`：统计每条消息的 `total` 耗时、周期采样进程 CPU 和常驻内存，并写原始 CSV。

数据单位固定为 m、s、ns、rad/s、m/s²、degree（经纬度）。输入单位在 dataset manifest
中声明并在 reader 边界转换。

## 数据集 manifest

每个 `datasets/<source>/manifest.yaml` 有分享链接及一个或多个 bag。bag 路径相对清单
所在目录解析，因此 Windows 和 Linux 不需要不同版本。每个 bag 的 sensor 条目必须有
唯一 ID 和唯一 topic。

reader 会在算法初始化前读取各配置话题的第一条实际消息。PointCloud2 会检查配置的逐点
时间和强度字段，Livox `CustomMsg` 则提供 `offset_time` 与 `reflectivity`。缺失字段在统一
点云中填零，使不依赖该字段的 LiDAR-only 算法仍可运行；需要去畸变或强度观测的算法会由
`initialize` 返回不兼容，runner 不再读取整包，也不会调用 `process/finalize`。

## CSV

- `sensor_messages.csv`：输入顺序、传感器类型、时间戳、点数或图像字节数。
- `realtime_pose.csv`：算法在线产生的位姿。
- `final_trajectory.csv`：算法 finalize 后产生的最终路径。
- `timings.csv`：算法自报阶段及 core 测得的 `total`、`finalize`。
- `cpu.csv`：单核口径和按逻辑核心数归一化的进程 CPU 百分比，以及常驻内存 MiB。
- `summary.csv`：消息数、墙钟时间、算法 process 墙钟总时间、算法 CPU 总时间、平均 CPU、
  平均/峰值内存、运行模式、`completed/unsupported` 状态和原因。算法 CPU 总时间累计每次
  `process()` 区间内进程所有线程的用户态与内核态 CPU 时间；并行执行时可能大于墙钟时间。

运行模式分为 `full_speed` 与 `realtime`。前者连续读取消息以测量最大吞吐，CPU
占用表示算法主动使用的并行算力，不能脱离总耗时解释；后者按消息时间戳恢复采集节奏，
此时 CPU 占用表示满足实时运行所需的资源，越低越好。

所有姿态四元数顺序为 `x,y,z,w`，平移单位为米。

## 跨平台策略

- 路径使用 `std::filesystem` / `pathlib.Path`。
- 子进程传参数数组，不使用 shell 拼接。
- CPU 时间在 Windows 使用 `GetProcessTimes`，Linux 使用 `getrusage`；常驻内存在
  Windows 使用工作集，在 Linux 读取 `/proc/self/statm`。
- CMake 同时处理 MSVC 与 GCC/Clang；第三方 zstd 的桌面构建没有 `/dev/null` 或 shell patch。

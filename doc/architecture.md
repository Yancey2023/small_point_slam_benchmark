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
raw CSV + process CPU samples
```

## core 接口

- `SensorDefinition`：稳定的传感器 ID、类型、话题、内参、畸变和 4x4 外参。
- `SensorSample`：纳秒消息时间戳与 `PointCloud/Imu/Image/Gnss/WheelSpeed` variant。
- `PointCloud`：点数据与等长的 `point_time_offset_ns` 数组，时间相对消息时间戳。
- `SlamAlgorithm`：初始化、按时间顺序处理消息、结束处理。
- `ResultSink`：实时位姿、最终轨迹和任意命名的阶段耗时。
- `BenchmarkRunner`：统计每条消息的 `total` 耗时、周期采样进程 CPU，并写原始 CSV。

数据单位固定为 m、s、ns、rad/s、m/s²、degree（经纬度）。输入单位在 dataset manifest
中声明并在 reader 边界转换。

## 数据集 manifest

每个 `datasets/<source>/manifest.yaml` 有分享链接及一个或多个 bag。bag 路径相对清单
所在目录解析，因此 Windows 和 Linux 不需要不同版本。每个 bag 的 sensor 条目必须有
唯一 ID 和唯一 topic。

点云必须设置实际点时间字段及单位。缺失该字段会直接报错，不会静默填零，因为填零会
使去畸变性能比较失真。Livox `CustomMsg` 使用 `offset_time`。

## CSV

- `sensor_messages.csv`：输入顺序、传感器类型、时间戳、点数或图像字节数。
- `realtime_pose.csv`：算法在线产生的位姿。
- `final_trajectory.csv`：算法 finalize 后产生的最终路径。
- `timings.csv`：算法自报阶段及 core 测得的 `total`、`finalize`。
- `cpu.csv`：单核口径和按逻辑核心数归一化的进程 CPU 百分比。
- `summary.csv`：消息数、墙钟时间、算法 process 总时间、平均 CPU 和运行模式。

运行模式分为 `full_speed` 与 `realtime`。前者连续读取消息以测量最大吞吐，CPU
占用表示算法主动使用的并行算力，不能脱离总耗时解释；后者按消息时间戳恢复采集节奏，
此时 CPU 占用表示满足实时运行所需的资源，越低越好。

所有姿态四元数顺序为 `x,y,z,w`，平移单位为米。

## 跨平台策略

- 路径使用 `std::filesystem` / `pathlib.Path`。
- 子进程传参数数组，不使用 shell 拼接。
- CPU 时间在 Windows 使用 `GetProcessTimes`，Linux 使用 `getrusage`。
- CMake 同时处理 MSVC 与 GCC/Clang；第三方 zstd 的桌面构建没有 `/dev/null` 或 shell patch。

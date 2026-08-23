# 算法移植状态

上游基线已固定，避免 patch 随默认分支漂移：

| 算法 | commit | 传感器 | 状态 |
|---|---|---|---|
| FAST-LIO | `7cc4175de6f8ba2edf34bab02a42195b141027e9` | LiDAR + IMU | 已移植 |
| Point-LIO | `4b86a469eb5572e70ed575af25b5f15dd06e8e3c` | LiDAR + IMU | 已移植 |
| VoxelMap | `d787ee8ccfb0e509a36adb2c52bd5da97b29c39a` | LiDAR | 已移植 |
| VoxelMap (with imu) | `d787ee8ccfb0e509a36adb2c52bd5da97b29c39a` | LiDAR + IMU | 已移植 |
| Super-LIO | `f89f48dc7aea6cfa262f18e4d03b319e04e0dbd2` | LiDAR + IMU | 已移植 |
| KISS-ICP | `b16835283aee62f7d5e2bdf6c1c3bb2930de74ff` | LiDAR | 已移植 |
| Faster-LIO | `ea0e0910a4cf2da49f569d168442a9c8c1bbe672` | LiDAR + IMU | 已移植 |
| Small Point LIO | `ba8b4ce5bf80df8bbada44b984e12c460b269dd5` | LiDAR + IMU | 已移植 |
| Small Point SLAM | `e24b04452966f24fa221b2558e0ffc6281abdf5d` | LiDAR + IMU | 已移植（私有本地源） |

“已移植”表示存在可从固定上游 commit 重放的 Git patch，且目标不依赖 ROS/ROS2，能独立
链接 `slam_benchmark::core`。实包验证使用 `ACE/Mid-360/ACE实验室门口10hz`。

## 完整构建验证

使用专用 preset 构建全部适配器：

```sh
cmake --preset algorithms
cmake --build --preset algorithms
ctest --preset algorithms
```

`build/algorithms` 中应生成以下九个独立程序：

| 算法 ID | 可执行程序 |
|---|---|
| `fast_lio` | `fast_lio_benchmark` |
| `point_lio` | `point_lio_benchmark` |
| `voxel_map` | `voxel_map_benchmark` |
| `voxel_map_with_imu` | `voxel_map_with_imu_benchmark` |
| `super_lio` | `super_lio_benchmark` |
| `kiss_icp` | `kiss_icp_benchmark` |
| `faster_lio` | `faster_lio_benchmark` |
| `small_point_lio` | `small_point_lio_benchmark` |
| `small_point_slam` | `small_point_slam_benchmark` |

本次完整 Release 构建已确认九个目标均能与当前 core 静态链接，core 的三项测试同时通过。
编译器可能报告来自上游 Eigen、IKFoM、ikd-Tree 或 fmt 的警告；这些警告不影响目标生成，
但不能据此宣称其他编译器或平台已经过验证。

## Small Point SLAM 热路径优化

算法内部仍会精确记录每次阶段调用，但热路径不再为每个点调用系统时钟：x86/x64 使用串行化
TSC，AArch64 使用虚拟计数器，Windows 的其他架构使用 QPC，未知平台回退到
`steady_clock`。

## 资源指标与历史结果

内存指标来自运行期间对当前进程常驻内存的周期采样。算法静态链接 core，因此 core 的资源
监控字段发生变化后，需要重新构建上述程序并重新运行数据集。旧版 `cpu.csv` 如果没有
`resident_memory_mb` 列，前端会继续复用其轨迹、耗时和 CPU 数据，但不会把缺失内存显示为
零值，也无法从旧文件恢复平均或峰值内存。

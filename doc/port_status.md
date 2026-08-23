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

“已移植”表示存在可从固定上游 commit 重放的 Git patch，且目标不依赖 ROS/ROS2，能独立
链接 `slam_benchmark::core`。实包验证使用 `ACE/Mid-360/ACE实验室门口10hz`。

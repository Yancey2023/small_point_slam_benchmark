# 算法移植状态

上游基线已固定，避免 patch 随默认分支漂移：

| 算法 | commit | 当前 ROS 耦合扫描 | 状态 |
|---|---|---:|---|
| FAST-LIO | `7cc4175de6f8ba2edf34bab02a42195b141027e9` | 92 处 | 待移植 |
| Point-LIO | `4b86a469eb5572e70ed575af25b5f15dd06e8e3c` | 101 处 | 待移植 |
| VoxelMap | `d787ee8ccfb0e509a36adb2c52bd5da97b29c39a` | 114 处 | 待移植 |
| Super-LIO | `f89f48dc7aea6cfa262f18e4d03b319e04e0dbd2` | 77 处 | 待移植 |

这里的数字是 C/C++ 文件中 ROS include、类型和调用的初始文本扫描结果，只用于评估改动面，
不等同于 patch 行数。四个 `patchs` 目录当前故意没有伪造 patch；只有真正完成算法数据入口、
参数、日志、输出和阶段计时改造，并通过非 ROS 构建与数据回放后，才应标为已支持。


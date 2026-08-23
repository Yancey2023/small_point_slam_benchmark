# 算法移植指南

每个算法的改动最终只以 `algorithm/<name>/patchs/*.patch` 提交。原始下载树和应用 patch
后的 source 树都在 `.gitignore` 中。

## 必须完成的改动

1. 删除 catkin/ament、ROS/ROS2 头文件、节点、订阅发布、tf、rosbag 和消息生成。
2. 保留算法数学与数据结构，将入口实现为 `slam_benchmark::SlamAlgorithm`。
3. 用 yaml-cpp 从 `initialize` 提供的 config path 读取参数。
4. 用 spdlog 替换 ROS/glog/stdout 日志；删除调试 topic、RViz marker、调试点云发布。
5. 在适配器中接收 core 的统一数据，不再次读取 bag，也不自行改单位。
6. 通过 `ResultSink` 输出在线位姿、最终轨迹和算法特有阶段耗时。
7. 生成 `<algorithm>_benchmark` 可执行程序并链接 `slam_benchmark::core`。

最小入口如下：

```cpp
#include <slam_benchmark/application.hpp>
#include "adapter.hpp"

int main(int argc, char** argv) {
    Adapter algorithm;
    return slam_benchmark::run_benchmark_main(argc, argv, algorithm);
}
```

## 阶段耗时

manifest 中的 `timing_stages` 优先使用跨算法通用名称：`lidar_preprocess`、
`downsampling`、`undistortion`、`state_propagation`、`map_search`、`filter_update` 和
`map_update`。算法内部的 KNN、体素、平面或匹配实现都归入 `map_search`，状态优化归入
`filter_update`。耗时用稳态时钟测量，单位毫秒，并关联当前传感器消息的纳秒时间戳。

## patch 生命周期

```sh
python scripts/download_algorithms.py <name>
python scripts/patch_algorithms.py apply <name>
# 修改 algorithm/<name>/source/<repository>
python scripts/patch_algorithms.py generate <name>
python scripts/patch_algorithms.py check <name>
```

`generate` 使用 `git diff --no-index --binary`，生成标准 Git patch，并把两棵工作目录前缀
归一化成 `a/` 和 `b/`。因此 patch 可直接在上游仓库根目录用 `git apply` 检查和应用。

上游 `ref` 发生变化时，先更新 manifest，再下载新版本并执行 `check`。如果失败，应重新
移植并生成 patch，不应在脚本中加入模糊匹配或静默跳过。

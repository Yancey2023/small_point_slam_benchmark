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

## 保留上游并行语义

移植时必须逐项核对上游计算热路径，不能只看目标是否链接了 TBB 或 OpenMP。上游的并行
匹配、雅可比构建、点云去畸变、子地图构建和后台地图维护都应保留；ROS 的消息分发线程不属于
算法计算并行，benchmark 继续同步调用 `process()`，以保证计时边界清晰且不会积压消息。

原生并行算法统一读取 `parallel_threads`：

- TBB 与 `std::execution::par_unseq` 使用同一生命周期内的 `tbb::global_control`；
- OpenMP 在初始化时关闭动态线程调整，并设置线程上限；
- Ceres 和算法自有线程参数显式传入相同数值；
- 独立的树重建或子地图维护线程可以保留，但必须在文档中说明它不属于计算工作线程池。

不要仅根据依赖或链接关系宣称并行生效。验证时应在真实数据上同时确认热点代码进入并行区、
进程线程峰值符合配置，并完成一次全数据集运行。

## 初始化兼容性

`initialize` 返回 `InitializationResult`。适配器必须在读取配置和构造算法对象之前声明真实
输入要求；缺少传感器或点云字段属于正常的“不兼容”，不能抛异常：

```cpp
slam_benchmark::InitializationResult Adapter::initialize(
    std::span<const slam_benchmark::SensorDefinition> sensors,
    const std::filesystem::path& config_path,
    slam_benchmark::ResultSink& sink) {
    auto compatibility = slam_benchmark::check_dataset_compatibility(
        sensors, {.lidar = true, .imu = true, .point_time = true});
    if (!compatibility) return compatibility;

    // 读取参数并初始化算法。
    return {};
}
```

只使用 LiDAR 的算法不要声明不需要的 IMU/GNSS/逐点时间/强度。需要原始 GNSS 的算法应设置
`.gnss = true`，依赖强度观测的算法应设置 `.intensity = true`。配置损坏、内部不变量失败等
程序错误仍应抛异常，与数据集不兼容区分开。

## 传感器外参

算法配置不得包含固定的 `extrinsic_T`、`extrinsic_R`、`extrinT` 或 `extrinR`。
`initialize` 收到的每个 `SensorDefinition` 都带有 `body_from_sensor`。当上游 LIO 需要
LiDAR 到 IMU 的外参时，使用 `slam_benchmark::target_from_source(imu.calibration,
lidar.calibration)` 计算 `imu_from_lidar`，并通过算法初始化 API 传入，不能修改 YAML
节点来模拟配置。只有 LiDAR 的算法可以直接使用 `body_from_lidar`，但也必须来自同一份
数据集标定。

算法目录下的配置会由 manifest 校验脚本递归检查，出现上述固定外参字段时直接报错。

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
`lidar_preprocess` 与 `downsampling` 都以雷达帧为采集粒度，每帧、每阶段最多上报一次。
`downsampling` 只包含实际点云降采样操作，不得包含排序、坐标变换、缓存准备或完整点云
回调；逐点和逐迭代计时必须先在算法内累积，再按帧上报。

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

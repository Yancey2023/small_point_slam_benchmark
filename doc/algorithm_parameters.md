# 算法参数约定

默认配置使用语义与单位明确的公共字段，避免不同上游项目的同名参数实际作用不同：

| 参数 | 统一语义 |
|---|---|
| `filter_size_scan_m` | 当前雷达帧进入匹配前的体素降采样边长 |
| `filter_size_map_m` | 新点插入地图前的体素降采样边长，仅用于具有独立地图降采样的算法 |
| `map_voxel_size_m` | 哈希或自适应体素地图的空间索引分辨率 |
| `max_iterations` | 算法自身一次状态或配准优化的最大迭代次数 |
| `parallel_threads` | 算法计算阶段允许同时使用的最大工作线程数，必须为正整数 |
| `estimate_extrinsics` | 是否在线估计 LiDAR/IMU 外参 |
| `*_noise` | 算法内部使用的对应测量或随机游走噪声参数 |

`extrinsic_T`、`extrinsic_R`（以及上游常见的 `extrinT`、`extrinR`）不属于算法参数，
禁止写入 `algorithm/<name>/configs/default.yaml`。各传感器相对机体的外参只在数据集
manifest 中维护，由 core 在 `initialize` 阶段随 `SensorDefinition` 提供。LIO 适配器再由
LiDAR 和 IMU 的 `body_from_sensor` 计算 `imu_from_lidar`，通过构造函数或初始化接口直接
交给算法。`estimate_extrinsics` 只控制算法是否在这个初值上进行在线估计。

多数 LIO 算法的扫描降采样默认值为 `0.5 m`。Point-LIO 与 Faster-LIO 使用相同的
参数组合：扫描降采样和地图插入降采样均为 `0.2 m`，地图空间索引分辨率为 `0.5 m`。
三项参数按实际作用分别配置，不能因为数值曾经相同就共用一个字段。

Point-LIO 中，`filter_size_scan_m` 映射到当前帧的 PCL 体素滤波器，
`filter_size_map_m` 映射到新地图点的中心距离筛选，`map_voxel_size_m` 映射到 iVox
的 `resolution_`。因此调整地图插入密度不会再意外改变 iVox 搜索网格的分辨率。

VoxelMap 原项目的 `mapping/voxel_size` 是自适应地图顶层体素尺寸，并不是扫描滤波尺寸；
现在明确映射为 `map_voxel_size_m`。原项目的 `mapping/down_sample_size` 映射为
`filter_size_scan_m`。顶层地图体素仍采用原算法默认的 `1.0 m`，因为其下方还有
`max_layer` 层八叉树，不能与单层哈希地图的分辨率直接等同。

KISS-ICP 的 `voxel_size_m` 同时决定地图体素和其内部两级扫描采样比例，无法与上述两个
独立参数一一对应，因此保留算法专用名称。`max_iterations` 在 KISS-ICP 中是 ICP 上限，
而在 LIO 中通常是滤波器更新上限；比较耗时时应结合实际迭代次数和算法结构解释。

所有真正影响适配器的算法参数都显式写入 `configs/default.yaml`，不再依靠隐藏的 C++
默认值；数据集相关的传感器外参是上述规则的例外。

## 并行线程约定

所有原生并行算法统一使用 `parallel_threads`，默认值为 `4`。TBB、
`std::execution::par_unseq`、OpenMP、Ceres 和算法自己的并行配准都必须由适配器把该值传入
对应运行时，不能按机器逻辑核心数各自决定线程数。根 CMake 变量
`SLAM_BENCHMARK_PARALLEL_THREADS` 只提供编译期默认值；运行时以每个算法 YAML 为准。

`parallel_threads` 限制的是算法计算工作线程。FAST-LIO、COIN-LIO 的 ikd-Tree 重建以及
DLIO 的子地图构建保留上游独立维护线程，因此进程瞬时线程总数可能比该值多一个。Point-LIO、
Small Point LIO 和当前 benchmark 使用的 Small Point SLAM LIO 路径原生为串行实现，不为了
凑齐线程数而增加无意义并行。

## 点云强度与 COIN-LIO

core 提供给算法的每个雷达点都包含位置、相对本帧的逐点时间和原始强度。标准
`sensor_msgs/PointCloud2` 数据必须包含 manifest 中 `intensity_field` 指定的字段；未配置时
默认读取 `intensity`。Livox CustomMsg 的 `reflectivity` 会映射到同一个强度字段。缺少强度
时 reader 会记录该能力缺失；COIN-LIO 在初始化时返回不兼容并由 runner 跳过，避免在全零
强度上静默运行。KISS-ICP 等不依赖强度的算法仍然可以使用同一数据集。

COIN-LIO 的 `intensity_projection` 参数描述算法内部球面强度图的分辨率与视场，不是传感器
外参。适配器根据点的实际三维方向投影，因此可处理没有 ring 字段的点云；如果已知雷达的
精确逐线仰角，也可以在算法配置中用 `elevation_angles_deg` 覆盖均匀仰角模型。LiDAR/IMU
外参仍只来自数据集 manifest，并在算法初始化时传入。
